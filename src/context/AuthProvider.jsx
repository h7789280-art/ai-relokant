// Supabase Auth provider (CLAUDE.md §3). Browsing stays fully open; only
// Favorites and the AI chat require a session. Restores the persisted session on
// boot and keeps it in sync via onAuthStateChange, and exposes a single shared
// auth modal that any gated surface can open.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  // `loading` is true only until the persisted session is restored, so gated
  // screens can avoid flashing the sign-in prompt for already-signed-in users.
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    // Fires on sign-in, sign-out, and token refresh — the single source of
    // truth for the current session once we've booted.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const openAuth = useCallback(() => setAuthModalOpen(true), [])
  const closeAuth = useCallback(() => setAuthModalOpen(false), [])
  const signOut = useCallback(() => supabase.auth.signOut(), [])

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
    }),
    [session, loading, authModalOpen, openAuth, closeAuth, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
