// App-wide authentication context (CLAUDE.md §3, §6, §12).
// Holds the current Supabase Auth user/session and the shared sign-in modal
// state, so any screen can softly prompt for login (Favorites, AI chat) without
// hard-blocking the rest of the app.
//
// Kept separate from the provider component so the provider file exports only a
// component (react-refresh / fast-refresh friendliness).
import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** Access the current user/session + the shared auth-modal controls. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
