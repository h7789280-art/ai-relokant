// Events / what's on (CLAUDE.md §4, screen 5). City-scoped, approved-only feed
// (Stage-2 helpers), grouped by date so the list reads as an agenda. Reached
// from Home ("What's on today → See all") and direct navigation. Each card
// shows title, date/time, location, photo and a short description. Empty →
// a tidy "nothing yet" placeholder.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, MapPin, Clock, Ticket, ChevronRight } from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchUpcomingEvents, withTranslations } from '../lib/content.js'
import { directionsUrl } from '../lib/maps.js'
import { formatEventPrice } from '../lib/eventPrice.js'
import i18n from '../i18n/index.js'

// Oldest-first by start date keeps the agenda reading top-to-bottom; undated
// rows sink to the end (nullsFirst:false in fetchContent).
const EVENTS_OPTS = { order: { column: 'starts_at', ascending: true } }

// Sentinel for "no day grouped yet" — distinct from every real key (a Y-M-D
// string) and from null (which undated rows produce).
const NO_DAY = 'init'

// Local Y-M-D key so events on the same calendar day share one header.
function dayKey(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatDay(value) {
  const d = new Date(value)
  return new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
}

function formatTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default function Events() {
  const { t, i18n: i18nInstance } = useTranslation()
  const navigate = useNavigate()
  const { cityId } = useApp()
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchUpcomingEvents(cityId, EVENTS_OPTS)
      .then((rows) => withTranslations('events', rows, i18nInstance.language))
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId, i18nInstance.language])

  return (
    <main className="app-shell listing">
      <header className="catalog__header">
        <button type="button" className="catalog__back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t('nav.home')}
        </button>
        <h1 className="catalog__title">{t('events.title')}</h1>
        <p className="catalog__subtitle">{t('events.subtitle')}</p>
      </header>

      {state.status === 'loading' ? (
        <div className="listing__group">
          <div className="catalog__skeleton catalog__skeleton--row" />
          <div className="catalog__skeleton catalog__skeleton--row" />
        </div>
      ) : state.rows.length === 0 ? (
        <p className="catalog__empty">{t('events.empty')}</p>
      ) : (
        <div className="listing__groups">{renderGroups(state.rows, t)}</div>
      )}
    </main>
  )
}

// Walk the (already date-sorted) rows, emitting a day header whenever the day
// changes, then the event cards beneath it.
function renderGroups(rows, t) {
  const out = []
  let currentKey = NO_DAY
  let group = null
  for (const row of rows) {
    const key = dayKey(row.starts_at)
    if (key !== currentKey) {
      currentKey = key
      group = []
      out.push(
        <section className="listing__group" key={`g-${row.id}`}>
          <h2 className="listing__day">
            {row.starts_at ? formatDay(row.starts_at) : t('events.undated')}
          </h2>
          <div className="listing__cards">{group}</div>
        </section>,
      )
    }
    group.push(<EventCard key={row.id} event={row} />)
  }
  return out
}

function EventCard({ event }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const time = formatTime(event.starts_at)
  const price = formatEventPrice(event, t)
  // Tap the location to open a route in maps (§4) — by coordinates when the event
  // has them, otherwise by its location text. Same helper as places / markets.
  const route = directionsUrl({
    latitude: event.latitude,
    longitude: event.longitude,
    address: event.location,
  })
  // The whole card opens the event's full page (§4 screen 5). It's an <article>
  // (not a <button>) so the location link can nest inside without invalid
  // button-in-button markup; the link stops propagation so tapping it routes to
  // maps instead of opening the page.
  const open = () => navigate(`/events/${event.id}`)
  return (
    <article
      className="event-card event-card--link"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      {event.image_url ? (
        <img className="event-card__photo" src={event.image_url} alt="" loading="lazy" />
      ) : (
        <span className="event-card__photo event-card__photo--ph" aria-hidden="true">
          <CalendarDays size={22} />
        </span>
      )}
      <div className="event-card__body">
        <h3 className="event-card__title">{event.title}</h3>
        <div className="event-card__meta">
          {time && (
            <span className="event-card__meta-item">
              <Clock size={14} aria-hidden="true" />
              {time}
            </span>
          )}
          {event.location &&
            (route ? (
              <a
                className="event-card__meta-item event-card__meta-link"
                href={route}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <MapPin size={14} aria-hidden="true" />
                {event.location}
              </a>
            ) : (
              <span className="event-card__meta-item">
                <MapPin size={14} aria-hidden="true" />
                {event.location}
              </span>
            ))}
          {price && (
            <span className="event-card__meta-item">
              <Ticket size={14} aria-hidden="true" />
              {price}
            </span>
          )}
        </div>
        {event.description && <p className="event-card__desc">{event.description}</p>}
      </div>
      <ChevronRight className="event-card__chevron" size={18} aria-hidden="true" />
    </article>
  )
}
