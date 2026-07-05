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

// On iOS PWA/Safari two things quietly break a persisted session:
//   1. ITP caps script-writable storage at 7 days unless the user interacts
//      first-party — a silent token rewrite counts as that interaction and
//      resets the timer.
//   2. A tab frozen for over an hour comes back with an expired access token;
//      proactively refreshing on resume repairs it before any request 401s and
//      produces a false "session expired".
// So we refresh on boot and whenever the tab becomes visible again. Not more
// than once per this window on visibility, to avoid churn on every micro-focus.
const VISIBILITY_REFRESH_MIN_INTERVAL_MS = 3 * 60 * 1000

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

  // Race guard: never let two lifecycle refreshes run at once (boot can overlap
  // with an early visibilitychange). And throttle visibility-driven refreshes so
  // rapid tab switches don't hammer the endpoint.
  const refreshingRef = useRef(false)
  const lastRefreshAtRef = useRef(0)

  useEffect(() => {
    let active = true

    // Silently rewrite a fresh session into storage. Only ever runs when a
    // session already exists (never for guests). Failures are swallowed: a
    // network/temporary error must NOT surface "session expired" or demote the
    // user — a genuinely unrecoverable session still arrives as SIGNED_OUT via
    // onAuthStateChange below and is handled there, exactly as before.
    const refreshSessionQuietly = async ({ throttle }) => {
      if (refreshingRef.current) return
      if (
        throttle &&
        Date.now() - lastRefreshAtRef.current < VISIBILITY_REFRESH_MIN_INTERVAL_MS
      ) {
        return
      }
      // Guests have nothing to refresh — leave them untouched.
      const { data } = await supabase.auth.getSession()
      if (!data.session) return

      refreshingRef.current = true
      try {
        await supabase.auth.refreshSession()
      } catch {
        // Swallow: transient/offline failure, stay signed in and quiet.
      } finally {
        // Stamp even on failure so a persistently failing refresh can't storm
        // the endpoint on every visibility flip.
        lastRefreshAtRef.current = Date.now()
        refreshingRef.current = false
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      hadSessionRef.current = Boolean(data.session)
      setSession(data.session ?? null)
      setLoading(false)
      // Boot refresh: not throttled — every launch should reset the ITP timer.
      if (data.session) refreshSessionQuietly({ throttle: false })
    })

    // Re-refresh when the app comes back to the foreground (iOS resume).
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSessionQuietly({ throttle: true })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

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
      document.removeEventListener('visibilitychange', onVisibilityChange)
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
