// City home screen (CLAUDE.md §4, screen 1). Clean, airy iOS layout: header
// (brand + active city + notifications), a prominent "Ask CityMate…" bar with
// quick-question chips, a weather + water card, a currency card, and the
// News / Markets / What's-on-today feeds. All feed data is Supabase content,
// scoped to the active city and approved-only (Stage-2 helpers); empty feeds
// fall back to a tidy "nothing yet" placeholder. No date-filter / category
// strip — removed per §4.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Bot,
  Mic,
  ChevronDown,
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Droplets,
  Newspaper,
  Store,
  CalendarDays,
} from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchCity, fetchContent } from '../lib/content.js'
import { fetchWeather, fetchSeaTemp, weatherCodeKey } from '../lib/weather.js'
import { fetchRates } from '../lib/currency.js'
import i18n from '../i18n/index.js'

// WMO condition key → lucide icon (keys produced by weatherCodeKey).
const WEATHER_ICONS = {
  clear: Sun,
  mainlyClear: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  showers: CloudRain,
  thunderstorm: CloudLightning,
}

// Feed query options. Module-scoped so their identity is stable across renders
// (they're used as effect deps in useContentFeed).
const NEWS_OPTS = { limit: 3, order: { column: 'published_at', ascending: false } }
const EVENTS_OPTS = { limit: 3, order: { column: 'starts_at', ascending: true } }
const MARKETS_OPTS = { limit: 3 }

// Small async-state hook for one content feed. Treats errors like "empty" so a
// flaky network never breaks the screen — it just shows the placeholder (§4).
function useContentFeed(table, cityId, opts) {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchContent(table, cityId, opts)
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [table, cityId, opts])
  return state
}

