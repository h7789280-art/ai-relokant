// Place card (CLAUDE.md §5, §11, §12). Shows a single approved place: photo,
// name, description, address, opening hours, service languages, and the trust
// marks — "verified" (owner quality signal) and "promoted" (paid placement,
// honestly labelled). Action buttons: Call (tel:), WhatsApp, and Route (opens
// maps by coordinates, falling back to the address).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Navigation,
  MapPin,
  Clock,
  Languages,
  BadgeCheck,
  Megaphone,
} from 'lucide-react'
import { fetchPlace, withTranslations } from '../lib/content.js'
import i18n from '../i18n/index.js'

// WhatsApp deep link from a free-form number (strip everything but digits).
function whatsappLink(number) {
  const digits = String(number).replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}` : null
}

// Google Maps directions: prefer exact coordinates, else the textual address.
function directionsLink(place) {
  if (place.latitude != null && place.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
  }
  if (place.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}`
  }
  return null
}

// Hours are stored as free-form jsonb. Normalise to [{ label, value }] rows so a
// plain string, an array, or a { day: hours } object all render tidily.
function hourRows(hours) {
  if (!hours) return []
  if (typeof hours === 'string') return [{ label: '', value: hours }]
  if (Array.isArray(hours)) return hours.map((v, i) => ({ label: '', value: String(v), key: i }))
  if (typeof hours === 'object') {
    return Object.entries(hours).map(([label, value]) => ({
      label,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }))
  }
  return []
}

export default function Place() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { placeId } = useParams()
  const [state, setState] = useState({ status: 'loading', place: null })

  useEffect(() => {
    let active = true
    fetchPlace(placeId)
      .then(async (place) => {
        if (!place) return null
        const [translated] = await withTranslations('places', [place], i18n.language)
        return translated
      })
      .then((place) => active && setState({ status: place ? 'ready' : 'missing', place }))
      .catch(() => active && setState({ status: 'error', place: null }))
    return () => {
      active = false
    }
  }, [placeId])

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

  if (state.status !== 'ready' || !state.place) {
    return (
      <main className="app-shell place">
        {back}
        <p className="catalog__empty">{t('place.notFound')}</p>
      </main>
    )
  }

  const place = state.place
  const wa = place.whatsapp ? whatsappLink(place.whatsapp) : null
  const route = directionsLink(place)
  const hours = hourRows(place.hours)

  return (
    <main className="app-shell place">
      {back}

      {place.photos?.[0] ? (
        <img className="place__hero" src={place.photos[0]} alt={place.name} />
      ) : (
        <div className="place__hero place__hero--ph" aria-hidden="true">
          <MapPin size={40} />
        </div>
      )}

      <div className="place__head">
        <h1 className="place__name">{place.name}</h1>
        {(place.is_promoted || place.is_verified) && (
          <div className="place__badges">
            {place.is_promoted && (
              <span className="badge badge--promoted">
                <Megaphone size={13} aria-hidden="true" />
                {t('catalog.promoted')}
              </span>
            )}
            {place.is_verified && (
              <span className="badge badge--verified">
                <BadgeCheck size={13} aria-hidden="true" />
                {t('catalog.verified')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons: Call · WhatsApp · Route. */}
      <div className="place__actions">
        {place.phone && (
          <a className="place-action" href={`tel:${place.phone}`}>
            <Phone size={20} aria-hidden="true" />
            <span>{t('place.call')}</span>
          </a>
        )}
        {wa && (
          <a className="place-action" href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={20} aria-hidden="true" />
            <span>{t('place.whatsapp')}</span>
          </a>
        )}
        {route && (
          <a className="place-action" href={route} target="_blank" rel="noopener noreferrer">
            <Navigation size={20} aria-hidden="true" />
            <span>{t('place.route')}</span>
          </a>
        )}
      </div>

      {place.description && (
        <section className="place__section">
          <p className="place__description">{place.description}</p>
        </section>
      )}

      {place.address && (
        <section className="place__section place__detail">
          <MapPin className="place__detail-icon" size={18} aria-hidden="true" />
          <div>
            <h2 className="place__detail-label">{t('place.address')}</h2>
            <p className="place__detail-value">{place.address}</p>
          </div>
        </section>
      )}

      {hours.length > 0 && (
        <section className="place__section place__detail">
          <Clock className="place__detail-icon" size={18} aria-hidden="true" />
          <div>
            <h2 className="place__detail-label">{t('place.hours')}</h2>
            <ul className="place__hours">
              {hours.map((row, i) => (
                <li key={row.key ?? row.label ?? i} className="place__hours-row">
                  {row.label && <span className="place__hours-day">{row.label}</span>}
                  <span className="place__hours-value">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {place.languages?.length > 0 && (
        <section className="place__section place__detail">
          <Languages className="place__detail-icon" size={18} aria-hidden="true" />
          <div>
            <h2 className="place__detail-label">{t('place.languages')}</h2>
            <div className="place__langs">
              {place.languages.map((code) => (
                <span key={code} className="place__lang">{code.toUpperCase()}</span>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
