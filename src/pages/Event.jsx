// A single city event (CLAUDE.md §4 screen 5). Full detail of one approved,
// city-scoped event: photo, title, date & time, location (tap → route in maps),
// the FULL description (no clamp — that's only for the list), and an optional
// event link. Reached by tapping a card on the Events screen. Built on the same
// routing/layout pattern as Place.jsx for consistency.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, MapPin, Navigation, ExternalLink } from 'lucide-react'
import { fetchEvent, withTranslations } from '../lib/content.js'
import { directionsUrl } from '../lib/maps.js'
import i18n from '../i18n/index.js'

function formatDay(value) {
  const d = new Date(value)
  return new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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

// Human-readable date/time. When the event ends the same day we append just the
// end time ("Saturday, 12 July · 10:00–18:00"); a different end day gets its own
// full date. Null when there's no start (undated event).
function formatWhen(startsAt, endsAt) {
  if (!startsAt) return null
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return null
  const startDay = formatDay(startsAt)
  const startTime = formatTime(startsAt)
  let out = startTime ? `${startDay} · ${startTime}` : startDay

  if (endsAt) {
    const end = new Date(endsAt)
    if (!Number.isNaN(end.getTime())) {
      const sameDay =
        start.getFullYear() === end.getFullYear() &&
        start.getMonth() === end.getMonth() &&
        start.getDate() === end.getDate()
      const endTime = formatTime(endsAt)
      if (sameDay) {
        if (endTime) out = startTime ? `${startDay} · ${startTime}–${endTime}` : startDay
      } else {
        const endDay = formatDay(endsAt)
        out += endTime ? ` — ${endDay} · ${endTime}` : ` — ${endDay}`
      }
    }
  }
  return out
}

export default function Event() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { eventId } = useParams()
  const [state, setState] = useState({ status: 'loading', event: null })

  useEffect(() => {
    let active = true
    fetchEvent(eventId)
      .then(async (event) => {
        if (!event) return null
        const [translated] = await withTranslations('events', [event], i18n.language)
        return translated
      })
      .then((event) => active && setState({ status: event ? 'ready' : 'missing', event }))
      .catch(() => active && setState({ status: 'error', event: null }))
    return () => {
      active = false
    }
  }, [eventId])

  const back = (
    <button type="button" className="catalog__back" onClick={() => navigate(-1)}>
      <ArrowLeft size={18} aria-hidden="true" />
      {t('common.back')}
    </button>
  )

  if (state.status === 'loading') {
    return (
      <main className="app-shell place">
        {back}
        <div className="catalog__skeleton catalog__skeleton--hero" />
        <div className="catalog__skeleton catalog__skeleton--row" />
      </main>
    )
  }

  if (state.status !== 'ready' || !state.event) {
    return (
      <main className="app-shell place">
        {back}
        <p className="catalog__empty">{t('events.notFound')}</p>
      </main>
    )
  }

  const event = state.event
  const when = formatWhen(event.starts_at, event.ends_at)
  // Tap the location to open a route in maps (§4) — by coordinates when present,
  // else by the location text. Same helper as places / markets.
  const route = directionsUrl({
    latitude: event.latitude,
    longitude: event.longitude,
    address: event.location,
  })

  return (
    <main className="app-shell place">
      {back}

      {event.image_url ? (
        <img className="place__hero" src={event.image_url} alt={event.title} />
      ) : (
        <div className="place__hero place__hero--ph" aria-hidden="true">
          <CalendarDays size={40} />
        </div>
      )}

      <div className="place__head">
        <div className="place__head-main">
          <h1 className="place__name">{event.title}</h1>
        </div>
      </div>

      {/* Action buttons: Route · Event page — shown only when available. */}
      {(route || event.url) && (
        <div className="place__actions">
          {route && (
            <a className="place-action" href={route} target="_blank" rel="noopener noreferrer">
              <Navigation size={20} aria-hidden="true" />
              <span>{t('place.route')}</span>
            </a>
          )}
          {event.url && (
            <a className="place-action" href={event.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={20} aria-hidden="true" />
              <span>{t('events.link')}</span>
            </a>
          )}
        </div>
      )}

      {when && (
        <section className="place__section place__detail">
          <CalendarDays className="place__detail-icon" size={18} aria-hidden="true" />
          <div>
            <h2 className="place__detail-label">{t('events.when')}</h2>
            <p className="place__detail-value">{when}</p>
          </div>
        </section>
      )}

      {event.location && (
        <section className="place__section place__detail">
          <MapPin className="place__detail-icon" size={18} aria-hidden="true" />
          <div>
            <h2 className="place__detail-label">{t('events.location')}</h2>
            {/* Tap the location to open a route in maps (§4) — plain text when
                there's nothing to route to. */}
            {route ? (
              <a
                className="place__detail-value place__detail-link"
                href={route}
                target="_blank"
                rel="noopener noreferrer"
              >
                {event.location}
              </a>
            ) : (
              <p className="place__detail-value">{event.location}</p>
            )}
          </div>
        </section>
      )}

      {event.description && (
        <section className="place__section">
          <p className="place__description">{event.description}</p>
        </section>
      )}
    </main>
  )
}
