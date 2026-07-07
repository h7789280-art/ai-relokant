// Events / what's on (CLAUDE.md §4, screen 5). REGIONAL afisha (Stage C part 2):
// by default it shows the whole COUNTRY's upcoming events, ordered by proximity
// to the active city (own city first, then nearer → farther) — the sort is done
// server-side (fetchRegionalEvents → events_by_country_proximity). A compact
// city-filter ribbon at the top can narrow the feed to a SINGLE city (then it's
// a date-grouped agenda of events whose VENUE is that city — venue_city_id, not
// where-shown checkboxes — via fetchUpcomingEvents). Reached
// from Home ("What's on today → See all") and direct navigation. Each card shows
// title, date/time, location, photo and a short description. Empty → a tidy
// "nothing yet" placeholder. Only the afisha is regional; places / news stay
// city-scoped (§5).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Clock,
  Ticket,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useApp } from '../context/appContext.js'
import {
  fetchRegionalEvents,
  fetchUpcomingEvents,
  fetchCities,
  withTranslations,
  computeDateRange,
} from '../lib/content.js'
import { directionsUrl } from '../lib/maps.js'
import { formatEventPrice } from '../lib/eventPrice.js'
import i18n from '../i18n/index.js'

// When a single city is picked, the feed is events held IN that city (by venue);
// oldest-first by start date keeps the agenda reading top-to-bottom, and undated
// rows sink to the end (nullsFirst:false). Proximity is irrelevant — one city.
const CITY_OPTS = { order: { column: 'starts_at', ascending: true } }

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

// Short date badge for the regional (proximity-sorted) list, where cards are NOT
// grouped under a day header — each card carries its own date, e.g. "20 Jul".
function formatDateBadge(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
  }).format(d)
}

export default function Events() {
  const { t, i18n: i18nInstance } = useTranslation()
  const navigate = useNavigate()
  const { selection, cityId } = useApp()
  const lang = i18nInstance.language

  // null → REGIONAL view (whole country by proximity); a city id → that city only.
  const [filterCityId, setFilterCityId] = useState(null)
  // Date filter (ribbon next to the city one). preset 'all' = no narrowing; the
  // custom range keeps its two <input type="date"> values ("YYYY-MM-DD" or '').
  const [dateFilter, setDateFilter] = useState({ preset: 'all', from: '', to: '' })
  const [state, setState] = useState({ status: 'loading', rows: [] })

  // Cities of the current country for the filter ribbon (active only — mirrors
  // the city picker; you can't scope to a "(soon)" city). Reference data.
  const [cities, setCities] = useState([])
  useEffect(() => {
    const countryId = selection?.countryId
    if (!countryId) return
    let active = true
    fetchCities(countryId)
      .then((rows) => active && setCities(rows.filter((c) => c.is_active)))
      .catch(() => active && setCities([]))
    return () => {
      active = false
    }
  }, [selection?.countryId])

  // Load the feed: regional-by-proximity when no city is picked, else the agenda
  // of events held IN the picked city (by venue). Both are approved-only and hide
  // past events.
  useEffect(() => {
    if (!cityId) return
    let active = true
    // Turn the ribbon selection into an absolute {from, to} window (Turkey time;
    // null = no date filter). Computed here so it uses a fresh "now" each load.
    const range = computeDateRange(dateFilter.preset, dateFilter.from, dateFilter.to)
    const load = filterCityId
      ? fetchUpcomingEvents(filterCityId, { ...CITY_OPTS, range })
      : fetchRegionalEvents(cityId, { range })
    // No synchronous "loading" reset here (keeps the previous rows briefly while
    // re-fetching, matching Home's feed hook) — the resolve below swaps them in.
    load
      .then((rows) => withTranslations('events', rows, lang))
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId, filterCityId, lang, dateFilter])

  const regional = !filterCityId

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

      <div className="afisha-filters">
        <CityFilter
          cities={cities}
          value={filterCityId}
          onChange={setFilterCityId}
        />
        <DateFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      {state.status === 'loading' ? (
        <div className="listing__group">
          <div className="catalog__skeleton catalog__skeleton--row" />
          <div className="catalog__skeleton catalog__skeleton--row" />
        </div>
      ) : state.rows.length === 0 ? (
        <p className="catalog__empty">{t('events.empty')}</p>
      ) : regional ? (
        // Proximity order must be preserved → a flat list, each card dated.
        <div className="listing__cards">
          {state.rows.map((row) => (
            <EventCard key={row.id} event={row} showDate />
          ))}
        </div>
      ) : (
        // Single city → the classic date-grouped agenda.
        <div className="listing__groups">{renderGroups(state.rows, t)}</div>
      )}
    </main>
  )
}

