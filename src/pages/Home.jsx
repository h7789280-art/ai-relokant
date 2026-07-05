// City home screen (CLAUDE.md §4, screen 1). Premium, airy iOS layout: a
// full-bleed city hero (brand + active city + notifications) with the "Ask
// CityMate…" bar overlapping its base, icon quick-chips, a weather + water card,
// a currency card, and the News / Markets / What's-on-today feeds rendered as
// horizontally scrollable card rails. All feed data is Supabase content, scoped
// to the active city and approved-only (Stage-2 helpers); empty feeds fall back
// to a tidy "nothing yet" placeholder. No date-filter / category strip (§4).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Bot,
  Mic,
  ChevronDown,
  ChevronRight,
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Droplets,
  Thermometer,
  Newspaper,
  Store,
  CalendarDays,
  ArrowLeftRight,
  Pill,
  Smartphone,
  ShoppingBag,
  KeyRound,
  Bus,
} from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchCity, fetchContent } from '../lib/content.js'
import { fetchWeather, fetchSeaTemp, weatherCodeKey } from '../lib/weather.js'
import { fetchRates } from '../lib/currency.js'
import WeatherBackground from '../components/WeatherBackground.jsx'
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

// Quick chips: a meaningful lucide icon + an i18n key. Every chip opens the AI
// chat ("Ask CityMate") seeded with a ready-made question for its topic (§4 —
// "ask & solve, not a directory"). The short visible label comes from
// `home.chips.<key>`; the seeded question from `home.chipQuestions.<key>`.
const CHIPS = [
  { key: 'exchange', icon: ArrowLeftRight },
  { key: 'pharmacy', icon: Pill },
  { key: 'sim', icon: Smartphone },
  { key: 'shops', icon: ShoppingBag },
  { key: 'rent', icon: KeyRound },
  { key: 'transport', icon: Bus },
]

// Feed query options. Module-scoped so their identity is stable across renders
// (they're used as effect deps in useContentFeed).
const NEWS_OPTS = { limit: 8, order: { column: 'published_at', ascending: false } }
const EVENTS_OPTS = { limit: 8, order: { column: 'starts_at', ascending: true } }
const MARKETS_OPTS = { limit: 8 }

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

