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

// ---- Generic moderated content (news / events / guides) — Stage 10 ----------
// Same shape as the place helpers above, but for the other city-scoped content
// tables. Every privileged read/write is gated by the RLS policies in
// supabase/admin-content.sql (admins only). `city_id` is always set by the
// caller from the active city (§5 — every content row is city-scoped).

// Tables the admin moderation screen manages besides `places`.
const ADMIN_CONTENT_TABLES = ['news', 'events', 'guides']

function assertContentTable(table) {
  if (!ADMIN_CONTENT_TABLES.includes(table)) {
    throw new Error(`admin: "${table}" is not a moderated content table`)
  }
}

/**
 * All rows of a moderated content table for a city in ANY status (admins only —
 * RLS returns approved-only to everyone else). Newest first, so freshly added /
 * pending items surface at the top of the moderation queue.
 *
 * @param {('news'|'events'|'guides')} table
 * @param {string} cityId  active city id (required)
 */
export async function fetchAdminContent(table, cityId) {
  assertContentTable(table)
  if (!cityId) return []
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('city_id', cityId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Create a content row. `city_id` is set by the caller. Returns the new row. */
export async function createContent(table, payload) {
  assertContentTable(table)
  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Patch a content row (status changes, edits). Returns the updated row. */
export async function updateContent(table, id, patch) {
  assertContentTable(table)
  if (!id) throw new Error('updateContent: id is required')
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Public bucket for place images (created in supabase/storage.sql). Only admins
// can write to it; reads are public, so the returned URL renders directly. The
// news / events moderation screens reuse the same bucket for their images.
const PLACE_PHOTOS_BUCKET = 'place-photos'

/**
 * Upload an image file to the place-photos bucket and return its public URL
 * (the value to store in places.photos). The write is gated by the bucket's
 * admin-only RLS policies — non-admins get an error from Supabase.
 *
 * @param {File} file  an image File from a file input
 * @returns {Promise<string>} the public URL of the uploaded image
 */
export async function uploadPlacePhoto(file) {
  if (!file) throw new Error('uploadPlacePhoto: file is required')

  // A collision-resistant key without Date.now()/Math.random reliance: derive a
  // unique-enough name from the browser's crypto when available, else a UUID v4
  // via the SDK is overkill — randomUUID is in every supported browser.
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const key = `${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(PLACE_PHOTOS_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false })
  if (error) throw error

  const { data } = supabase.storage.from(PLACE_PHOTOS_BUCKET).getPublicUrl(key)
  return data.publicUrl
}
