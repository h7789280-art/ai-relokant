// SOS — emergency help (CLAUDE.md §4, §11). Route: /sos, inside the tab shell.
//
// DESIGN RULES THAT DRIVE EVERY CHOICE BELOW
//   1. NO AI. Nobody waits for a chat reply while panicking, so this screen is
//      static: constants from src/lib/sosConfig.js + sosPhrases.js and three
//      plain city-scoped queries. It paints immediately.
//   2. NEVER INVENT (§11, doubly so here). Emergency numbers, the duty-pharmacy
//      link and consulate phones are either VERIFIED or ABSENT — a block with no
//      trustworthy data hides itself rather than guessing. A wrong number in an
//      emergency is worse than no number.
//   3. ORDERED BY URGENCY, top to bottom: call → send my location → hospital →
//      duty pharmacy → consulate → phrasebook.
//
// PRIVACY: the user's GPS position never leaves the device. It is asked for
// only on an explicit tap, kept in component state, used to build a maps link
// the user shares themselves and to sort hospitals client-side (haversineKm) —
// never stored, never sent to Supabase or any API.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  PhoneCall,
  MapPin,
  Send,
  Hospital,
  Pill,
  Landmark,
  MessageSquareQuote,
  Navigation,
  Clock,
  Globe,
  ExternalLink,
  Check,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchConsulates, fetchHospitals } from '../lib/content.js'
import { directionsUrl } from '../lib/maps.js'
import { haversineKm } from '../lib/geo.js'
import { capitalCity, countryName, dutyPharmacy, emergencyNumbers } from '../lib/sosConfig.js'
import { SOS_PHRASES } from '../lib/sosPhrases.js'

// How many hospitals the block lists before pointing at the full catalog. Enough
// to have a plan B if the first one is the wrong kind of hospital, short enough
// to read at a glance.
const MAX_HOSPITALS = 5