// Compact dropdown ribbon (§4 — not a page, not a big header): shows the current
// scope ("All cities" or a city name) and drops a short list of the country's
// cities. Picking a city narrows the feed; "All cities" restores the regional
// view. Closes on outside click / Escape.
function CityFilter({ cities, value, onChange }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Nothing to filter (single-city country, or cities not loaded yet) → hide it.
  if (!cities.length) return null

  const current = value ? cities.find((c) => c.id === value)?.name : null
  const label = current ?? t('events.filter.all')

  const pick = (id) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className="afisha-filter" ref={ref}>
      <button
        type="button"
        className="afisha-filter__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('events.filter.aria')}
      >
        <MapPin size={15} strokeWidth={2} aria-hidden="true" />
        <span className="afisha-filter__label">{label}</span>
        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <ul className="afisha-filter__menu" role="listbox">
          <FilterRow
            label={t('events.filter.all')}
            selected={!value}
            onClick={() => pick(null)}
          />
          {cities.map((c) => (
            <FilterRow
              key={c.id}
              label={c.name}
              selected={c.id === value}
              onClick={() => pick(c.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterRow({ label, selected, onClick }) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        className={`afisha-filter__option${selected ? ' is-on' : ''}`}
        onClick={onClick}
      >
        <span className="afisha-filter__option-label">{label}</span>
        <span className="afisha-filter__check" aria-hidden="true">
          {selected && <Check size={15} strokeWidth={2.5} />}
        </span>
      </button>
    </li>
  )
}

// The quick presets, in menu order. 'all' first (the default / reset). 'custom'
// isn't a row — it's the two date inputs below, and becomes active on their use.
const DATE_PRESETS = ['all', 'today', 'weekend', 'week', 'month']

// Short "12 Jul" from a date-input value ("YYYY-MM-DD"), in the UI language.
function shortInputDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(d)
}

// What the ribbon toggle shows: a preset name, or for a custom range the picked
// dates ("12–15 Jul" / open-ended variants).
function dateFilterLabel(value, t) {
  if (value.preset !== 'custom') return t(`events.dateFilter.${value.preset}`)
  const from = value.from ? shortInputDate(value.from) : null
  const to = value.to ? shortInputDate(value.to) : null
  if (from && to) return `${from} – ${to}`
  if (from) return t('events.dateFilter.fromLabel', { date: from })
  if (to) return t('events.dateFilter.toLabel', { date: to })
  return t('events.dateFilter.custom')
}

// Sibling of CityFilter (§4 — compact dropdown, not a page): presets + a custom
// range. Picking a preset closes the menu; editing the date inputs switches to
// the 'custom' preset and applies live (menu stays open). Closes on outside
// click / Escape.
function DateFilter({ value, onChange }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = value.preset !== 'all'
  const label = dateFilterLabel(value, t)

  const pickPreset = (preset) => {
    onChange({ preset, from: '', to: '' })
    setOpen(false)
  }
  const setCustom = (patch) => {
    onChange({ preset: 'custom', from: value.from, to: value.to, ...patch })
  }

  return (
    <div className="afisha-filter" ref={ref}>
      <button
        type="button"
        className={`afisha-filter__toggle${active ? ' is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('events.dateFilter.aria')}
      >
        <CalendarDays size={15} strokeWidth={2} aria-hidden="true" />
        <span className="afisha-filter__label">{label}</span>
        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="afisha-filter__menu afisha-filter__menu--date" role="dialog">
          <ul className="afisha-filter__presets" role="listbox">
            {DATE_PRESETS.map((p) => (
              <FilterRow
                key={p}
                label={t(`events.dateFilter.${p}`)}
                selected={value.preset === p}
                onClick={() => pickPreset(p)}
              />
            ))}
          </ul>
          <div className="afisha-filter__custom">
            <span className="afisha-filter__custom-title">
              {t('events.dateFilter.custom')}
            </span>
            <label className="afisha-filter__field">
              <span className="afisha-filter__field-label">{t('events.dateFilter.from')}</span>
              <input
                type="date"
                className="afisha-filter__date-input"
                value={value.from}
                onChange={(e) => setCustom({ from: e.target.value })}
              />
            </label>
            <label className="afisha-filter__field">
              <span className="afisha-filter__field-label">{t('events.dateFilter.to')}</span>
              <input
                type="date"
                className="afisha-filter__date-input"
                value={value.to}
                onChange={(e) => setCustom({ to: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// Walk the (already date-sorted) rows, emitting a day header whenever the day
// changes, then the event cards beneath it. Used for the single-city agenda.
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

function EventCard({ event, showDate = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const time = formatTime(event.starts_at)
  // In the regional (proximity) list cards aren't grouped by day, so each shows
  // its own date; the agenda view has a day header instead and omits this.
  const date = showDate ? formatDateBadge(event.starts_at) : null
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
          {date && (
            <span className="event-card__meta-item">
              <CalendarDays size={14} aria-hidden="true" />
              {date}
            </span>
          )}
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
