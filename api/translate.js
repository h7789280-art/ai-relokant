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

// Same Flash tier + endpoint shape as api/chat.js (one constant to bump later).
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

// The 13 start languages (§8). Keep in sync with src/i18n/index.js and chat.js.
const LANGUAGE_NAMES = {
  ru: 'Russian',
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  uk: 'Ukrainian',
  pl: 'Polish',
  nl: 'Dutch',
  cs: 'Czech',
  fr: 'French',
  fi: 'Finnish',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
}
const ALL_LANGS = Object.keys(LANGUAGE_NAMES)

// Defensive cap: a content field is short prose; refuse anything absurd so a bad
// caller can't push a huge prompt through. (Bodies/guides are well under this.)
const MAX_FIELD_CHARS = 8000

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

// Keep only non-empty string fields, trimmed and length-capped. Returns the
// cleaned { field: text } map (drops blanks — nothing to translate there).
function cleanFields(fields) {
  if (!fields || typeof fields !== 'object') return {}
  const out = {}
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val !== 'string') continue
    const text = val.trim()
    if (!text) continue
    out[key] = text.slice(0, MAX_FIELD_CHARS)
  }
  return out
}

// ---- Gemini prompt + strict JSON schema ------------------------------------
// We force structured JSON via responseSchema so the model can't wrap the answer
// in markdown or drop a language: object of <lang> -> object of <field> -> string.
function buildResponseSchema(targetLangs, fieldNames) {
  const fieldProps = {}
  for (const f of fieldNames) fieldProps[f] = { type: 'string' }
  const langProps = {}
  for (const l of targetLangs) {
    langProps[l] = { type: 'object', properties: fieldProps, required: fieldNames }
  }
  return { type: 'object', properties: langProps, required: targetLangs }
}

function buildPrompt(fields, sourceLang, targetLangs) {
  const sourceName = LANGUAGE_NAMES[sourceLang] || sourceLang
  const targets = targetLangs.map((l) => `${l} (${LANGUAGE_NAMES[l]})`).join(', ')
  return [
    'You are a professional localization translator for CityMate, a city-life',
    'assistant app for tourists and expats.',
    `Translate the content fields below from ${sourceName} into EACH target`,
    `language: ${targets}.`,
    '',
    'RULES:',
    '- Do NOT translate proper names or brands: keep "CityMate", "WhatsApp",',
    '  "Instagram", "Telegram", and any business / brand / product names as-is.',
    '- Do NOT translate addresses or place names literally — leave address-like',
    '  text unchanged.',
    '- Preserve any markdown, line breaks and formatting exactly.',
    '- Keep the tone natural, warm and concise — the same register as the source.',
    '- Translate every field for every target language. If a value is a proper',
    '  name with nothing to translate, return it unchanged (never leave it empty).',
    '- Return ONLY the JSON object required by the schema. No markdown, no fences,',
    '  no commentary.',
    '',
    'SOURCE FIELDS (JSON):',
    JSON.stringify(fields),
  ].join('\n')
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

  try {
    const geminiRes = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(fields, sourceLang, targetLangs) }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: buildResponseSchema(targetLangs, fieldNames),
        },
      }),
    })

    const data = await geminiRes.json().catch(() => null)

    if (!geminiRes.ok) {
      const detail = data?.error?.message || `Gemini HTTP ${geminiRes.status}`
      res.status(502).json({ error: 'The translation service returned an error.', detail })
      return
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('').trim()
    if (!raw) {
      const detail =
        data?.promptFeedback?.blockReason ||
        data?.candidates?.[0]?.finishReason ||
        'No content returned.'
      res.status(502).json({ error: 'The translator returned no answer.', detail })
      return
    }

    let translations
    try {
      translations = JSON.parse(raw)
    } catch {
      res.status(502).json({ error: 'The translator returned malformed JSON.', detail: raw.slice(0, 300) })
      return
    }

    res.status(200).json({ translations })
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the translation service.', detail: String(err?.message || err) })
  }
}
