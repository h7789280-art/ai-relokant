// Weather + sea-surface temperature for the active city (CLAUDE.md §4.1).
// Open-Meteo — free, no API key required. The Forecast API gives current air
// temperature + a WMO weather code; the Marine API gives water temperature.
// Coordinates come from the active city row (cities.latitude / .longitude).

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'

/**
 * Current air temperature, "feels like" apparent temperature (both °C, rounded),
 * a WMO weather code, and a day/night flag for a point. `is_day` comes straight
 * from Open-Meteo (1 = daytime at the location, 0 = night) and drives the
 * weather-card background palette; we fall back to `null` when the API omits it
 * so the UI can decide from local time instead. We also return three compact
 * extras for the widget's bottom row: relative humidity (%), wind speed (km/h),
 * and the UV index for the current hour — each `null` when the API omits it.
 * @returns {Promise<{ temp: number|null, feelsLike: number|null, code: number, isDay: boolean|null, humidity: number|null, wind: number|null, uv: number|null }>}
 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    // Humidity + wind live in `current`; UV index does NOT — it's only a
    // forecast field, so we pull it from `hourly` and pick the current hour below.
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m',
    hourly: 'uv_index',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  })
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`)
  if (!res.ok) throw new Error(`weather ${res.status}`)
  const json = await res.json()
  const temp = json.current?.temperature_2m
  const feels = json.current?.apparent_temperature
  const isDay = json.current?.is_day
  const humidity = json.current?.relative_humidity_2m
  const wind = json.current?.wind_speed_10m
  return {
    temp: temp == null ? null : Math.round(temp),
    feelsLike: feels == null ? null : Math.round(feels),
    code: json.current?.weather_code ?? 0,
    isDay: isDay == null ? null : isDay === 1,
    humidity: humidity == null ? null : Math.round(humidity),
    wind: wind == null ? null : Math.round(wind),
    uv: currentHourUv(json),
  }
}

/**
 * Read the UV index for the *current local hour* out of Open-Meteo's hourly
 * arrays — matching `current.time` (truncated to the hour) against `hourly.time`
 * so we report UV *now* rather than the day's peak. Rounded to a whole number
 * (matching the mockup's "UV 9"); null when the field or the hour isn't present.
 */
function currentHourUv(json) {
  const nowHour = json.current?.time?.slice(0, 13) // "YYYY-MM-DDTHH"
  const times = json.hourly?.time
  const values = json.hourly?.uv_index
  if (!nowHour || !Array.isArray(times) || !Array.isArray(values)) return null
  const i = times.findIndex((t) => typeof t === 'string' && t.slice(0, 13) === nowHour)
  const uv = i >= 0 ? values[i] : null
  return uv == null ? null : Math.round(uv)
}

// In-memory cache for the detailed forecast, keyed by rounded coordinates. The
// details screen and any repeat visits (back → forward) reuse a fresh-enough
// payload instead of re-hitting Open-Meteo. Short TTL so the data stays current.
const DETAILS_TTL_MS = 10 * 60 * 1000
const detailsCache = new Map()

/**
 * Detailed forecast for the weather-details screen (CLAUDE.md §4): today's
 * HOURLY forecast (temperature, precipitation probability, WMO code per hour) and
 * a 10-DAY forecast (max/min temperature + WMO code per day). One Forecast API
 * call, `timezone=auto` so all timestamps are in the city's local wall-clock —
 * matching how events/markets treat "today". Cached in-memory (10 min) per point.
 *
 * Returns:
 *   {
 *     hourly: Array<{ time: string, hour: number, temp: number|null,
 *                     code: number, precip: number|null }>,  // remaining hours of TODAY
 *     daily:  Array<{ date: string, code: number,
 *                     max: number|null, min: number|null }>, // up to 10 days, today first
 *   }
 *
 * @returns {Promise<{ hourly: Array, daily: Array }>}
 */
export async function fetchWeatherDetails(lat, lon) {
  const key = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`
  const cached = detailsCache.get(key)
  if (cached && Date.now() - cached.at < DETAILS_TTL_MS) return cached.data

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: '10',
    timezone: 'auto',
  })
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`)
  if (!res.ok) throw new Error(`weather details ${res.status}`)
  const json = await res.json()

  const data = { hourly: parseHourly(json), daily: parseDaily(json) }
  detailsCache.set(key, { at: Date.now(), data })
  return data
}

