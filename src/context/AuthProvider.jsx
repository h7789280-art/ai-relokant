// Supabase Auth provider (CLAUDE.md §3). Browsing stays fully open; only
// Favorites and the AI chat require a session. Restores the persisted session on
// boot and keeps it in sync via onAuthStateChange, and exposes a single shared
// auth modal that any gated surface can open.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  // `loading` is true only until the persisted session is restored, so gated
  // screens can avoid flashing the sign-in prompt for already-signed-in users.
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  // Set when a live session is dropped by the library (token expired / storage
  // wiped by iOS PWA) rather than by an explicit "Sign out" tap. Drives the
  // unobtrusive "session expired" notice instead of a silent guest downgrade.
  const [sessionExpired, setSessionExpired] = useState(false)

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
  }, [])

  const openAuth = useCallback(() => {
    setSessionExpired(false)
    setAuthModalOpen(true)
  }, [])
  const closeAuth = useCallback(() => setAuthModalOpen(false), [])
  const dismissSessionExpired = useCallback(() => setSessionExpired(false), [])
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
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