// Localized short date + time for feed-card meta (e.g. "20 Jun, 14:00"). Returns
// null for missing / unparseable values so the meta line is simply omitted.
function formatDateTime(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
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

  // The search bar and chips currently just open the AI chat (§4 — wired to the
  // chat tab for now). The question is handed over via router state so Chat can
  // pick it up once it's built.
  function openChat(question) {
    navigate('/chat', question ? { state: { question } } : undefined)
  }

  // Every chip seeds the chat with a ready-made question for its topic (§4).
  function onChip(chip) {
    openChat(t(`home.chipQuestions.${chip.key}`))
  }

  const WeatherIcon = weather.data ? WEATHER_ICONS[weatherCodeKey(weather.data.code)] : Cloud
  // Night when the API says so, or (if it didn't) when the local hour is late —
  // used to flip the weather card to a light-on-dark reading (see global.css).
  const weatherNight =
    weather.data &&
    (weather.data.isDay == null
      ? !(new Date().getHours() >= 6 && new Date().getHours() < 20)
      : !weather.data.isDay)

  return (
    <main className="app-shell home">
      {/* Full-bleed city hero: brand + active city + bell over a softened photo
          that fades into the page at its base (§4). */}
      <div className="home__hero">
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
      </div>

      {/* Prominent "Ask CityMate…" bar — overlaps the hero base; bot left, mic
          right (§4). */}
      <button type="button" className="home__ask" onClick={() => openChat()}>
        <span className="home__ask-bot" aria-hidden="true">
          <Bot size={22} strokeWidth={2} />
        </span>
        <span className="home__ask-text">{t('home.askPlaceholder')}</span>
        <span className="home__ask-mic" aria-hidden="true">
          <Mic size={20} strokeWidth={2} />
        </span>
      </button>

      {/* Quick chips with meaning icons (§4). */}
      <div className="home__chips">
        {CHIPS.map((chip) => {
          const Icon = chip.icon
          return (
            <button
              key={chip.key}
              type="button"
              className="home__chip"
              onClick={() => onChip(chip)}
            >
              <Icon className="home__chip-icon" size={16} strokeWidth={2} aria-hidden="true" />
              {t(`home.chips.${chip.key}`)}
            </button>
          )
        })}
      </div>

      {/* Weather + water and currency, side by side on wider screens. */}
      <div className="home__row">
        <section
          className={`home-card weather-card${
            weather.status === 'ready' && weather.data ? ' weather-card--live' : ''
          }${weatherNight ? ' weather-card--night' : ''}`}
        >
          {weather.status === 'loading' ? (
            <p className="home-card__muted">{t('common.loading')}</p>
          ) : weather.status === 'error' || !weather.data ? (
            <p className="home-card__muted">{t('home.weather.unavailable')}</p>
          ) : (
            <>
              <WeatherBackground code={weather.data.code} isDay={weather.data.isDay} />
              <div className="weather-card__content">
                <div className="weather-card__main">
                  <WeatherIcon size={44} strokeWidth={1.6} aria-hidden="true" />
                  <span className="weather-card__temp">{weather.data.temp}°</span>
                </div>
                <p className="weather-card__cond">
                  {t(`home.weather.codes.${weatherCodeKey(weather.data.code)}`)}
                </p>
                {weather.data.feelsLike != null && (
                  <p className="weather-card__feels">
                    <Thermometer size={14} aria-hidden="true" />
                    {t('home.weather.feelsLike')} {weather.data.feelsLike}°
                  </p>
                )}
                {weather.sea != null && (
                  <p className="weather-card__water">
                    <Droplets size={14} aria-hidden="true" />
                    {t('home.weather.water')} {weather.sea}°
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        <section className="home-card currency-card">
          <div className="currency-card__head">
            <h2 className="home-card__title">{t('home.currency.title')}</h2>
            {rates.status === 'ready' && rates.rows.length > 0 && (
              <button
                type="button"
                className="home-card__link"
                onClick={() => openChat(t('home.currency.all'))}
              >
                {t('home.currency.all')}
              </button>
            )}
          </div>
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

      {/* Today feeds — all Supabase, city-scoped, approved-only (§4, §5). Each is
          a horizontally scrollable rail of photo cards with a "See all" link. */}
      <Feed
        icon={Newspaper}
        title={t('home.news.title')}
        feed={news}
        empty={t('home.empty')}
        onSeeAll={() => navigate('/news')}
        renderItem={(row) => (
          <FeedCard
            key={row.id}
            image={row.image_url}
            phIcon={Newspaper}
            title={row.title}
            meta={formatDateTime(row.published_at)}
            onClick={() => navigate(`/news/${row.id}`)}
          />
        )}
      />

      <Feed
        icon={Store}
        title={t('home.markets.title')}
        feed={markets}
        empty={t('home.empty')}
        onSeeAll={() => navigate('/catalog')}
        renderItem={(row) => (
          <FeedCard
            key={row.id}
            image={row.image_url}
            phIcon={Store}
            title={row.name}
            meta={row.address}
            onClick={() => navigate(`/catalog/place/${row.id}`)}
          />
        )}
      />

      <Feed
        icon={CalendarDays}
        title={t('home.events.title')}
        feed={events}
        empty={t('home.empty')}
        onSeeAll={() => navigate('/events')}
        renderItem={(row) => (
          <FeedCard
            key={row.id}
            image={row.image_url}
            phIcon={CalendarDays}
            title={row.title}
            meta={formatDateTime(row.starts_at) || row.location}
            onClick={() => navigate('/events')}
          />
        )}
      />
    </main>
  )
}

// One "today" feed section: titled header (+ "See all") and a horizontal card
// rail, or a tidy placeholder when empty.
function Feed({ icon, title, feed, empty, onSeeAll, renderItem }) {
  const { t } = useTranslation()
  // Local (not a destructured arg) so the uppercase varsIgnorePattern covers it
  // — JSX-only usage isn't tracked by the lint config (see TabBar).
  const Icon = icon
  return (
    <section className="feed">
      <div className="feed__head">
        <Icon className="feed__icon" size={18} strokeWidth={2} aria-hidden="true" />
        <h2 className="feed__title">{title}</h2>
        {feed.rows.length > 0 && (
          <button type="button" className="feed__all" onClick={onSeeAll}>
            {t('home.seeAll')}
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {feed.status === 'loading' ? (
        <div className="feed__rail">
          <div className="feed-card feed-card--skeleton" />
          <div className="feed-card feed-card--skeleton" />
          <div className="feed-card feed-card--skeleton" />
        </div>
      ) : feed.rows.length === 0 ? (
        <p className="feed__empty">{empty}</p>
      ) : (
        <div className="feed__rail">{feed.rows.map(renderItem)}</div>
      )}
    </section>
  )
}

// A single photo card in a feed rail: image (or icon placeholder) on top, title,
// optional small meta line.
function FeedCard({ image, phIcon, title, meta, onClick }) {
  const PhIcon = phIcon
  return (
    <button type="button" className="feed-card" onClick={onClick}>
      <span className={`feed-card__photo${image ? '' : ' feed-card__photo--ph'}`}>
        {image ? (
          <img src={image} alt="" loading="lazy" />
        ) : (
          <PhIcon size={26} strokeWidth={1.6} aria-hidden="true" />
        )}
      </span>
      <span className="feed-card__title">{title}</span>
      {meta && <span className="feed-card__meta">{meta}</span>}
    </button>
  )
}