// Today's hourly forecast, from the current hour onward. Open-Meteo returns hours
// in the city's local time (timezone=auto); we keep only those whose calendar day
// equals `current.time`'s day and whose hour is >= the current hour — i.e. "the
// rest of today", in the city's own clock (the same time basis events/markets use).
function parseHourly(json) {
  const now = json.current?.time // "YYYY-MM-DDTHH:mm"
  const times = json.hourly?.time
  const temps = json.hourly?.temperature_2m
  const codes = json.hourly?.weather_code
  const precip = json.hourly?.precipitation_probability
  if (!now || !Array.isArray(times)) return []
  const nowDay = now.slice(0, 10) // "YYYY-MM-DD"
  const nowHour = now.slice(0, 13) // "YYYY-MM-DDTHH"
  const out = []
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (typeof t !== 'string') continue
    if (t.slice(0, 10) !== nowDay) continue // only today
    if (t.slice(0, 13) < nowHour) continue // from the current hour onward
    const temp = temps?.[i]
    const p = precip?.[i]
    out.push({
      time: t,
      hour: Number(t.slice(11, 13)),
      temp: temp == null ? null : Math.round(temp),
      code: codes?.[i] ?? 0,
      precip: p == null ? null : Math.round(p),
    })
  }
  return out
}

// The 10-day daily forecast (today first). Each entry carries the ISO date, the
// WMO code and rounded max/min air temperatures.
function parseDaily(json) {
  const dates = json.daily?.time
  const codes = json.daily?.weather_code
  const max = json.daily?.temperature_2m_max
  const min = json.daily?.temperature_2m_min
  if (!Array.isArray(dates)) return []
  return dates.map((date, i) => ({
    date,
    code: codes?.[i] ?? 0,
    max: max?.[i] == null ? null : Math.round(max[i]),
    min: min?.[i] == null ? null : Math.round(min[i]),
  }))
}

/**
 * Current sea-surface temperature (°C, rounded). Returns null for inland points
 * the Marine model doesn't cover — the UI simply hides the water reading then.
 * @returns {Promise<number|null>}
 */
export async function fetchSeaTemp(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'sea_surface_temperature',
    timezone: 'auto',
  })
  const res = await fetch(`${MARINE_URL}?${params.toString()}`)
  if (!res.ok) throw new Error(`marine ${res.status}`)
  const json = await res.json()
  const t = json.current?.sea_surface_temperature
  return t == null ? null : Math.round(t)
}

/**
 * Map a WMO weather code to one of our condition keys (see home.weather.codes
 * in the locale files). Buckets the full WMO range into a small, translatable
 * set with matching lucide icons in Home.
 */
export function weatherCodeKey(code) {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2) return 'mainlyClear'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95) return 'thunderstorm'
  return 'cloudy'
}

// The lucide icon name that best pictures each condition key from
// weatherCodeKey(). Kept as a name→name map (not the component) so this module
// stays icon-library-agnostic; the details screen resolves the name to a
// lucide-react component. Single source of truth for "code → icon".
const WEATHER_ICON_BY_KEY = {
  clear: 'Sun',
  mainlyClear: 'CloudSun',
  cloudy: 'Cloud',
  fog: 'CloudFog',
  drizzle: 'CloudDrizzle',
  rain: 'CloudRain',
  snow: 'CloudSnow',
  showers: 'CloudRainWind',
  thunderstorm: 'CloudLightning',
}

/**
 * Map a WMO weather code straight to a lucide-react icon *name* (e.g. 'CloudRain')
 * via weatherCodeKey. Falls back to 'Cloud' for anything unmapped.
 */
export function weatherIconName(code) {
  return WEATHER_ICON_BY_KEY[weatherCodeKey(code)] ?? 'Cloud'
}

/**
 * Map a WMO weather code to one of the eight animated-background groups used by
 * <WeatherBackground>. This is a coarser bucketing than weatherCodeKey (rain and
 * showers merge; freezing variants ride along with their liquid counterparts) so
 * every group can own one pastel gradient + one animation. Unknown codes fall
 * back to a neutral 'overcast' so the card never renders an empty background.
 *
 *   clear       0            — sun / moon + stars
 *   partly      1, 2         — a couple of drifting clouds over sun / moon
 *   overcast    3            — several slow clouds
 *   fog         45, 48       — soft drifting fog layers
 *   drizzle     51–57        — thin, sparse falling drops
 *   rain        61–67, 80–82 — denser falling drops
 *   snow        71–77, 85–86 — slow drifting flakes
 *   thunder     95, 96, 99   — rain + occasional soft flash
 */
export function weatherSkyGroup(code) {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2) return 'partly'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'overcast'
}
