// Sign in / register / reset modal (CLAUDE.md §3, §6). Email + password — the
// most reliable Supabase Auth flow (no email-deliverability dependency like
// magic links). One shared instance lives at the app root; any gated surface
// opens it via useAuth().openAuth(). Styled to match the welcome screen (iOS,
// airy). Supabase errors are mapped to translated, human messages — never shown
// raw (see lib/authErrors.js).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Lock, Mail, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/authContext.js'
import { classifyAuthError, authErrorMessageKey } from '../lib/authErrors.js'

// Password-reset links must land on the production site-URL page (Supabase Site
// URL is configured there); other origins aren't allow-listed for redirects.
const RESET_REDIRECT = 'https://ai-relokant.vercel.app/reset-password'

export default function AuthModal() {
  const { t } = useTranslation()
  const { authModalOpen, closeAuth } = useAuth()

  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 'idle' | 'submitting' | 'error' | 'sent' (signup confirm) | 'reset-sent'
  const [status, setStatus] = useState('idle')
  const [errorKind, setErrorKind] = useState('') // classifyAuthError() result
  const [resend, setResend] = useState('idle') // 'idle' | 'sending' | 'sent' | 'error'

  // Reset transient state every time the modal opens. The form always starts on
  // "Sign in" — it never remembers a previous "Register" (CLAUDE.md §3).
  useEffect(() => {
    if (!authModalOpen) return
    setMode('signin')
    setStatus('idle')
    setErrorKind('')
    setResend('idle')
    setPassword('')
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
    setErrorKind('')
    setResend('idle')
  }

  function fail(err) {
    setStatus('error')
    setErrorKind(classifyAuthError(err))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')
    setErrorKind('')
    setResend('idle')
    try {
      if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: RESET_REDIRECT,
        })
        if (err) throw err
        setStatus('reset-sent')
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        // With email confirmations on, signing up with an existing address does
        // not error — Supabase returns an obfuscated user with no identities.
        // Treat that as "already registered" and nudge to sign in.
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setStatus('error')
          setErrorKind('userExists')
          return
        }
        // With confirmation enabled there is no session yet — tell the user to
        // confirm. Otherwise sign-up logs them straight in.
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
      fail(err)
    }
  }

  // Re-send the confirmation email for the address the user just tried to use.
  async function handleResend() {
    if (resend === 'sending') return
    setResend('sending')
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email })
      if (err) throw err
      setResend('sent')
    } catch {
      setResend('error')
    }
  }

  const submitting = status === 'submitting'
  const title =
    mode === 'reset'
      ? t('auth.resetTitle')
      : mode === 'signup'
        ? t('auth.registerTitle')
        : t('auth.signInTitle')
  const subtitle = mode === 'reset' ? t('auth.resetSubtitle') : t('auth.modalSubtitle')

  return (
    <div
      className="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
            {mode === 'reset' ? <Mail size={24} strokeWidth={1.75} /> : <Lock size={24} strokeWidth={1.75} />}
          </span>
          <h2 className="auth-modal__title">{title}</h2>
          <p className="auth-modal__subtitle muted">{subtitle}</p>
        </div>

        {status === 'sent' ? (
          <div className="auth-modal__sent">
            <Mail size={32} strokeWidth={1.5} aria-hidden="true" />
            <p>{t('auth.checkEmail', { email })}</p>
            <button type="button" className="auth-modal__submit" onClick={closeAuth}>
              {t('common.back')}
            </button>
          </div>
        ) : status === 'reset-sent' ? (
          <div className="auth-modal__sent">
            <Mail size={32} strokeWidth={1.5} aria-hidden="true" />
            <p>{t('auth.resetSent', { email })}</p>
            <button
              type="button"
              className="auth-modal__submit"
              onClick={() => switchMode('signin')}
            >
              {t('auth.backToSignIn')}
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

            {mode !== 'reset' && (
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
            )}

            {mode === 'signin' && (
              <button
                type="button"
                className="auth-modal__forgot"
                onClick={() => switchMode('reset')}
              >
                {t('auth.forgotPassword')}
              </button>
            )}

            {status === 'error' && errorKind ? (
              <div className="auth-modal__error" role="alert">
                <p>{t(authErrorMessageKey(errorKind))}</p>
                {errorKind === 'emailNotConfirmed' && (
                  <button
                    type="button"
                    className="auth-modal__error-action"
                    onClick={handleResend}
                    disabled={resend === 'sending' || resend === 'sent'}
                  >
                    {resend === 'sent'
                      ? t('auth.resendSent')
                      : resend === 'sending'
                        ? t('auth.resending')
                        : t('auth.resendConfirmation')}
                  </button>
                )}
                {errorKind === 'userExists' && (
                  <button
                    type="button"
                    className="auth-modal__error-action"
                    onClick={() => switchMode('signin')}
                  >
                    {t('auth.errors.switchToSignIn')}
                  </button>
                )}
              </div>
            ) : null}

            <button type="submit" className="auth-modal__submit" disabled={submitting}>
              {submitting
                ? t('common.loading')
                : mode === 'reset'
                  ? t('auth.resetCta')
                  : mode === 'signup'
                    ? t('auth.registerCta')
                    : t('auth.signInCta')}
              {!submitting && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </form>
        )}

        {status !== 'sent' && status !== 'reset-sent' && mode === 'reset' && (
          <p className="auth-modal__switch">
            <button
              type="button"
              className="auth-modal__switch-btn"
              onClick={() => switchMode('signin')}
            >
              {t('auth.backToSignIn')}
            </button>
          </p>
        )}

        {status !== 'sent' && status !== 'reset-sent' && mode !== 'reset' && (
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
