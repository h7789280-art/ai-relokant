// Code-drawn, animated background for the home weather card (CLAUDE.md §4 — a
// clean, airy iOS look). Everything here is CSS gradients + light CSS/SVG
// animation: no images, no animation libraries, nothing to download. The look
// reacts to the live weather (one of eight WMO groups, see weatherSkyGroup) and
// to day / night. Motion is opacity/transform-only and is fully disabled under
// prefers-reduced-motion (handled in global.css) so it stays cheap on weak
// phones and respectful of accessibility. Palettes live in global.css keyed off
// the `weather-bg--<group>` / `--day` / `--night` classes, so tweaking a colour
// never touches this file.
import { weatherSkyGroup } from '../lib/weather.js'

// Static particle layouts. Deterministic (no Math.random at render time) so the
// scene never re-shuffles between renders and stays perfectly stable. Values are
// percentages / seconds chosen by hand for an even, unhurried spread.
const RAIN_DROPS = [
  { left: 6, delay: 0, dur: 0.9 },
  { left: 15, delay: 0.5, dur: 1.05 },
  { left: 23, delay: 0.2, dur: 0.85 },
  { left: 32, delay: 0.8, dur: 1.0 },
  { left: 40, delay: 0.35, dur: 0.95 },
  { left: 49, delay: 0.1, dur: 1.1 },
  { left: 57, delay: 0.6, dur: 0.9 },
  { left: 65, delay: 0.25, dur: 1.0 },
  { left: 73, delay: 0.75, dur: 0.88 },
  { left: 81, delay: 0.4, dur: 1.05 },
  { left: 89, delay: 0.15, dur: 0.92 },
  { left: 95, delay: 0.65, dur: 1.0 },
]

// Drizzle: fewer, slower, thinner drops than rain.
const DRIZZLE_DROPS = [
  { left: 12, delay: 0, dur: 1.6 },
  { left: 28, delay: 0.7, dur: 1.8 },
  { left: 42, delay: 0.3, dur: 1.7 },
  { left: 58, delay: 1.0, dur: 1.9 },
  { left: 71, delay: 0.5, dur: 1.6 },
  { left: 86, delay: 0.2, dur: 1.8 },
]

const SNOW_FLAKES = [
  { left: 8, delay: 0, dur: 6.5, drift: 8 },
  { left: 19, delay: 1.5, dur: 7.5, drift: -6 },
  { left: 30, delay: 0.6, dur: 6.0, drift: 10 },
  { left: 41, delay: 2.2, dur: 8.0, drift: -8 },
  { left: 52, delay: 1.0, dur: 7.0, drift: 7 },
  { left: 63, delay: 3.0, dur: 6.5, drift: -9 },
  { left: 74, delay: 0.3, dur: 7.8, drift: 6 },
  { left: 85, delay: 1.8, dur: 6.2, drift: -7 },
  { left: 93, delay: 2.6, dur: 7.4, drift: 9 },
]

const STARS = [
  { left: 14, top: 22, delay: 0, size: 2 },
  { left: 30, top: 14, delay: 1.1, size: 3 },
  { left: 44, top: 30, delay: 0.5, size: 2 },
  { left: 58, top: 18, delay: 1.8, size: 2 },
  { left: 68, top: 34, delay: 0.9, size: 3 },
  { left: 80, top: 20, delay: 1.4, size: 2 },
  { left: 88, top: 40, delay: 2.2, size: 2 },
  { left: 22, top: 42, delay: 2.6, size: 2 },
]

// Cloud layouts per group. `top`/`scale` place them; `dur`/`delay` set the slow
// cross-drift. Overcast gets more, lower, larger clouds than partly.
const PARTLY_CLOUDS = [
  { top: 20, scale: 0.9, dur: 34, delay: 0 },
  { top: 46, scale: 0.7, dur: 42, delay: -12 },
]
const OVERCAST_CLOUDS = [
  { top: 10, scale: 1.1, dur: 38, delay: 0 },
  { top: 34, scale: 0.85, dur: 30, delay: -8 },
  { top: 30, scale: 1.0, dur: 46, delay: -20 },
  { top: 56, scale: 0.75, dur: 34, delay: -14 },
]

