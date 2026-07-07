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
  Droplets,
  Droplet,
  Wind,
  Sun,
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
  SlidersHorizontal,
} from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchCity, fetchContent, fetchTodayMarket, fetchUpcomingEvents } from '../lib/content.js'
import { fetchWeather, fetchSeaTemp, weatherCodeKey } from '../lib/weather.js'
import { fetchRates } from '../lib/currency.js'
import { useCurrencies } from '../hooks/useCurrencies.js'
import CurrencyPicker from '../components/CurrencyPicker.jsx'
import Flag from '../components/Flag.jsx'
import WeatherBackground from '../components/WeatherBackground.jsx'
import i18n from '../i18n/index.js'

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

// Events use the "upcoming only" reader so past events drop off the Home rail the
// moment their date passes (Turkey time); other feeds use the plain reader. The
// fetcher ignores `table` (events-only) but keeps the (table, cityId, opts)
// shape so useContentFeed stays uniform. Module-scoped for a stable identity.
const fetchEventsFeed = (_table, cityId, opts) => fetchUpcomingEvents(cityId, opts)

// Small async-state hook for one content feed. Treats errors like "empty" so a
// flaky network never breaks the screen — it just shows the placeholder (§4).
function useContentFeed(table, cityId, opts, fetcher = fetchContent) {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  useEffect(() => {
    if (!cityId) return
    let active = true
    fetcher(table, cityId, opts)
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [table, cityId, opts, fetcher])
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

// A Google Maps link for a scheduled market — by coordinates when present,
// otherwise by its address text. Null when there's nothing to route to (the card
// then simply isn't clickable). Gives the owner-mentioned "route" affordance.
function marketRouteUrl(row) {
  if (row?.latitude != null && row?.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`
  }
  if (row?.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.address)}`
  }
  return null
}

export default function Home() {
  const { t, i18n: i18nInstance } = useTranslation()
  const lang = i18nInstance.language
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

  // --- currency rates (user-chosen currencies, stored locally) ---------------
  const [currencies, setCurrencies] = useCurrencies()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rates, setRates] = useState({ status: 'loading', rows: [] })
  useEffect(() => {
    let active = true
    // Keep any previously shown rows while re-fetching (no loading flicker when
    // the user changes the currency selection); errors fall back to the notice.
    fetchRates(currencies)
      .then((rows) => active && setRates({ status: 'ready', rows }))
      .catch(() => active && setRates({ status: 'error', rows: [] }))
    return () => {
      active = false
    }
  }, [currencies])

  // --- content feeds ---------------------------------------------------------
  const news = useContentFeed('news', cityId, NEWS_OPTS)
  const events = useContentFeed('events', cityId, EVENTS_OPTS, fetchEventsFeed)

  // Markets today: driven by the weekly market schedule (§4 screen 1), NOT the
  // `markets` catalog category anymore. Shows the ACTIVE row for the current
  // weekday in Turkey time (UTC+3); an inactive/unset day (e.g. Sunday) yields no
  // row and the block falls back to a "no market today" placeholder. Re-runs when
  // the language changes so the district name stays localized. Errors → empty.
  const [markets, setMarkets] = useState({ status: 'loading', rows: [] })
  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchTodayMarket(cityId, lang)
      .then((row) => active && setMarkets({ status: 'ready', rows: row ? [row] : [] }))
      .catch(() => active && setMarkets({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId, lang])

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

  // Night when the API says so, or (if it didn't) when the local hour is late —
  // flips the weather card to a light-on-dark reading (the sky body itself — sun
  // by day, moon by night — is drawn solely by WeatherBackground).
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
                {/* UV / Wind / Humidity — compact row (§4). Always rendered so the
                    row stays intact; any missing reading shows a dash, not a gap. */}
                <div className="weather-card__stats">
                  <span className="weather-card__stat">
                    <Sun size={13} aria-hidden="true" />
                    <span className="weather-card__stat-label">{t('home.weather.uv')}</span>
                    <span className="weather-card__stat-val">
                      {weather.data.uv != null ? weather.data.uv : '—'}
                    </span>
                  </span>
                  <span className="weather-card__stat">
                    <Wind size={13} aria-hidden="true" />
                    <span className="weather-card__stat-label">{t('home.weather.wind')}</span>
                    <span className="weather-card__stat-val">
                      {weather.data.wind != null
                        ? `${weather.data.wind} ${t('home.weather.kmh')}`
                        : '—'}
                    </span>
                  </span>
                  <span className="weather-card__stat">
                    <Droplet size={13} aria-hidden="true" />
                    <span className="weather-card__stat-label">{t('home.weather.humidity')}</span>
                    <span className="weather-card__stat-val">
                      {weather.data.humidity != null
                        ? `${weather.data.humidity}${t('home.weather.percent')}`
                        : '—'}
                    </span>
                  </span>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="home-card currency-card">
          <div className="currency-card__head">
            <h2 className="home-card__title">{t('home.currency.title')}</h2>
            <div className="currency-card__actions">
              <button
                type="button"
                className="currency-card__gear"
                onClick={() => setPickerOpen(true)}
                aria-label={t('home.currency.customize')}
                title={t('home.currency.customize')}
              >
                <SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />
              </button>
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
          </div>
          {rates.status === 'loading' ? (
            <p className="home-card__muted">{t('common.loading')}</p>
          ) : rates.status === 'error' || rates.rows.length === 0 ? (
            <p className="home-card__muted">{t('home.currency.unavailable')}</p>
          ) : (
            <ul className="currency-card__list">
              {rates.rows.map((r) => (
                <li key={r.code} className="currency-card__row">
                  <span className="currency-card__label">
                    <Flag code={r.code} />
                    <span className="currency-card__code">{r.code}</span>
                  </span>
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
        empty={t('home.markets.none')}
        renderItem={(row) => (
          <FeedCard
            key={row.id}
            image={row.image_url}
            phIcon={Store}
            title={row.name}
            meta={[row.hours, row.address].filter(Boolean).join(' · ') || null}
            onClick={marketRouteUrl(row) ? () => window.open(marketRouteUrl(row), '_blank', 'noopener') : undefined}
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

      <CurrencyPicker
        open={pickerOpen}
        selected={currencies}
        onChange={setCurrencies}
        onClose={() => setPickerOpen(false)}
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
        {onSeeAll && feed.rows.length > 0 && (
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
