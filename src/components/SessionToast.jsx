// Unobtrusive "your session expired" notice (CLAUDE.md §3). Shown when a live
// session is dropped by the library (expired token / iOS PWA storage wipe)
// rather than an explicit sign-out — so the user isn't silently demoted to a
// guest. Tapping "Sign in" opens the shared auth modal; the ✕ just dismisses.
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useAuth } from '../context/authContext.js'

export default function SessionToast() {
  const { t } = useTranslation()
  const { sessionExpired, dismissSessionExpired, openAuth } = useAuth()

  if (!sessionExpired) return null

  return (
    <div className="session-toast" role="status" aria-live="polite">
      <span className="session-toast__text">{t('auth.sessionExpired')}</span>
      <button type="button" className="session-toast__cta" onClick={openAuth}>
        {t('auth.signInCta')}
      </button>
      <button
        type="button"
        className="session-toast__close"
        onClick={dismissSessionExpired}
        aria-label={t('common.close')}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
