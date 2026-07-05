// Supabase Auth provider (CLAUDE.md §3). Browsing stays fully open; only
// Favorites and the AI chat require a session. Restores the persisted session on
// boot and keeps it in sync via onAuthStateChange, and exposes a single shared
// auth modal that any gated surface can open.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { AuthContext } from './authContext.js'

// A password-recovery link lands with `type=recovery` in the URL hash (implicit
// flow). Detect that synchronously at boot so we can lock onto the reset screen
// before the first paint — no flash of Home even when the link opens the site
// root (Supabase Site URL) instead of /reset-password.
function isRecoveryUrl() {
  return /type=recovery/.test(window.location.hash || '')
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  // `loading` is true only until the persisted session is restored, so gated
  // screens can avoid flashing the sign-in prompt for already-signed-in users.
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  // Set when a live session is dropped by the library (token expired / storage
  // wiped by iOS PWA) rather than by an explicit "Sign out" tap. Drives the
  // unobtrusive "session expired" notice instead of a silent guest downgrade.
  const [sessionExpired, setSessionExpired] = useState(false)
  // True while a "reset password" link is being handled: the user must set a new
  // password on /reset-password and MUST NOT be swept into the app as a normal
  // login. Seeded from the URL so the lock is on before the first render.
  const [recovering, setRecovering] = useState(isRecoveryUrl)

  // True between a manual signOut() and the SIGNED_OUT event it triggers, so we
  // can tell a deliberate logout from an expired token.
  const manualSignOutRef = useRef(false)
  // Whether we currently hold a session — so SIGNED_OUT only warns when a real
  // session actually went away (never on a cold boot that starts signed out).
  const hadSessionRef = useRef(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      hadSessionRef.current = Boolean(data.session)
      setSession(data.session ?? null)
      setLoading(false)
    })

    // Fires on sign-in, sign-out, and token refresh — the single source of
    // truth for the current session once we've booted.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // A recovery link creates a session and fires PASSWORD_RECOVERY. This is
      // "let the user set a new password", NOT a normal sign-in: raise the
      // recovery lock and force the reset screen instead of adopting the session
      // as a login. Handled here (app root) rather than only on /reset-password,
      // so it works even when the email link opens the site root.
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true)
        hadSessionRef.current = Boolean(next)
        setSession(next ?? null)
        navigate('/reset-password', { replace: true })
        return
      }
      if (event === 'SIGNED_OUT') {
        // Distinguish an explicit "Sign out" tap from a token that expired or
        // storage the OS wiped (iOS PWA): only the latter warns the user.
        if (!manualSignOutRef.current && hadSessionRef.current) {
          setSessionExpired(true)
        }
        manualSignOutRef.current = false
      }
      hadSessionRef.current = Boolean(next)
      setSession(next ?? null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
    // `navigate` is stable across renders (react-router), so this binds once.
  }, [navigate])

  const openAuth = useCallback(() => {
    setSessionExpired(false)
    setAuthModalOpen(true)
  }, [])
  const closeAuth = useCallback(() => setAuthModalOpen(false), [])
  const dismissSessionExpired = useCallback(() => setSessionExpired(false), [])
  // Called once the new password is saved: drop the recovery lock so the app
  // shell is allowed to render again (see App.jsx).
  const endRecovery = useCallback(() => setRecovering(false), [])
  const signOut = useCallback(() => {
    // Mark the coming SIGNED_OUT as deliberate so no "session expired" notice fires.
    manualSignOutRef.current = true
    return supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthed: Boolean(session?.user),
      loading,
      authModalOpen,
      openAuth,
      closeAuth,
      signOut,
      sessionExpired,
      dismissSessionExpired,
      recovering,
      endRecovery,
    }),
    [
      session,
      loading,
      authModalOpen,
      openAuth,
      closeAuth,
      signOut,
      sessionExpired,
      dismissSessionExpired,
      recovering,
      endRecovery,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
