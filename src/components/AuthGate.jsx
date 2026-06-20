// Soft gate for the two surfaces that need an account (CLAUDE.md §6, §12):
// Favorites and the AI chat. When signed out it shows a friendly invite to sign
// in instead of the content — it does NOT block the rest of the app, the user
// can still switch tabs. When signed in it renders its children unchanged.
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { useAuth } from '../context/authContext.js'

export default function AuthGate({ message, children }) {
  const { t } = useTranslation()
  const { isAuthed, loading, openAuth } = useAuth()

  // Wait for the persisted session to restore so we never flash the prompt at
  // an already-signed-in user.
  if (loading) {
    return (
      <main className="app-shell">
        <p className="muted">{t('common.loading')}</p>
      </main>
    )
  }

  if (!isAuthed) {
    return (
      <main className="app-shell">
        <section className="auth-gate card">
          <span className="auth-gate__icon" aria-hidden="true">
            <Lock size={26} strokeWidth={1.75} />
          </span>
          <h2 className="auth-gate__title">{t('auth.gateTitle')}</h2>
          <p className="auth-gate__text muted">{message}</p>
          <button type="button" className="auth-gate__cta" onClick={openAuth}>
            {t('auth.signInOrUp')}
          </button>
        </section>
      </main>
    )
  }

  return children
}
