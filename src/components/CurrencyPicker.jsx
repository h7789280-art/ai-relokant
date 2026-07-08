// Currency-card customization sheet (§ task): pick which currencies the home
// card shows. Checklist of the curated set (lib/currency.js), 3–4 at a time.
// UX for the limit: once MAX are chosen, unchecked rows are disabled and a soft
// hint explains why — no silent surprise, no auto-dropping the user's earlier
// pick. The last remaining currency can't be unchecked so the card never empties.
// Styled to match AuthModal (iOS, airy). Selection persists via useCurrencies.
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Coins, X } from 'lucide-react'
import { AVAILABLE_CURRENCIES, MAX_CURRENCIES, DEFAULT_BASE } from '../lib/currency.js'

export default function CurrencyPicker({ open, selected, onChange, onClose, base = DEFAULT_BASE }) {
  const { t } = useTranslation()

  // Escape closes the sheet (mirrors AuthModal).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const atMax = selected.length >= MAX_CURRENCIES

  function toggle(code) {
    if (selected.includes(code)) {
      // Keep at least one so the card is never empty.
      if (selected.length <= 1) return
      onChange(selected.filter((c) => c !== code))
    } else {
      if (atMax) return // blocked — hint below explains
      onChange([...selected, code])
    }
  }

  return (
    <div
      className="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('home.currency.pickerTitle')}
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
            <Coins size={24} strokeWidth={1.75} />
          </span>
          <h2 className="auth-modal__title">{t('home.currency.pickerTitle')}</h2>
          <p className="auth-modal__subtitle muted">
            {t('home.currency.pickerSubtitle', {
              max: MAX_CURRENCIES,
              base: t(`home.currency.baseNames.${base}`),
            })}
          </p>
        </div>

        <ul className="currency-picker__list">
          {AVAILABLE_CURRENCIES.map(({ code, symbol }) => {
            const isOn = selected.includes(code)
            const disabled = !isOn && atMax
            return (
              <li key={code}>
                <button
                  type="button"
                  className={`currency-picker__row${isOn ? ' is-on' : ''}`}
                  onClick={() => toggle(code)}
                  disabled={disabled}
                  aria-pressed={isOn}
                >
                  <span className="currency-picker__symbol" aria-hidden="true">
                    {symbol}
                  </span>
                  <span className="currency-picker__code">{code}</span>
                  <span className="currency-picker__name">
                    {t(`home.currency.names.${code}`)}
                  </span>
                  <span className="currency-picker__check" aria-hidden="true">
                    {isOn && <Check size={16} strokeWidth={2.5} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {atMax && (
          <p className="currency-picker__hint">
            {t('home.currency.limitHint', { max: MAX_CURRENCIES })}
          </p>
        )}

        <button type="button" className="auth-modal__submit" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>
    </div>
  )
}
