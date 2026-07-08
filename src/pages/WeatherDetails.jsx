// Detailed weather screen (CLAUDE.md §4, screen 1). Reached by tapping the
// weather card on Home. Three blocks: TODAY BY HOUR (horizontal rail), a 10-DAY
// forecast (list), and WATER temperature. Data is Open-Meteo (no key), keyed off
// the active city's coordinates — the same source the Home summary uses, just a
// wider query (fetchWeatherDetails). All timestamps are the city's local time
// (timezone=auto), matching how events/markets treat "today". Built on the same
// routing/layout pattern as Event.jsx / Place.jsx for consistency.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Droplets } from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchCity } from '../lib/content.js'
import { fetchWeatherDetails, fetchSeaTemp, weatherCodeKey } from '../lib/weather.js'
import { meteoconFor, waterIcon } from '../lib/weatherIcons.js'
import i18n from '../i18n/index.js'

// Cities with a bespoke hero photo in public/. Everything else falls back to the
// universal sky, so a city without its own photo NEVER borrows another's (§4).
const CITY_HERO = {
  alanya: '/alanya-hero.png',
}

// Resolve a WMO code to a colorful Meteocons icon (§4). Rendered as an <img> so
// the gradient fills survive and multiple icons don't clash gradient ids.
function WeatherIcon({ code, size = 40 }) {
  return (
    <img
      className="wx-ico"
      src={meteoconFor(code)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  )
}

// Short weekday label ("Mon") in the active language. The very first day is
// labelled "Today" by the caller instead.
function weekdayLabel(dateStr) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(d)
}

// Localized short date ("9 Jul") for the daily rows.
function shortDate(dateStr) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(d)
}

export default function WeatherDetails() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { cityId, selection } = useApp()
  const [state, setState] = useState({ status: 'loading', details: null, sea: null })

  const cityName = selection?.cityName || t('home.weather.title')
  const heroSrc = CITY_HERO[selection?.citySlug] || '/welcome-sky.png'

  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchCity(cityId)
      .then(async (city) => {
        if (!active) return
        if (city?.latitude == null || city?.longitude == null) {
          setState({ status: 'error', details: null, sea: null })
          return
        }
        const { latitude: lat, longitude: lon } = city
        // Water temp is best-effort — never let it sink the whole screen.
        const [details, sea] = await Promise.all([
          fetchWeatherDetails(lat, lon),
          fetchSeaTemp(lat, lon).catch(() => null),
        ])
        if (active) setState({ status: 'ready', details, sea })
      })
      .catch(() => active && setState({ status: 'error', details: null, sea: null }))
    return () => {
      active = false
    }
  }, [cityId])

  // City photo header shared across every state: back button + city name over a
  // photo that feathers into the airy page below it (§4).
  const hero = (
    <div className="wx-hero" style={{ backgroundImage: `url('${heroSrc}')` }}>
      <button
        type="button"
        className="wx-hero__back"
        onClick={() => navigate(-1)}
        aria-label={t('common.back')}
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <div className="wx-hero__text">
        <h1 className="wx-hero__city">{cityName}</h1>
        <p className="wx-hero__subtitle">{t('home.weather.subtitle', { city: cityName })}</p>
      </div>
    </div>
  )

  if (state.status === 'loading') {
    return (
      <main className="app-shell wx">
        {hero}
        <div className="catalog__skeleton catalog__skeleton--row" />
        <div className="catalog__skeleton catalog__skeleton--row" />
      </main>
    )
  }

  if (state.status !== 'ready' || !state.details) {
    return (
      <main className="app-shell wx">
        {hero}
        <p className="catalog__empty">{t('home.weather.unavailable')}</p>
      </main>
    )
  }

  const { hourly, daily } = state.details

  return (
    <main className="app-shell wx">
      {hero}

      {/* Today, hour by hour — horizontal rail of compact hour cards. */}
      {hourly.length > 0 && (
        <section className="wx__section">
          <h2 className="wx__title">{t('home.weather.hourlyTitle')}</h2>
          <div className="wx__hours">
            {hourly.map((h, i) => (
              <div className={`wx-hour${i === 0 ? ' wx-hour--now' : ''}`} key={h.time}>
                <span className="wx-hour__time">
                  {i === 0
                    ? t('home.weather.now')
                    : `${String(h.hour).padStart(2, '0')}:00`}
                </span>
                <WeatherIcon code={h.code} size={40} />
                <span className="wx-hour__temp">{h.temp != null ? `${h.temp}°` : '—'}</span>
                <span className="wx-hour__precip">
                  <Droplets size={11} aria-hidden="true" />
                  {h.precip != null ? `${h.precip}${t('home.weather.percent')}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10-day forecast — one row per day. */}
      {daily.length > 0 && (
        <section className="wx__section">
          <h2 className="wx__title">{t('home.weather.dailyTitle')}</h2>
          <ul className="wx__days">
            {daily.map((d, i) => (
              <li className="wx-day" key={d.date}>
                <span className="wx-day__name">
                  {i === 0 ? t('home.weather.today') : weekdayLabel(d.date)}
                  <span className="wx-day__date">{shortDate(d.date)}</span>
                </span>
                <span className="wx-day__cond">
                  <WeatherIcon code={d.code} size={34} />
                  <span className="wx-day__desc">
                    {t(`home.weather.codes.${weatherCodeKey(d.code)}`)}
                  </span>
                </span>
                <span className="wx-day__temps">
                  <span className="wx-day__max">{d.max != null ? `${d.max}°` : '—'}</span>
                  <span className="wx-day__min">{d.min != null ? `${d.min}°` : '—'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Water temperature — hidden entirely for inland points (Marine model gap). */}
      {state.sea != null && (
        <section className="wx__section">
          <h2 className="wx__title">{t('home.weather.waterTitle')}</h2>
          <div className="wx-water">
            <img
              className="wx-water__icon"
              src={waterIcon}
              width={44}
              height={44}
              alt=""
              aria-hidden="true"
            />
            <div className="wx-water__body">
              <span className="wx-water__temp">{state.sea}°</span>
              <span className="wx-water__label">{t('home.weather.water')}</span>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
