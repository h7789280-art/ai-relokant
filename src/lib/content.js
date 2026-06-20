// Public content query helpers (CLAUDE.md §5 scoping, §7 moderation).
//
// Every public read of a content table MUST be scoped to the active city and
// limited to approved rows. RLS enforces the approved filter server-side too,
// but we also apply it here so the intent is explicit and queries stay cheap.
// Use these helpers instead of calling `supabase.from(...)` directly for content.
import { supabase } from './supabase'

// Content tables that are city-scoped AND moderated.
export const CONTENT_TABLES = ['places', 'events', 'guides', 'news', 'ads']

/**
 * Base query builder for a public content read: filtered by city_id and
 * status = 'approved'. Returns a Supabase query builder you can further refine
 * (.order(), .eq(), .limit(), …) before awaiting.
 *
 * @param {string} table   one of CONTENT_TABLES
 * @param {string} cityId  active city id (required — no city, no content)
 * @param {{ columns?: string }} [opts]
 */
export function publicContentQuery(table, cityId, { columns = '*' } = {}) {
  if (!CONTENT_TABLES.includes(table)) {
    throw new Error(`publicContentQuery: "${table}" is not a city-scoped content table`)
  }
  if (!cityId) {
    throw new Error(`publicContentQuery: cityId is required for "${table}"`)
  }
  return supabase
    .from(table)
    .select(columns)
    .eq('city_id', cityId)
    .eq('status', 'approved')
}

/**
 * Fetch approved content rows for the active city.
 * @returns {Promise<Array>} rows (throws on error)
 */
export async function fetchContent(table, cityId, { columns = '*', limit } = {}) {
  let query = publicContentQuery(table, cityId, { columns })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Fetch translations for a set of content rows in a single language and merge
 * them onto the rows. Only approved-parent translations are returned (RLS), so
 * this is safe to call with public rows.
 *
 * @param {('places'|'events'|'guides'|'news'|'ads')} entityType
 * @param {Array<{id: string}>} rows
 * @param {string} lang  one of the 13 start languages
 * @returns {Promise<Array>} rows with translated fields applied
 */
export async function withTranslations(entityType, rows, lang) {
  if (!rows?.length || !lang) return rows ?? []
  const ids = rows.map((r) => r.id)
  const { data, error } = await supabase
    .from('content_translations')
    .select('entity_id, field, value')
    .eq('entity_type', entityType)
    .eq('lang', lang)
    .in('entity_id', ids)
  if (error) throw error

  // Index translations by row id: { [entity_id]: { field: value } }
  const byId = new Map()
  for (const t of data ?? []) {
    const fields = byId.get(t.entity_id) ?? {}
    fields[t.field] = t.value
    byId.set(t.entity_id, fields)
  }
  return rows.map((row) => {
    const overrides = byId.get(row.id)
    return overrides ? { ...row, ...overrides } : row
  })
}

// ---- Reference data (read in full; inactive shown as "(soon)" in UI, §4) ----

/** Countries ordered for the welcome-screen selector. */
export async function fetchCountries() {
  const { data, error } = await supabase
    .from('countries')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Cities for a country, ordered for the welcome-screen selector. */
export async function fetchCities(countryId) {
  if (!countryId) return []
  const { data, error } = await supabase
    .from('cities')
    .select('*')
    .eq('country_id', countryId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}
