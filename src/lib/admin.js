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

/**
 * Permanently delete a place (NOT a status change — the row is physically
 * removed). Admin-only via RLS (supabase/admin.sql). Also removes the place's
 * `content_translations`: that table is polymorphic (entity_type/entity_id, no
 * FK), so there is no DB cascade and we must clear the orphans ourselves (§8).
 * Irreversible — the caller must confirm first.
 */
export async function deletePlace(id) {
  if (!id) throw new Error('deletePlace: id is required')
  const { error } = await supabase.from('places').delete().eq('id', id)
  if (error) throw error
  await deleteContentTranslations('places', id)
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

/**
 * Permanently delete a content row (news / events / guides) — a physical delete,
 * not a status change. Admin-only via RLS (supabase/admin-content.sql). Also
 * clears the row's `content_translations` (polymorphic table, no FK cascade — §8)
 * so no orphaned translations are left behind. Irreversible; confirm first.
 */
export async function deleteContent(table, id) {
  assertContentTable(table)
  if (!id) throw new Error('deleteContent: id is required')
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
  await deleteContentTranslations(table, id)
}

/**
 * Remove every translation attached to one content row. Shared by the delete
 * helpers above. Admin-only via RLS (supabase/translations.sql).
 */
async function deleteContentTranslations(entityType, entityId) {
  const { error } = await supabase
    .from('content_translations')
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
  if (error) throw error
}

/**
 * Auto-cleanup of PAST events (CLAUDE.md §4 screen 5, owner rule) — "lazy"
 * purge run when the owner opens the admin Events tab.
 *
 * Safety by design: we never delete an event the moment it ends. Past events are
 * already HIDDEN from the public the instant their date passes (the query filter
 * in fetchUpcomingEvents, content.js); this only physically removes ones that
 * are well past — older than `bufferDays` (default 7) after their date — so
 * nothing is irreversibly dropped on a timer without a buffer.
 *
 * The event's date is its start; multi-day events still running (ends_at on/after
 * the cutoff) are kept. Undated events (no starts_at) are never auto-purged.
 * Orphaned translations are cleared too (no FK cascade, §8). Returns the count
 * deleted.
 *
 * @param {string} cityId  active city id (required)
 * @param {{ bufferDays?: number }} [opts]
 */
export async function purgePastEvents(cityId, { bufferDays = 7 } = {}) {
  if (!cityId) return 0
  const cutoffMs = Date.now() - bufferDays * 24 * 60 * 60 * 1000
  const cutoff = new Date(cutoffMs).toISOString()

  // Candidates: events that STARTED before the buffer cutoff (city-scoped).
  const { data, error } = await supabase
    .from('events')
    .select('id, ends_at')
    .eq('city_id', cityId)
    .lt('starts_at', cutoff)
  if (error) throw error

  // Keep any multi-day event still running (ends on/after the cutoff).
  const staleIds = (data ?? [])
    .filter((ev) => !ev.ends_at || new Date(ev.ends_at).getTime() < cutoffMs)
    .map((ev) => ev.id)
  if (staleIds.length === 0) return 0

  const { error: delErr } = await supabase.from('events').delete().in('id', staleIds)
  if (delErr) throw delErr
  const { error: trErr } = await supabase
    .from('content_translations')
    .delete()
    .eq('entity_type', 'events')
    .in('entity_id', staleIds)
  if (trErr) throw trErr
  return staleIds.length
}

// ---- Weekly market schedule (CLAUDE.md §4 screen 1, §5, §8) ----------------
// The owner sets the markets for each weekday (a weekday may have SEVERAL, in
// different districts); the Home rail then shows the current weekday's active
// rows (fetchTodayMarkets in content.js). This is owner-only reference data (an
// `is_active` flag, no moderation status). Every read/write is gated by the RLS
// in supabase/market-schedule.sql (admins only for inactive rows + all writes).
// city_id is set by the caller from the active city.

/**
 * All schedule rows for a city, ANY active state, ordered Mon→Sun (day_of_week
 * 1..7) then by name so same-day markets keep a stable order. Admins only for
 * inactive rows via RLS. Returns [].
 *
 * @param {string} cityId  active city id (required)
 */
export async function fetchMarketSchedule(cityId) {
  if (!cityId) return []
  const { data, error } = await supabase
    .from('market_schedule')
    .select('*')
    .eq('city_id', cityId)
    .order('day_of_week', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Save one market row. A weekday can now hold SEVERAL markets (different
 * districts), so there is no unique (city_id, day_of_week) key to upsert on —
 * instead we INSERT when the payload has no id, and UPDATE by id when it does.
 * `payload` must carry city_id + day_of_week. Returns the saved row.
 */
export async function saveMarketScheduleRow(payload) {
  if (!payload?.city_id || !payload?.day_of_week) {
    throw new Error('saveMarketScheduleRow: city_id and day_of_week are required')
  }
  const { id, ...fields } = payload
  const query = id
    ? supabase.from('market_schedule').update(fields).eq('id', id)
    : supabase.from('market_schedule').insert(fields)
  const { data, error } = await query.select('*').single()
  if (error) throw error
  return data
}

/**
 * Permanently delete one weekday's market row (physical delete) and clear its
 * translations (polymorphic table, no FK cascade — §8). Admin-only via RLS.
 * Irreversible; confirm at the call site.
 */
export async function deleteMarketScheduleDay(id) {
  if (!id) throw new Error('deleteMarketScheduleDay: id is required')
  const { error } = await supabase.from('market_schedule').delete().eq('id', id)
  if (error) throw error
  await deleteContentTranslations('market_schedule', id)
}

// ---- Content translations (CLAUDE.md §8) — Stage 11D -----------------------
// The owner translates a row's TEXT fields into the other 12 start languages and
// stores them in `content_translations` (key: entity_type / entity_id / lang /
// field). The base row keeps the source-language text; the translations table
// holds only the OTHER languages. RLS (supabase/translations.sql) lets only
// admins write; the public reads translations of approved rows via
// withTranslations() in src/lib/content.js.

// Which columns of each content type are translatable prose (everything else —
// phones, addresses, urls, coordinates, hours — is NOT translated, §8). The
// admin "Translate" UI is built from this map.
export const TRANSLATABLE_FIELDS = {
  places: ['name', 'description'],
  news: ['title', 'summary', 'body'],
  events: ['title', 'description'],
  guides: ['title', 'body'],
  market_schedule: ['name'],
}

/**
 * Call the server-side translator (api/translate.js) for one row's source-text
 * fields. Sends the admin's access token so the closed endpoint can authorise
 * the caller (§9). Returns { <lang>: { <field>: text } } for the other 12 langs.
 *
 * @param {Record<string,string>} fields  source-language { field: text }
 * @param {string} sourceLang             language `fields` are written in
 */
export async function requestTranslation(fields, sourceLang) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fields, sourceLang }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.translations) {
    throw new Error(json?.detail || json?.error || 'Translation failed.')
  }
  return json.translations
}

