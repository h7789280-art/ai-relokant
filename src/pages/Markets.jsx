// "All markets" screen (CLAUDE.md §4 screen 1 / §5.7). Reached from the "See all"
// link on Home's "Markets today" block. Shows the ACTIVE city's WHOLE weekly
// market schedule — every active row across the week — grouped by weekday in a
// FIXED Monday→Sunday order (never rotated relative to today). Strictly scoped to
// the active city's id (like the catalog): Alanya shows only Alanya's markets.
// Built on the same routing/layout pattern as WeatherDetails.jsx / Event.jsx.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Store, MapPin, Clock, Navigation } from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchCityMarkets } from '../lib/content.js'
import { directionsUrl } from '../lib/maps.js'
import i18n from '../i18n/index.js'

// Fixed ISO weekday order (1 = Mon … 7 = Sun) — the schedule is always shown
// Monday→Sunday, NOT reordered from "today" (unlike the Home rail which is a
// single day). Keep in sync with market_schedule.day_of_week (§5.7).
const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7]

// Full localized weekday name for an ISO day (1 = Mon … 7 = Sun). Uses a fixed
// reference week (2 Jan 2023 was a Monday) so we never hardcode day names per
// locale — Intl spells them out in the active language (§8, dates via locale).
function weekdayLong(isoDay) {
  const d = new Date(2023, 0, 1 + isoDay) // isoDay 1 → 2 Jan 2023 (Monday)
  return new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(d)
}

// One market: photo on top (rounded), name, district/address, hours, and a Route
// button. Route goes through the shared maps helper (maps_url → coords → address).
function MarketCard({ market }) {
  const { t } = useTranslation()
  const route = directionsUrl(market)
  return (
    <article className="mk-card">
      <div className={`mk-card__photo${market.image_url ? '' : ' mk-card__photo--ph'}`}>
        {market.image_url ? (
          <img src={market.image_url} alt="" loading="lazy" />
        ) : (
          <Store size={30} strokeWidth={1.5} aria-hidden="true" />
        )}
      </div>
      <div className="mk-card__body">
        <h3 className="mk-card__name">{market.name}</h3>
        {market.address && (
          <p className="mk-card__row">
            <MapPin size={15} aria-hidden="true" />
            <span>{market.address}</span>
          </p>
        )}
        {market.hours && (
          <p className="mk-card__row">
            <Clock size={15} aria-hidden="true" />
            <span>{market.hours}</span>
          </p>
        )}
        {route && (
          <a
            className="mk-card__route"
            href={route}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Navigation size={16} aria-hidden="true" />
            <span>{t('place.route')}</span>
          </a>
        )}
      </div>
    </article>
  )
}

export default function Markets() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { cityId, selection } = useApp()
  const [state, setState] = useState({ status: 'loading', rows: [] })

  const cityName = selection?.cityName || ''

  useEffect(() => {
    if (!cityId) return
    let active = true
    const lang = i18n.language
    fetchCityMarkets(cityId, lang)
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId])

  // Group the flat list by weekday, keeping the fixed Mon→Sun order; days with no
  // active markets are dropped so the screen never shows empty filler rows.
  const byDay = ISO_DAYS.map((day) => ({
    day,
    rows: state.rows.filter((r) => r.day_of_week === day),
  })).filter((g) => g.rows.length > 0)

  const header = (
    <header className="mk-hero">
      <button
        type="button"
        className="mk-hero__back"
        onClick={() => navigate(-1)}
        aria-label={t('common.back')}
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <div className="mk-hero__text">
        {cityName && <p className="mk-hero__eyebrow">{cityName}</p>}
        <h1 className="mk-hero__title">{t('markets.title')}</h1>
      </div>
    </header>
  )

  return (
    <main className="app-shell mk">
      {header}

      {state.status === 'loading' ? (
        <div className="mk-day">
          <div className="mk-day__list">
            <div className="mk-card mk-card--skeleton" />
            <div className="mk-card mk-card--skeleton" />
          </div>
        </div>
      ) : byDay.length === 0 ? (
        <p className="mk__empty">{t('markets.weekEmpty')}</p>
      ) : (
        byDay.map(({ day, rows }) => (
          <section className="mk-day" key={day}>
            <h2 className="mk-day__title">{weekdayLong(day)}</h2>
            <div className="mk-day__list">
              {rows.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
