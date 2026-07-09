// CityMate content translation proxy (CLAUDE.md §6, §8, §9) — Vercel serverless.
// Stage 11D. Auto-translates a single content row's TRANSLATABLE fields from its
// source language into the other 12 start languages, in ONE Gemini call.
//
// POST /api/translate
//   Authorization: Bearer <supabase access token>   ← OWNER/ADMIN only
//   body: { fields: { <fieldName>: "<source text>", … },   // e.g. {name, description}
//           sourceLang: 'ru' | 'en' | … }                  // language of `fields`
//   200:  { translations: { <lang>: { <fieldName>: "<text>" }, … } }  // the 12 others
//   4xx/5xx: { error: string, detail?: string }            // always JSON
//
// SECURITY (§9):
//   * The Gemini key lives ONLY in process.env.GEMINI_API_KEY (never VITE_).
//   * The endpoint is closed to admins: we verify the caller's Supabase token,
//     then confirm they are in the `admins` table using the service_role key.
//     This keeps the translation quota from being drained by anyone signed in.
//   * This call does NOT touch the ai_usage table — the §6 daily chat limit and
//     translation are deliberately separate budgets.
//
// The Gemini model, the proper-name-safe prompt and the strict JSON schema now
// live in api/_lib/translate-core.js, so the RSS news cron (§7.2) reuses the exact
// same translation core. This handler's request/response contract is unchanged.

import { ALL_LANGS, cleanFields, translateFields } from './_lib/translate-core.js'

// ---- Auth: trusted user id from the Supabase access token (mirrors chat.js) --
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

// Is this user in the `admins` table? Checked with the service_role key so it
// bypasses RLS (the client can only ever read its own admins row). The key is
// server-only (§9) and never reaches the bundle. Returns false on any failure —
// fail CLOSED here (unlike the chat limit, denying translation is the safe side).
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Translation is not configured (missing GEMINI_API_KEY).' })
    return
  }

  // Closed endpoint: must be a signed-in admin (§9). Verify token, then admin.
  const userId = await authenticatedUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Sign in as an admin to translate.' })
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

  const sourceLang = typeof body.sourceLang === 'string' ? body.sourceLang : 'en'
  if (!ALL_LANGS.includes(sourceLang)) {
    res.status(400).json({ error: `Unknown source language: ${sourceLang}.` })
    return
  }

  const fields = cleanFields(body.fields)
  const fieldNames = Object.keys(fields)
  if (fieldNames.length === 0) {
    res.status(400).json({ error: 'No translatable fields provided.' })
    return
  }

  // The 12 others — never re-emit the source language (its text IS the base row).
  const targetLangs = ALL_LANGS.filter((l) => l !== sourceLang)

  const result = await translateFields({ fields, fieldNames, sourceLang, targetLangs, apiKey })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, detail: result.detail })
    return
  }
  res.status(200).json({ translations: result.translations })
}
