// Sign in / register modal (CLAUDE.md §3, §6). Email + password — the most
// reliable Supabase Auth flow (no email-deliverability dependency like magic
// links). One shared instance lives at the app root; any gated surface opens it
// via useAuth().openAuth(). Styled to match the welcome screen (iOS, airy).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Lock, Mail, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/authContext.js'

export default function AuthModal() {
  const { t } = useTranslation()
  const { authModalOpen, closeAuth } = useAuth()

  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'submitting' | 'error' | 'sent'
  const [error, setError] = useState('')

  // Reset transient state every time the modal opens.
  useEffect(() => {
    if (!authModalOpen) return
    setStatus('idle')
    setError('')
  }, [authModalOpen])

  // Escape closes the modal.
  useEffect(() => {
    if (!authModalOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeAuth()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [authModalOpen, closeAuth])

  if (!authModalOpen) return null

  function switchMode(next) {
    setMode(next)
    setStatus('idle')
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')
    setError('')
    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        // With email confirmation enabled there is no session yet — tell the
        // user to confirm. Otherwise sign-up logs them straight in.
        if (data.session) {
          closeAuth()
        } else {
          setStatus('sent')
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        closeAuth()
      }
    } catch (err) {
      setStatus('error')
      setError(err?.message || t('auth.genericError'))
    }
  }

  const submitting = status === 'submitting'

  return (
    <div
      className="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'signup' ? t('auth.registerTitle') : t('auth.signInTitle')}
      onClick={closeAuth}
    >
      <div className="auth-modal__sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="auth-modal__close"
          onClick={closeAuth}
          aria-label={t('common.cancel')}
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="auth-modal__head">
          <span className="auth-modal__icon" aria-hidden="true">
            <Lock size={24} strokeWidth={1.75} />
          </span>
          <h2 className="auth-modal__title">
            {mode === 'signup' ? t('auth.registerTitle') : t('auth.signInTitle')}
          </h2>
          <p className="auth-modal__subtitle muted">{t('auth.modalSubtitle')}</p>
        </div>

        {status === 'sent' ? (
          <div className="auth-modal__sent">
            <Mail size={32} strokeWidth={1.5} aria-hidden="true" />
            <p>{t('auth.checkEmail', { email })}</p>
            <button type="button" className="auth-modal__submit" onClick={closeAuth}>
              {t('common.back')}
            </button>
          </div>
        ) : (
          <form className="auth-modal__form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <Mail className="auth-field__icon" size={18} aria-hidden="true" />
              <input
                className="auth-field__input"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="auth-field">
              <Lock className="auth-field__icon" size={18} aria-hidden="true" />
              <input
                className="auth-field__input"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error ? <p className="auth-modal__error">{error}</p> : null}

            <button type="submit" className="auth-modal__submit" disabled={submitting}>
              {submitting
                ? t('common.loading')
                : mode === 'signup'
                  ? t('auth.registerCta')
                  : t('auth.signInCta')}
              {!submitting && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </form>
        )}

        {status !== 'sent' && (
          <p className="auth-modal__switch">
            {mode === 'signup' ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <button
              type="button"
              className="auth-modal__switch-btn"
              onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
            >
              {mode === 'signup' ? t('auth.signInCta') : t('auth.registerCta')}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
