// New-password page reached from the "reset password" email link (CLAUDE.md §3).
// Supabase (detectSessionInUrl) turns the recovery token in the URL hash into a
// temporary session and emits PASSWORD_RECOVERY; we then set the new password via
// updateUser and drop the user straight into the app, already signed in.
//
// Lives OUTSIDE the onboarding guard (see App.jsx) so the link works whether or
// not this device has picked a city yet.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { classifyAuthError, authErrorMessageKey } from '../lib/authErrors.js'

export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'submitting' | 'success' | 'error'
  const [errorKind, setErrorKind] = useState('')
  // The link either carries a valid recovery token or an error param in the hash
  // (expired/invalid). Detect the error case up front for a clear message.
  const [linkError, setLinkError] = useState(() => /error/i.test(window.location.hash || ''))

  useEffect(() => {
    // A valid recovery token clears any early error flag once Supabase parses it.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setLinkError(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')
    setErrorKind('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorKind(classifyAuthError(err))
    }
  }

  const submitting = status === 'submitting'
  // Show an error either from a bad link (up front) or from a failed update.
  const showError = linkError || status === 'error'
  const shownKind = status === 'error' ? errorKind : 'sessionMissing'

  return (
    <main className="app-shell reset-page">
      <section className="card reset-card">
        {status === 'success' ? (
          <div className="reset-card__done">
            <span className="reset-card__icon reset-card__icon--ok" aria-hidden="true">
              <CheckCircle2 size={26} strokeWidth={1.75} />
            </span>
            <h1 className="reset-card__title">{t('auth.newPassword.title')}</h1>
            <p className="muted">{t('auth.newPassword.success')}</p>
            <button
              type="button"
              className="auth-modal__submit"
              onClick={() => navigate('/', { replace: true })}
            >
              {t('auth.newPassword.continue')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <div className="reset-card__head">
              <span className="reset-card__icon" aria-hidden="true">
                <Lock size={26} strokeWidth={1.75} />
              </span>
              <h1 className="reset-card__title">{t('auth.newPassword.title')}</h1>
              <p className="muted">{t('auth.newPassword.subtitle')}</p>
            </div>

            <form className="auth-modal__form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <Lock className="auth-field__icon" size={18} aria-hidden="true" />
                <input
                  className="auth-field__input"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  placeholder={t('auth.newPassword.placeholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {showError ? (
                <div className="auth-modal__error" role="alert">
                  <p>{t(authErrorMessageKey(shownKind))}</p>
                </div>
              ) : null}

              <button type="submit" className="auth-modal__submit" disabled={submitting}>
                {submitting ? t('common.loading') : t('auth.newPassword.submit')}
                {!submitting && <ArrowRight size={18} aria-hidden="true" />}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
