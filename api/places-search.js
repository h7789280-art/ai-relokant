// CityMate Google Places search proxy (CLAUDE.md §7, §9) — Vercel serverless.
// Admin-only helper that speeds up catalog seeding (esp. chain stores — A101,
// BIM, Migros): the owner types a query, picks a result, and the place form's
// TEXT fields auto-fill. Photos/logo are NOT pulled here — the owner uploads
// those by hand through the existing photo control.
//
// POST /api/places-search
//   Authorization: Bearer <supabase access token>   ← OWNER/ADMIN only
//   body: { query: "A101 Mahmutlar Alanya",
//           languageCode?: 'ru' | 'tr' | 'en' | … }  // UI language, optional
//   200:  { results: [{ id, name, address, lat, lng, hours,
//                        phone, website, mapsUrl }] }  // possibly empty
//   4xx/5xx: { error: string, detail?: string }        // always JSON
//
// SECURITY (§9):
//   * The Google key lives ONLY in process.env.GOOGLE_PLACES_API_KEY (never
//     VITE_, never in the client bundle). Google is called ONLY here.
//   * Closed to admins: we verify the caller's Supabase token, then confirm
//     they are in the `admins` table with the service_role key (fail-closed),
//     exactly like api/translate.js — so the paid Places quota can't be drained
//     by anyone who is merely signed in.

// Places API (New) Text Search endpoint (§7). The key travels in the
// X-Goog-Api-Key header; the fields we want travel in X-Goog-FieldMask so
// Google only bills for those fields (no wildcard mask).
const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'

// Exactly the fields we consume — nothing more, so we don't pay for extras (§7).
// `places.` prefix is required by the Text Search field mask.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.regularOpeningHours',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
].join(',')

// The owner searches across many cities of Turkey and the UAE, so we keep the
// language allowlist to the 13 start languages (§8); anything else falls back to
// English. The languageCode localizes formattedAddress + opening-hours text.
const ALLOWED_LANGS = new Set([
  'ru', 'en', 'tr', 'de', 'uk', 'pl', 'nl', 'cs', 'fr', 'fi', 'sv', 'no', 'da',
])

// Cap the result list — the owner picks one; a short list keeps the UI tidy and
// the response cheap.
const MAX_RESULTS = 8

// ---- Auth: trusted user id from the Supabase access token (mirrors translate.js)
async function authenticatedUserId(req) {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
  if (!token) return null

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const user = await res.json().catch(() => null)
    return typeof user?.id === 'string' ? user.id : null
  } catch {
    return null
  }
}

// Is this user in the `admins` table? Checked with the service_role key (bypasses
// RLS, §9 — server-only). Fail CLOSED: false on any error (denying the paid
// Places lookup is the safe side, exactly like api/translate.js).
async function isAdminUser(userId) {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || !userId) return false
  try {
    const res = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/admins` +
        `?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    if (!res.ok) return false
    const rows = await res.json().catch(() => null)
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

// ---- Request body ----------------------------------------------------------
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body.length > 0) return JSON.parse(req.body)
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

// Opening hours as a single human-readable string for the free-text `hours`
// field (§5.8 — hours are NOT translated). Places gives us localized
// weekdayDescriptions (one line per day); we join them so the owner can tweak
// them by hand. Returns '' when the place has no published hours.
function formatHours(regularOpeningHours) {
  const days = regularOpeningHours?.weekdayDescriptions
  if (!Array.isArray(days) || days.length === 0) return ''
  return days.join('\n')
}

// Map one Google place to the compact shape the admin form consumes. Only the
// TEXT facts we auto-fill (§7) — no photos. Missing fields become '' / null so
// the client can blank-check them safely.
function toResult(p) {
  return {
    id: p.id || null,
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    lat: typeof p.location?.latitude === 'number' ? p.location.latitude : null,
    lng: typeof p.location?.longitude === 'number' ? p.location.longitude : null,
    hours: formatHours(p.regularOpeningHours),
    phone: p.internationalPhoneNumber || '',
    website: p.websiteUri || '',
    mapsUrl: p.googleMapsUri || '',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Places search is not configured (missing GOOGLE_PLACES_API_KEY).' })
    return
  }

  // Closed endpoint: must be a signed-in admin (§9). Verify token, then admin.
  const userId = await authenticatedUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Sign in as an admin to search places.' })
    return
  }
  if (!(await isAdminUser(userId))) {
    res.status(403).json({ error: 'Admins only.' })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' })
    return
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) {
    res.status(400).json({ error: 'Enter something to search for.' })
    return
  }
  const languageCode = ALLOWED_LANGS.has(body.languageCode) ? body.languageCode : 'en'

  try {
    const googleRes = await fetch(PLACES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, languageCode, pageSize: MAX_RESULTS }),
    })

    const data = await googleRes.json().catch(() => null)

    // Surface Google's own error text so the cause is visible on the front end
    // (rather than an opaque 500).
    if (!googleRes.ok) {
      const detail = data?.error?.message || `Google Places HTTP ${googleRes.status}`
      res.status(502).json({ error: 'The Places service returned an error.', detail })
      return
    }

    // Empty result is a normal, soft outcome — not an error (§7).
    const places = Array.isArray(data?.places) ? data.places : []
    const results = places.slice(0, MAX_RESULTS).map(toResult)
    res.status(200).json({ results })
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the Places service.', detail: String(err?.message || err) })
  }
}