// A single soft cloud shape. Fill/opacity come from CSS so day and night clouds
// can differ without duplicating the SVG.
function Cloud() {
  return (
    <svg className="weather-bg__cloud-svg" viewBox="0 0 100 56" aria-hidden="true">
      <path d="M24 46 Q9 46 9 33 Q9 21 24 22 Q28 8 45 11 Q61 6 65 23 Q82 21 84 35 Q85 46 71 46 Z" />
    </svg>
  )
}

export default function WeatherBackground({ code, isDay }) {
  const group = weatherSkyGroup(code)
  // isDay may be null (API omitted it) — fall back to local hour so the palette
  // still flips at night. 6:00–19:59 counts as day.
  const day = isDay == null ? new Date().getHours() >= 6 && new Date().getHours() < 20 : isDay
  const showSky = group === 'clear' || group === 'partly'
  const clouds =
    group === 'partly' ? PARTLY_CLOUDS : group === 'overcast' ? OVERCAST_CLOUDS : null
  const drops = group === 'rain' || group === 'thunder' ? RAIN_DROPS : group === 'drizzle' ? DRIZZLE_DROPS : null

  return (
    <div
      className={`weather-bg weather-bg--${group} weather-bg--${day ? 'day' : 'night'}`}
      aria-hidden="true"
    >
      {/* Sun (day) or moon + stars (night) for clear / partly skies. */}
      {showSky && day && (
        <span className="weather-bg__sun">
          <span className="weather-bg__rays" />
        </span>
      )}
      {showSky && !day && <span className="weather-bg__moon" />}
      {showSky && !day && (
        <div className="weather-bg__stars">
          {STARS.map((s, i) => (
            <span
              key={i}
              className="weather-bg__star"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Drifting clouds (partly / overcast). */}
      {clouds && (
        <div className="weather-bg__clouds">
          {clouds.map((c, i) => (
            <span
              key={i}
              className="weather-bg__cloud"
              style={{
                top: `${c.top}%`,
                animationDuration: `${c.dur}s`,
                animationDelay: `${c.delay}s`,
                '--cloud-scale': c.scale,
              }}
            >
              <Cloud />
            </span>
          ))}
        </div>
      )}

      {/* Fog: a few soft horizontal layers gliding sideways. */}
      {group === 'fog' && (
        <div className="weather-bg__fog">
          <span className="weather-bg__fog-layer" style={{ top: '28%' }} />
          <span className="weather-bg__fog-layer" style={{ top: '50%', animationDelay: '-6s' }} />
          <span className="weather-bg__fog-layer" style={{ top: '70%', animationDelay: '-12s' }} />
        </div>
      )}

      {/* Falling precipitation: rain, drizzle, or thunder's rain. */}
      {drops && (
        <div className={`weather-bg__precip weather-bg__precip--${group === 'drizzle' ? 'drizzle' : 'rain'}`}>
          {drops.map((d, i) => (
            <span
              key={i}
              className="weather-bg__drop"
              style={{
                left: `${d.left}%`,
                animationDuration: `${d.dur}s`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Snow: slow, gently swaying flakes. */}
      {group === 'snow' && (
        <div className="weather-bg__precip weather-bg__precip--snow">
          {SNOW_FLAKES.map((f, i) => (
            <span
              key={i}
              className="weather-bg__flake"
              style={{
                left: `${f.left}%`,
                animationDuration: `${f.dur}s`,
                animationDelay: `${f.delay}s`,
                '--drift': `${f.drift}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* Thunder: the rain above plus an occasional soft full-card flash. */}
      {group === 'thunder' && <span className="weather-bg__flash" />}

      {/* Contrast scrim: a soft wash under the text so temperature / "feels like"
          / water stay legible over any gradient (light lift on day, dark on
          night). Kept subtle so the scene still shows through. */}
      <span className="weather-bg__scrim" />
    </div>
  )
}
