// Colorful weather icons for the details screen — Meteocons (static "fill" set)
// by Bas Milius, MIT-licensed (github.com/basmilius/weather-icons). Kept SCOPED
// to the weather screen on purpose: the rest of the app still uses lucide. We
// import each SVG as a URL (Vite asset) and render it with <img>, which sidesteps
// the shared gradient-id collisions you'd hit inlining several of them together.
//
// The map is keyed by the same condition buckets as weatherCodeKey() in
// weather.js, so "WMO code → icon" stays a single mental model across both files.
import clearDay from '../assets/weather/clear-day.svg'
import partlyCloudy from '../assets/weather/partly-cloudy-day.svg'
import overcast from '../assets/weather/overcast.svg'
import fog from '../assets/weather/fog.svg'
import drizzle from '../assets/weather/drizzle.svg'
import rain from '../assets/weather/rain.svg'
import snow from '../assets/weather/snow.svg'
import overcastRain from '../assets/weather/overcast-rain.svg'
import thunderstormsRain from '../assets/weather/thunderstorms-rain.svg'
import raindrop from '../assets/weather/raindrop.svg'
import { weatherCodeKey } from './weather.js'

const METEOCON_BY_KEY = {
  clear: clearDay,
  mainlyClear: partlyCloudy,
  cloudy: overcast,
  fog,
  drizzle,
  rain,
  snow,
  showers: overcastRain,
  thunderstorm: thunderstormsRain,
}

// The Meteocons SVG URL for a WMO weather code (falls back to overcast, matching
// weatherCodeKey's own default).
export function meteoconFor(code) {
  return METEOCON_BY_KEY[weatherCodeKey(code)] ?? overcast
}

// Standalone icon for the water-temperature block.
export const waterIcon = raindrop
