// City picker sheet (CLAUDE.md §4) — Stage A (multi-city).
// Opened from the city button on the Home header. Lists the ACTIVE cities of the
// CURRENT country only (switching COUNTRY lives in the profile, not here) and
// lets the user re-scope the whole app to another city in that country. Inactive
// ("(soon)") cities are shown disabled, mirroring the welcome screen. Styled to
// match AuthModal / CurrencyPicker (iOS, airy).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Check, X } from 'lucide-react'
import { fetchCities } from '../lib/content.js'

export default function CityPicker({ open, countryId, currentCityId, onSelect, onClose }) {
  const { t } = useTranslation()
  const [cities, setCities] = useState([])

  // Escape closes the sheet (mirrors AuthModal / CurrencyPicker).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Load the current country's cities each time the sheet opens.
  useEffect(() => {
    if (!open || !countryId) return
    let active = true
    fetchCities(countryId)
      .then((rows) => active && setCities(rows))
      .catch(() => active && setCities([]))
    return () => {
      active = false
    }
  }, [open, countryId])

  if (!open) return null

  return (
    <div
      className="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('home.cityPicker.title')}
      onClick={onClose}
    >
      <div className="auth-modal__sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="auth-modal__close"
          onClick={onClose}
          aria-label={t('common.cancel')}
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="auth-modal__head">
          <span className="auth-modal__icon" aria-hidden="true">
            <Building2 size={24} strokeWidth={1.75} />
          </span>
          <h2 className="auth-modal__title">{t('home.cityPicker.title')}</h2>
          <p className="auth-modal__subtitle muted">{t('home.cityPicker.subtitle')}</p>
        </div>

        <ul className="currency-picker__list">
          {cities.map((c) => {
            const isOn = c.id === currentCityId
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`currency-picker__row${isOn ? ' is-on' : ''}`}
                  onClick={() => c.is_active && onSelect(c)}
                  disabled={!c.is_active}
                  aria-pressed={isOn}
                >
                  <span className="currency-picker__name">
                    {c.name}
                    {c.is_active ? '' : ` ${t('profile.soon')}`}
                  </span>
                  <span className="currency-picker__check" aria-hidden="true">
                    {isOn && <Check size={16} strokeWidth={2.5} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