// Currency value formatted in the active language (e.g. "33,21").
function formatRate(value) {
  return new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { selection, cityId } = useApp()

  // --- weather + water (Open-Meteo, keyed off the city's coordinates) --------
  const [weather, setWeather] = useState({ status: 'loading', data: null, sea: null })
  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchCity(cityId)
      .then(async (city) => {
        if (!active) return
        if (city?.latitude == null || city?.longitude == null) {
          setWeather({ status: 'error', data: null, sea: null })
          return
        }
        const { latitude: lat, longitude: lon } = city
        // Water temp is best-effort — never let it sink the whole card.
        const [data, sea] = await Promise.all([
          fetchWeather(lat, lon),
          fetchSeaTemp(lat, lon).catch(() => null),
        ])
        if (active) setWeather({ status: 'ready', data, sea })
      })
      .catch(() => active && setWeather({ status: 'error', data: null, sea: null }))
    return () => {
      active = false
    }
  }, [cityId])

  // --- currency rates --------------------------------------------------------
  const [rates, setRates] = useState({ status: 'loading', rows: [] })
  useEffect(() => {
    let active = true
    fetchRates()
      .then((rows) => active && setRates({ status: 'ready', rows }))
      .catch(() => active && setRates({ status: 'error', rows: [] }))
    return () => {
      active = false
    }
  }, [])

  // --- content feeds ---------------------------------------------------------
  const news = useContentFeed('news', cityId, NEWS_OPTS)
  const markets = useContentFeed('places', cityId, MARKETS_OPTS)
  const events = useContentFeed('events', cityId, EVENTS_OPTS)

  // Quick-question chips (array from i18n).
  const quickQuestions = t('home.quickQuestions', { returnObjects: true })

  // The search bar and chips currently just open the AI chat (§4 — wired to the
  // chat tab for now). The question is handed over via router state so Chat can
  // pick it up once it's built.
  function openChat(question) {
    navigate('/chat', question ? { state: { question } } : undefined)
  }

  const WeatherIcon = weather.data ? WEATHER_ICONS[weatherCodeKey(weather.data.code)] : Cloud

  return (
    <main className="app-shell home">
      {/* Header: brand + active city + notifications bell (§4). */}
      <header className="home__header">
        <div className="home__heading">
          <h1 className="home__brand">{t('appName')}</h1>
          {selection?.cityName && (
            <button
              type="button"
              className="home__city"
              onClick={() => navigate('/profile')}
              aria-label={t('home.changeCity')}
            >
              {selection.cityName}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <button type="button" className="home__bell" aria-label={t('home.notifications')}>
          <Bell size={22} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>

      {/* Prominent "Ask CityMate…" bar — bot icon left, mic right (§4). */}
      <button type="button" className="home__ask" onClick={() => openChat()}>
        <span className="home__ask-bot" aria-hidden="true">
          <Bot size={22} strokeWidth={2} />
        </span>
        <span className="home__ask-text">{t('home.askPlaceholder')}</span>
        <span className="home__ask-mic" aria-hidden="true">
          <Mic size={20} strokeWidth={2} />
        </span>
      </button>

      {Array.isArray(quickQuestions) && quickQuestions.length > 0 && (
        <div className="home__chips">
          {quickQuestions.map((q) => (
            <button
              key={q}
              type="button"
              className="home__chip"
              onClick={() => openChat(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Weather + water and currency, side by side on wider screens. */}
      <div className="home__row">
        <section className="home-card weather-card">
          {weather.status === 'loading' ? (
            <p className="home-card__muted">{t('common.loading')}</p>
          ) : weather.status === 'error' || !weather.data ? (
            <p className="home-card__muted">{t('home.weather.unavailable')}</p>
          ) : (
            <>
              <div className="weather-card__main">
                <WeatherIcon size={40} strokeWidth={1.6} aria-hidden="true" />
                <span className="weather-card__temp">{weather.data.temp}°</span>
              </div>
              <p className="weather-card__cond">
                {t(`home.weather.codes.${weatherCodeKey(weather.data.code)}`)}
              </p>
              {weather.sea != null && (
                <p className="weather-card__water">
                  <Droplets size={15} aria-hidden="true" />
                  {t('home.weather.water')} {weather.sea}°
                </p>
              )}
            </>
          )}
        </section>

        <section className="home-card currency-card">
          <h2 className="home-card__title">{t('home.currency.title')}</h2>
          {rates.status === 'loading' ? (
            <p className="home-card__muted">{t('common.loading')}</p>
          ) : rates.status === 'error' || rates.rows.length === 0 ? (
            <p className="home-card__muted">{t('home.currency.unavailable')}</p>
          ) : (
            <ul className="currency-card__list">
              {rates.rows.map((r) => (
                <li key={r.code} className="currency-card__row">
                  <span className="currency-card__code">{r.code}</span>
                  <span className="currency-card__value">{formatRate(r.perTry)} ₺</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Today feeds — all Supabase, city-scoped, approved-only (§4, §5). */}
      <Feed
        icon={Newspaper}
        title={t('home.news.title')}
        feed={news}
        empty={t('home.empty')}
        renderItem={(row) => (
          <li key={row.id} className="feed__item">
            <span className="feed__item-title">{row.title}</span>
            {row.summary && <span className="feed__item-sub">{row.summary}</span>}
          </li>
        )}
      />

      <Feed
        icon={Store}
        title={t('home.markets.title')}
        feed={markets}
        empty={t('home.empty')}
        renderItem={(row) => (
          <li key={row.id} className="feed__item">
            <span className="feed__item-title">{row.name}</span>
            {row.address && <span className="feed__item-sub">{row.address}</span>}
          </li>
        )}
      />

      <Feed
        icon={CalendarDays}
        title={t('home.events.title')}
        feed={events}
        empty={t('home.empty')}
        renderItem={(row) => (
          <li key={row.id} className="feed__item">
            <span className="feed__item-title">{row.title}</span>
            {row.location && <span className="feed__item-sub">{row.location}</span>}
          </li>
        )}
      />
    </main>
  )
}

// One "today" feed section: titled header + list, or a placeholder when empty.
function Feed({ icon, title, feed, empty, renderItem }) {
  // Local (not a destructured arg) so the uppercase varsIgnorePattern covers it
  // — JSX-only usage isn't tracked by the lint config (see TabBar).
  const Icon = icon
  return (
    <section className="feed">
      <div className="feed__head">
        <Icon className="feed__icon" size={18} strokeWidth={2} aria-hidden="true" />
        <h2 className="feed__title">{title}</h2>
      </div>
      {feed.status === 'loading' ? (
        <div className="feed__list">
          <div className="feed__skeleton" />
          <div className="feed__skeleton" />
        </div>
      ) : feed.rows.length === 0 ? (
        <p className="feed__empty">{empty}</p>
      ) : (
        <ul className="feed__list">{feed.rows.map(renderItem)}</ul>
      )}
    </section>
  )
}
