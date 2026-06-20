// Admin moderation data helpers (CLAUDE.md §5, §7, §12) — Stage 10.
//
// These talk to Supabase with the signed-in user's session; every privileged
// read/write is gated server-side by the RLS policies in supabase/admin.sql
// (only users present in the `admins` table can read non-approved rows or write
// to `places`). The client helpers here never bypass that — they just surface a
// friendly API for the admin screen.
import { supabase } from './supabase'

/**
 * Is the currently signed-in user an admin? Reads the caller's own `admins` row
 * (the only row RLS lets them see). Returns false when signed out or on error.
 */
export async function checkIsAdmin() {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return false
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

/**
 * All places for a city in ANY status (admins only — RLS returns approved-only
 * to everyone else). Promoted first, then pending before the rest, then name —
 * so the moderation queue surfaces what needs attention near the top.
 *
 * @param {string} cityId  active city id (required)
 */
export async function fetchAdminPlaces(cityId) {
  if (!cityId) return []
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('city_id', cityId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Create a place. `city_id` is set by the caller from the active city (§5 —
 * every content row is city-scoped). Returns the inserted row.
 */
export async function createPlace(payload) {
  const { data, error } = await supabase
    .from('places')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/**
 * Patch a place (status changes, toggles, edits). Returns the updated row.
 */
export async function updatePlace(id, patch) {
  if (!id) throw new Error('updatePlace: id is required')
  const { data, error } = await supabase
    .from('places')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}