// Google Maps link for a raw coordinate pair — the thing the user shares. Kept
// separate from directionsUrl (maps.js), which routes to a DB row; this points
// at wherever the phone says the user is standing right now.
function positionUrl(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`
}

// One-decimal km for near distances, whole km further out ("1.4 km" / "12 km").
function formatKm(km, lang) {
  const digits = km < 10 ? 1 : 0
  return new Intl.NumberFormat(lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(km)
}

// The user's position, requested ONLY on an explicit tap (never on mount — a
// permission prompt firing at you the moment the panic screen opens is exactly
// the wrong thing). Shared by the "send my location" and "nearest hospital"
// blocks, so granting it once serves both.
function useGeolocation() {
  const [state, setState] = useState({ status: 'idle', coords: null })

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: 'unsupported', coords: null })
      return Promise.resolve(null)
    }
    setState((s) => ({ ...s, status: 'locating' }))
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setState({ status: 'ready', coords })
          resolve(coords)
        },
        () => {
          setState({ status: 'denied', coords: null })
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    })
  }, [])

  return { ...state, locate }
}

export default function Sos() {
  const { t, i18n: i18nInstance } = useTranslation()
  const lang = i18nInstance.language
  const navigate = useNavigate()
  const { selection, cityId, citizenship } = useApp()
  const geo = useGeolocation()

  const emergency = emergencyNumbers(selection?.countryCode)
  const pharmacy = dutyPharmacy(selection?.citySlug)

  return (
    <main className="app-shell sos">
      <header className="sos-hero">
        <button
          type="button"
          className="sos-hero__back"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="sos-hero__text">
          <p className="sos-hero__eyebrow">
            <ShieldAlert size={15} aria-hidden="true" />
            {selection?.cityName || ''}
          </p>
          <h1 className="sos-hero__title">{t('sos.title')}</h1>
          <p className="sos-hero__subtitle">{t('sos.subtitle')}</p>
        </div>
      </header>

      <CallBlock emergency={emergency} />
      <LocationBlock geo={geo} />
      <HospitalsBlock cityId={cityId} lang={lang} coords={geo.coords} onLocate={geo.locate} geoStatus={geo.status} />
      <PharmacyBlock pharmacy={pharmacy} />
      <ConsulateBlock
        hostCountryId={selection?.countryId}
        hostCountryName={selection?.countryName}
        hostCountryCode={selection?.countryCode}
        citizenship={citizenship}
        lang={lang}
      />
      <PhrasesBlock />
    </main>
  )
}

// --- a) Emergency call ------------------------------------------------------
// The biggest thing on the screen. The caption tells the truth about what the
// number reaches: "one number for ambulance / police / fire" ONLY where that is
// actually the case (Turkey's 112). Where it isn't (UAE: 999 police, 998
// ambulance, 997 fire) the extra services get their own smaller buttons instead
// of a false claim. A country we have no verified number for renders nothing.
function CallBlock({ emergency }) {
  const { t } = useTranslation()
  if (!emergency) return null
  const { primary, unified, primaryKey, extra } = emergency
  return (
    <section className="sos-block">
      <a className="sos-call" href={`tel:${primary}`}>
        <span className="sos-call__icon" aria-hidden="true">
          <PhoneCall size={26} strokeWidth={2.2} />
        </span>
        <span className="sos-call__body">
          <span className="sos-call__label">{t('sos.call.action', { number: primary })}</span>
          <span className="sos-call__hint">
            {unified ? t('sos.call.unified') : t(`sos.services.${primaryKey}`)}
          </span>
        </span>
      </a>
      {extra?.length > 0 && (
        <div className="sos-call__extra">
          {extra.map((s) => (
            <a key={s.key} className="sos-call__small" href={`tel:${s.number}`}>
              <PhoneCall size={16} aria-hidden="true" />
              <span className="sos-call__small-label">{t(`sos.services.${s.key}`)}</span>
              <span className="sos-call__small-number">{s.number}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

// --- b) Send my location to someone close ----------------------------------
// Ask the phone where we are, turn it into a plain Google Maps link, and hand it
// to the OS share sheet (WhatsApp / Telegram / SMS — whatever they use). No
// server, no storage: the link is built and shared on-device. Clipboard is the
// fallback on desktop browsers without the Share API, and if even that is
// blocked the raw link is shown so it can be copied by hand.
function LocationBlock({ geo }) {
  const { t } = useTranslation()
  const [shared, setShared] = useState('') // '' | 'shared' | 'copied'
  const [error, setError] = useState('')

  const url = geo.coords ? positionUrl(geo.coords.lat, geo.coords.lng) : null

  async function handleShare() {
    setError('')
    setShared('')
    const coords = geo.coords ?? (await geo.locate())
    if (!coords) {
      setError(t('sos.location.denied'))
      return
    }
    const link = positionUrl(coords.lat, coords.lng)
    const payload = { title: t('sos.location.shareTitle'), text: t('sos.location.shareText'), url: link }
    try {
      if (navigator.share) {
        await navigator.share(payload)
        setShared('shared')
        return
      }
      await navigator.clipboard.writeText(link)
      setShared('copied')
    } catch {
      // A cancelled share sheet lands here too — say nothing dramatic, the raw
      // link below stays available either way.
      setShared('')
    }
  }

  return (
    <section className="sos-block">
      <h2 className="sos-block__title">
        <Send size={18} aria-hidden="true" />
        {t('sos.location.title')}
      </h2>
      <p className="sos-block__hint">{t('sos.location.hint')}</p>
      <button
        type="button"
        className="sos-btn sos-btn--primary"
        onClick={handleShare}
        disabled={geo.status === 'locating'}
      >
        <MapPin size={18} aria-hidden="true" />
        {geo.status === 'locating' ? t('sos.location.locating') : t('sos.location.action')}
      </button>
      {shared === 'copied' && (
        <p className="sos-note sos-note--ok" role="status">
          <Check size={15} aria-hidden="true" />
          {t('sos.location.copied')}
        </p>
      )}
      {shared === 'shared' && (
        <p className="sos-note sos-note--ok" role="status">
          <Check size={15} aria-hidden="true" />
          {t('sos.location.sent')}
        </p>
      )}
      {geo.status === 'unsupported' && <p className="sos-note">{t('sos.location.unsupported')}</p>}
      {error && <p className="sos-note">{error}</p>}
      {url && (
        <a className="sos-link" href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      )}
    </section>
  )
}

// --- c) Nearest hospital ----------------------------------------------------
// Ordinary approved catalog places (subcategory `hospitals`) of the active city,
// so tapping one opens the normal place card with its phone, hours and route.
// With the user's position they are sorted by real distance; without it they are
// simply listed — the block never demands a permission to be useful.
function HospitalsBlock({ cityId, lang, coords, onLocate, geoStatus }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchHospitals(cityId, lang)
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId, lang])

  // Distance-sorted when we know where the user is; hospitals without
  // coordinates keep their alphabetical place at the end (nulls last, like the
  // afisha's proximity sort).
  const rows = useMemo(() => {
    const list = state.rows.map((r) => ({
      ...r,
      km: coords ? haversineKm(coords.lat, coords.lng, r.latitude, r.longitude) : null,
    }))
    if (!coords) return list.slice(0, MAX_HOSPITALS)
    return list
      .sort((a, b) => {
        if (a.km == null && b.km == null) return 0
        if (a.km == null) return 1
        if (b.km == null) return -1
        return a.km - b.km
      })
      .slice(0, MAX_HOSPITALS)
  }, [state.rows, coords])

  if (state.status === 'ready' && state.rows.length === 0) return null

  return (
    <section className="sos-block">
      <h2 className="sos-block__title">
        <Hospital size={18} aria-hidden="true" />
        {t('sos.hospitals.title')}
      </h2>

      {state.status === 'loading' ? (
        <p className="sos-block__hint">{t('common.loading')}</p>
      ) : (
        <>
          {!coords && geoStatus !== 'unsupported' && (
            <button type="button" className="sos-btn" onClick={onLocate} disabled={geoStatus === 'locating'}>
              <Navigation size={16} aria-hidden="true" />
              {geoStatus === 'locating' ? t('sos.location.locating') : t('sos.hospitals.sortByDistance')}
            </button>
          )}
          <ul className="sos-list">
            {rows.map((h) => {
              const route = directionsUrl(h)
              return (
                <li key={h.id} className="sos-item">
                  <button
                    type="button"
                    className="sos-item__main"
                    onClick={() => navigate(`/catalog/place/${h.id}`)}
                  >
                    <span className="sos-item__name">{h.name}</span>
                    {h.address && <span className="sos-item__meta">{h.address}</span>}
                    {h.km != null && (
                      <span className="sos-item__badge">
                        {t('sos.hospitals.km', { km: formatKm(h.km, lang) })}
                      </span>
                    )}
                  </button>
                  <div className="sos-item__actions">
                    {h.phone && (
                      <a className="sos-icon-btn" href={`tel:${h.phone}`} aria-label={t('place.call')}>
                        <PhoneCall size={17} aria-hidden="true" />
                      </a>
                    )}
                    {route && (
                      <a
                        className="sos-icon-btn"
                        href={route}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('place.route')}
                      >
                        <Navigation size={17} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

// --- d) Duty pharmacy (nöbetçi eczane) --------------------------------------
// Turkish pharmacies take turns covering nights and holidays. We link out to the
// provincial chamber's OFFICIAL roster page rather than parsing it (§14) — a
// self-parsed "open now" we can't verify would send someone across town at 3
// a.m. for nothing. No configured city ⇒ no block at all.
function PharmacyBlock({ pharmacy }) {
  const { t } = useTranslation()
  if (!pharmacy) return null
  return (
    <section className="sos-block">
      <h2 className="sos-block__title">
        <Pill size={18} aria-hidden="true" />
        {t('sos.pharmacy.title')}
      </h2>
      <p className="sos-block__hint">{t('sos.pharmacy.hint')}</p>
      <a className="sos-btn sos-btn--primary" href={pharmacy.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={17} aria-hidden="true" />
        {t('sos.pharmacy.action')}
      </a>
      <p className="sos-note">{t('sos.pharmacy.source', { source: pharmacy.source })}</p>
    </section>
  )
}

// --- e) My consulate --------------------------------------------------------
// Citizenship is a PROFILE setting, never inferred from the interface language
// (a Russian-speaking Kazakh citizen belongs at the Kazakh consulate). Three
// honest states:
//   • citizenship set + a row exists  → their mission, 24/7 line first;
//   • citizenship set + nothing on file → say so plainly and point at the
//     embassy in the host capital, instead of showing a stranger's consulate;
//   • citizenship not set → a soft prompt into the profile, with the full
//     directory for the host country underneath so the block is useful anyway.
function ConsulateBlock({ hostCountryId, hostCountryName, hostCountryCode, citizenship, lang }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading', all: [] })

  useEffect(() => {
    if (!hostCountryId) return
    let active = true
    // One read of the host country's directory; "mine" is a filter over it, so
    // switching citizenship never costs another round-trip.
    fetchConsulates(hostCountryId)
      .then((rows) => active && setState({ status: 'ready', all: rows }))
      .catch(() => active && setState({ status: 'ready', all: [] }))
    return () => {
      active = false
    }
  }, [hostCountryId])

  const mine = citizenship
    ? state.all.filter((c) => c.citizenship_country_code === citizenship.toUpperCase())
    : []

  return (
    <section className="sos-block">
      <h2 className="sos-block__title">
        <Landmark size={18} aria-hidden="true" />
        {t('sos.consulate.title')}
      </h2>

      {state.status === 'loading' ? (
        <p className="sos-block__hint">{t('common.loading')}</p>
      ) : !citizenship ? (
        <>
          <p className="sos-block__hint">{t('sos.consulate.askCitizenship')}</p>
          <button type="button" className="sos-btn sos-btn--primary" onClick={() => navigate('/profile')}>
            {t('sos.consulate.setCitizenship')}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          {state.all.length > 0 && (
            <>
              <p className="sos-block__hint sos-block__hint--spaced">
                {t('sos.consulate.allTitle', { country: hostCountryName ?? '' })}
              </p>
              <div className="sos-consulates">
                {state.all.map((c) => (
                  <ConsulateCard key={c.id} consulate={c} lang={lang} showCitizenship />
                ))}
              </div>
            </>
          )}
        </>
      ) : mine.length > 0 ? (
        <div className="sos-consulates">
          {mine.map((c) => (
            <ConsulateCard key={c.id} consulate={c} lang={lang} />
          ))}
        </div>
      ) : (
        <>
          <p className="sos-block__hint">
            {t('sos.consulate.noData', {
              citizenship: countryName(citizenship, lang),
              country: hostCountryName ?? '',
            })}
          </p>
          {capitalCity(hostCountryCode) && (
            <p className="sos-note">
              {t('sos.consulate.embassyHint', { capital: capitalCity(hostCountryCode) })}
            </p>
          )}
        </>
      )}
    </section>
  )
}

// One consulate: the 24/7 line is the headline (that is the whole reason this
// table exists), the daytime line and address follow. The address routes through
// the shared maps helper, so a pasted maps_url wins over coordinates (§5.8).
function ConsulateCard({ consulate: c, lang, showCitizenship }) {
  const { t } = useTranslation()
  const route = directionsUrl(c)
  return (
    <article className="sos-consulate">
      <h3 className="sos-consulate__name">{c.name}</h3>
      {showCitizenship && (
        <p className="sos-consulate__for">{countryName(c.citizenship_country_code, lang)}</p>
      )}
      {c.city_label && <p className="sos-consulate__city">{t('sos.consulate.in', { city: c.city_label })}</p>}

      {c.emergency_phone && (
        <a className="sos-consulate__emergency" href={`tel:${c.emergency_phone}`}>
          <PhoneCall size={20} aria-hidden="true" />
          <span className="sos-consulate__emergency-body">
            <span className="sos-consulate__emergency-number">{c.emergency_phone}</span>
            <span className="sos-consulate__emergency-label">{t('sos.consulate.emergency')}</span>
          </span>
        </a>
      )}

      {c.phone && (
        <a className="sos-consulate__row sos-consulate__row--link" href={`tel:${c.phone}`}>
          <PhoneCall size={15} aria-hidden="true" />
          <span>{c.phone}</span>
        </a>
      )}
      {c.hours && (
        <p className="sos-consulate__row">
          <Clock size={15} aria-hidden="true" />
          <span>{c.hours}</span>
        </p>
      )}
      {c.address &&
        (route ? (
          <a
            className="sos-consulate__row sos-consulate__row--link"
            href={route}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin size={15} aria-hidden="true" />
            <span>{c.address}</span>
          </a>
        ) : (
          <p className="sos-consulate__row">
            <MapPin size={15} aria-hidden="true" />
            <span>{c.address}</span>
          </p>
        ))}
      {c.website && (
        <a
          className="sos-consulate__row sos-consulate__row--link"
          href={c.website}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Globe size={15} aria-hidden="true" />
          <span>{t('sos.consulate.website')}</span>
        </a>
      )}
    </article>
  )
}

// --- f) Ready-made phrases --------------------------------------------------
// A card per phrase: the user's own language on the card, tap to blow the
// TURKISH up to fill the block — the whole point is handing the phone to a
// doctor or a passer-by. The Turkish text is a constant (sosPhrases.js), never
// generated, so it can't drift; the reading aid sits under it.
function PhrasesBlock() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(null)

  return (
    <section className="sos-block">
      <h2 className="sos-block__title">
        <MessageSquareQuote size={18} aria-hidden="true" />
        {t('sos.phrasesTitle')}
      </h2>
      <p className="sos-block__hint">{t('sos.phrasesHint')}</p>
      <div className="sos-phrases">
        {SOS_PHRASES.map((p) => {
          const isOpen = open === p.key
          return (
            <button
              key={p.key}
              type="button"
              className={`sos-phrase${isOpen ? ' is-open' : ''}`}
              onClick={() => setOpen(isOpen ? null : p.key)}
              aria-expanded={isOpen}
            >
              <span className="sos-phrase__meaning">{t(`sos.phrases.${p.key}`)}</span>
              <span className="sos-phrase__tr" lang="tr">
                {p.tr}
              </span>
              {isOpen && <span className="sos-phrase__translit">{p.translit}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