/**
 * Existing translations for one row, shaped as { <lang>: { <field>: value } }
 * so the editor can preload them. Admins can read these for rows in any status
 * (supabase/translations.sql). Returns {} when there are none.
 *
 * @param {('places'|'news'|'events'|'guides')} entityType
 * @param {string} entityId
 */
export async function fetchAdminTranslations(entityType, entityId) {
  if (!entityId) return {}
  const { data, error } = await supabase
    .from('content_translations')
    .select('lang, field, value')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
  if (error) throw error
  const byLang = {}
  for (const row of data ?? []) {
    ;(byLang[row.lang] ??= {})[row.field] = row.value
  }
  return byLang
}

/**
 * Persist a row's translations. `translations` is { <lang>: { <field>: value } }.
 * Non-empty values are upserted; cleared (blank) ones are deleted, so the editor
 * can both add and remove. Only the fields actually present are touched — fields
 * left out of the map are untouched.
 *
 * @param {('places'|'news'|'events'|'guides')} entityType
 * @param {string} entityId
 * @param {Record<string, Record<string, string>>} translations
 */
export async function saveTranslations(entityType, entityId, translations) {
  if (!entityId) throw new Error('saveTranslations: entityId is required')
  const toUpsert = []
  const toDelete = []
  for (const [lang, fields] of Object.entries(translations ?? {})) {
    for (const [field, raw] of Object.entries(fields ?? {})) {
      const value = (raw ?? '').trim()
      if (value) toUpsert.push({ entity_type: entityType, entity_id: entityId, lang, field, value })
      else toDelete.push({ lang, field })
    }
  }

  if (toUpsert.length) {
    const { error } = await supabase
      .from('content_translations')
      .upsert(toUpsert, { onConflict: 'entity_type,entity_id,lang,field' })
    if (error) throw error
  }
  for (const { lang, field } of toDelete) {
    const { error } = await supabase
      .from('content_translations')
      .delete()
      .match({ entity_type: entityType, entity_id: entityId, lang, field })
    if (error) throw error
  }
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
