// Weather + sea-surface temperature for the active city (CLAUDE.md §4.1).
// Open-Meteo — free, no API key required. The Forecast API gives current air
// temperature + a WMO weather code; the Marine API gives water temperature.
// Coordinates come from the active city row (cities.latitude / .longitude).

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'

/**
 * Current air temperature (°C, rounded) and WMO weather code for a point.
 * @returns {Promise<{ temp: number|null, code: number }>}
 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,weather_code',
    timezone: 'auto',
  })
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`)
  if (!res.ok) throw new Error(`weather ${res.status}`)
  const json = await res.json()
  const temp = json.current?.temperature_2m
  return {
    temp: temp == null ? null : Math.round(temp),
    code: json.current?.weather_code ?? 0,
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
