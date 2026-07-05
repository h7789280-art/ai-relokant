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
 * so the UI can decide from local time instead.
 * @returns {Promise<{ temp: number|null, feelsLike: number|null, code: number, isDay: boolean|null }>}
 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    timezone: 'auto',
  })
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`)
  if (!res.ok) throw new Error(`weather ${res.status}`)
  const json = await res.json()
  const temp = json.current?.temperature_2m
  const feels = json.current?.apparent_temperature
  const isDay = json.current?.is_day
  return {
    temp: temp == null ? null : Math.round(temp),
    feelsLike: feels == null ? null : Math.round(feels),
    code: json.current?.weather_code ?? 0,
    isDay: isDay == null ? null : isDay === 1,
  }
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
