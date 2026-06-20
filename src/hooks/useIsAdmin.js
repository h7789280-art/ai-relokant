// useIsAdmin — resolves whether the signed-in user is an admin (CLAUDE.md §7).
// Used to gate the /admin route and to show the "Admin" link in the profile.
// Re-checks whenever the user changes; returns { isAdmin, loading }.
import { useEffect, useState } from 'react'
import { useAuth } from '../context/authContext.js'
import { checkIsAdmin } from '../lib/admin.js'

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth()
  // Tag the result with the user id it was computed for, so we can tell whether
  // the current user has been checked yet (and treat "not yet" as loading).
  const [result, setResult] = useState({ userId: null, isAdmin: false })

  useEffect(() => {
    // Wait for the session to restore; signed-out users are never admins.
    if (authLoading || !user) return
    let active = true
    checkIsAdmin()
      .then((isAdmin) => active && setResult({ userId: user.id, isAdmin }))
      .catch(() => active && setResult({ userId: user.id, isAdmin: false }))
    return () => {
      active = false
    }
  }, [authLoading, user])

  const checked = Boolean(user) && result.userId === user.id
  const loading = authLoading || (Boolean(user) && !checked)
  const isAdmin = checked && result.isAdmin
  return { isAdmin, loading }
}
