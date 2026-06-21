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
 * @param {object} [opts]
 * @param {string} [opts.columns]
 * @param {number} [opts.limit]
 * @param {{ column: string, ascending?: boolean }} [opts.order]
 * @returns {Promise<Array>} rows (throws on error)
 */
export async function fetchContent(table, cityId, { columns = '*', limit, order } = {}) {
  let query = publicContentQuery(table, cityId, { columns })
  if (order) {
    // nullsFirst:false keeps undated rows out of the way of the freshest items.
    query = query.order(order.column, { ascending: order.ascending ?? false, nullsFirst: false })
  }
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

// ---- Catalog: categories, subcategories, places (§4.3, §5, §12) ------------

/** Active categories ordered for the catalog grid (reference data, full read). */
export async function fetchCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** A single category by its slug (for the category screen). Null if missing. */
export async function fetchCategoryBySlug(slug) {
  if (!slug) return null
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Active subcategories for a category, ordered for the filter chips. */
export async function fetchSubcategories(categoryId) {
  if (!categoryId) return []
  const { data, error } = await supabase
    .from('subcategories')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * All active subcategories across categories (for catalog-wide search, where we
 * match a subcategory by its localized label client-side and link to its parent
 * category). Carries `category_id` so the caller can resolve the parent slug.
 */
export async function fetchAllSubcategories() {
  const { data, error } = await supabase
    .from('subcategories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Free-text search over approved places in the active city (the plain catalog
 * search — NOT the AI assistant, §4/§6). Matches the base name/address with a
 * case-insensitive LIKE; promoted placements lead, then by name.
 *
 * @param {string} cityId  active city id (required)
 * @param {string} query   user text (empty/whitespace → no results)
 * @param {{ columns?: string, limit?: number }} [opts]
 */
export async function searchPlaces(cityId, query, { columns = '*', limit = 30 } = {}) {
  const q = query?.trim()
  if (!cityId || !q) return []
  // The PostgREST .or() filter treats commas/parentheses as syntax, so strip
  // them (and the LIKE wildcards) from user input before interpolating.
  const safe = q.replace(/[,()%*]/g, ' ').trim()
  if (!safe) return []
  const { data, error } = await publicContentQuery('places', cityId, { columns })
    .or(`name.ilike.%${safe}%,address.ilike.%${safe}%`)
    .order('is_promoted', { ascending: false })
    .order('name', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

/**
 * Approved places for the active city, optionally narrowed to a category /
 * subcategory. Promoted (paid) placements come FIRST so the UI can list them on
 * top with an honest "promoted" label (§12); within each group, by name.
 *
 * @param {string} cityId  active city id (required)
 * @param {{ categoryId?: string, subcategoryId?: string, columns?: string }} [opts]
 */
export async function fetchPlaces(cityId, { categoryId, subcategoryId, columns = '*' } = {}) {
  let query = publicContentQuery('places', cityId, { columns })
  if (categoryId) query = query.eq('category_id', categoryId)
  if (subcategoryId) query = query.eq('subcategory_id', subcategoryId)
  query = query
    .order('is_promoted', { ascending: false })
    .order('name', { ascending: true })
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * A single approved place by id (for the place card). The approved filter is
 * also enforced by RLS, but we keep it explicit. Returns null when not found.
 */
export async function fetchPlace(placeId) {
  if (!placeId) return null
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('id', placeId)
    .eq('status', 'approved')
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Approved places for a set of ids (for the Favorites screen, §4). Order is NOT
 * guaranteed — the caller re-orders to match its own list (e.g. favorite order).
 * A favorite whose place was removed or unapproved simply drops out. Empty ids
 * → [].
 *
 * @param {string[]} ids
 * @param {{ columns?: string }} [opts]
 */
export async function fetchPlacesByIds(ids, { columns = '*' } = {}) {
  if (!ids?.length) return []
  const { data, error } = await supabase
    .from('places')
    .select(columns)
    .in('id', ids)
    .eq('status', 'approved')
  if (error) throw error
  return data ?? []
}

// ---- Single content rows for the detail screens (§4) -----------------------

/**
 * A single approved news item by id (for the news article page). The approved
 * filter is also enforced by RLS; kept explicit here. Returns null when missing.
 */
export async function fetchNewsItem(newsId) {
  if (!newsId) return null
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('id', newsId)
    .eq('status', 'approved')
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * A single approved guide by id (for the "Documents & life" guide page).
 * Returns null when not found.
 */
export async function fetchGuide(guideId) {
  if (!guideId) return null
  const { data, error } = await supabase
    .from('guides')
    .select('*')
    .eq('id', guideId)
    .eq('status', 'approved')
    .maybeSingle()
  if (error) throw error
  return data
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

/**
 * Fetch a single city row by id (needed for its coordinates — the persisted
 * selection only stores ids/names, not lat/lon). Returns null when not found.
 */
export async function fetchCity(cityId) {
  if (!cityId) return null
  const { data, error } = await supabase
    .from('cities')
    .select('*')
    .eq('id', cityId)
    .maybeSingle()
  if (error) throw error
  return data
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
