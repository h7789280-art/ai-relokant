// CityMate AI chat proxy (CLAUDE.md §6, §11, §12) — Vercel serverless function.
// The model is called ONLY here, server-side: the Gemini key lives in
// process.env.GEMINI_API_KEY and never reaches the client bundle.
//
// POST /api/chat
//   body: { messages: [{ role: 'user' | 'assistant', text: string }, …],
//           lang: 'ru' | 'en' | …,
//           city_id: '<active city uuid>' }
//   200:  { reply: string }
//   4xx/5xx: { error: string, detail?: string }  ← always JSON, never a silent crash
//
// Stage 9B — grounding: before calling Gemini we pull the active city's
// APPROVED places from Supabase and hand them to the model as the ONLY source.
// The model must answer strictly from this list (no invented places / phones /
// addresses, no general knowledge). The per-user daily limit comes next.

// Gemini model. Flash tier (fast + free quota). One constant so it's trivial to
// bump when Google ships a newer Flash. See https://ai.google.dev/gemini-api.
const GEMINI_MODEL = 'gemini-2.5-flash'

const GEMINI_ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

// Cap on how many places we hand to the model, to keep the prompt cheap (§6).
// Promoted + verified are prioritised, so the most relevant rows survive the cap.
const MAX_PLACES = 30

// Free-tier daily message budget per user (CLAUDE.md §6/§12). One constant so
// it's trivial to change. Counted SERVER-SIDE in the ai_usage table (per UTC
// day). Over the limit we don't call Gemini and return a soft refusal instead.
const DAILY_LIMIT = 10

// Language code → human name, so the model gets an unambiguous instruction
// (CLAUDE.md §8 — the 13 start languages). Unknown codes fall back to the code.
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

// ---- Supabase grounding (server-side public read under RLS, §6/§9) ----------
//
// Reads the city's approved places via PostgREST. The anon key + URL are public
// (RLS gates every read), so the VITE_-prefixed vars are reused here — no
// separate server secret. Returns [] on any misconfiguration / error so chat
// degrades to an honest "no verified info" rather than crashing.
async function fetchApprovedPlaces(cityId) {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey || !cityId) return []

  // Embed the category/subcategory names so the model can match a query like
  // "стоматолог" to the Dentists subcategory. Promoted first, then verified.
  const select =
    'name,description,address,phone,whatsapp,hours,languages,is_promoted,is_verified,' +
    'category:categories(name,slug),subcategory:subcategories(name,slug)'
  const endpoint =
    `${url.replace(/\/$/, '')}/rest/v1/places` +
    `?city_id=eq.${encodeURIComponent(cityId)}` +
    `&status=eq.approved` +
    `&select=${encodeURIComponent(select)}` +
    `&order=is_promoted.desc,is_verified.desc,name.asc` +
    `&limit=120`

  try {
    const res = await fetch(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    })
    if (!res.ok) return []
    const rows = await res.json().catch(() => null)
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

// Fetch the active city's human-readable name and its country name, so the AI
// persona introduces itself with the user's ACTUAL city instead of a hardcoded
// one (CLAUDE.md §5). Reference tables are publicly readable in full (RLS), so
// we reuse the anon key exactly like fetchApprovedPlaces. Cities/countries carry
// only their latin `name` (no content_translations for reference data, §5.6),
// so that's what we return. Returns null on any failure → the persona falls back
// to a neutral wording (never to "Alanya").
async function fetchCityContext(cityId) {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey || !cityId) return null

  const endpoint =
    `${url.replace(/\/$/, '')}/rest/v1/cities` +
    `?id=eq.${encodeURIComponent(cityId)}` +
    `&select=${encodeURIComponent('name,country:countries(name)')}` +
    `&limit=1`

  try {
    const res = await fetch(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    })
    if (!res.ok) return null
    const rows = await res.json().catch(() => null)
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || !row.name) return null
    return { city: row.name, country: row.country?.name || null }
  } catch {
    return null
  }
}

// ---- Auth + per-user daily limit (CLAUDE.md §6) -----------------------------
//
// The client sends the user's Supabase access token in `Authorization: Bearer`.
// We verify it against Supabase Auth and get a TRUSTED user id — the client
// can't spoof it. Chat is gated behind sign-in, so a valid token always exists;
// anything else is a 401.
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

// Today's date as YYYY-MM-DD (UTC) — the usage bucket key.
function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

// Base URL + service_role headers for server-only ai_usage access. The
// service_role key bypasses RLS (CLAUDE.md §9) and must NEVER reach the client.
function usageRest() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return {
    base: `${url.replace(/\/$/, '')}/rest/v1/ai_usage`,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  }
}

// How many messages this user has sent today. Returns null on any failure so
// callers can FAIL OPEN (never block the user because accounting is unavailable).
async function todaysMessageCount(userId) {
  const rest = usageRest()
  if (!rest) return null
  const endpoint =
    `${rest.base}?select=message_count` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&usage_date=eq.${todayKey()}`
  try {
    const res = await fetch(endpoint, { headers: rest.headers })
    if (!res.ok) return null
    const rows = await res.json().catch(() => null)
    if (!Array.isArray(rows)) return null
    return rows.length ? Number(rows[0].message_count) || 0 : 0
  } catch {
    return null
  }
}

// Record one more message for the user today. `current` is the count we already
// read for the limit check, so we upsert current+1. Fail-open: errors are
// swallowed (a missed increment must never break or block the chat).
async function recordMessage(userId, current) {
  const rest = usageRest()
  if (!rest) return
  const next = (Number.isFinite(current) ? current : 0) + 1
  try {
    await fetch(`${rest.base}?on_conflict=user_id,usage_date`, {
      method: 'POST',
      headers: { ...rest.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        usage_date: todayKey(),
        message_count: next,
        updated_at: new Date().toISOString(),
      }),
    })
  } catch {
    // ignore — accounting is best-effort (fail-open).
  }
}

// Lowercase word tokens (≥3 chars) from the latest user turn, used for a light
// relevance match. Deliberately simple (§6 — no over-engineering).
function queryTokens(messages) {
  const lastUser = [...messages].reverse().find((m) => m && m.role !== 'assistant')
  const text = (lastUser?.text || '').toLowerCase()
  return [...new Set(text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))]
}

// Searchable haystack for a place row (base English fields + category labels).
function placeHaystack(p) {
  return [
    p.name,
    p.address,
    p.description,
    p.category?.name,
    p.category?.slug,
    p.subcategory?.name,
    p.subcategory?.slug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// Rank places by keyword relevance to the query, then promoted, then verified,
// and keep the top MAX_PLACES. When nothing matches the query we still pass the
// top promoted/verified rows so the model has city context (it will say there's
// no verified match if none fits).
function selectPlaces(places, tokens) {
  const scored = places.map((p, i) => {
    const hay = placeHaystack(p)
    const matches = tokens.reduce((n, tok) => (hay.includes(tok) ? n + 1 : n), 0)
    return { p, i, matches }
  })
  scored.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches
    const promo = Number(b.p.is_promoted) - Number(a.p.is_promoted)
    if (promo) return promo
    const ver = Number(b.p.is_verified) - Number(a.p.is_verified)
    if (ver) return ver
    return a.i - b.i // stable: keep the DB order (already promoted/verified/name)
  })
  return scored.slice(0, MAX_PLACES).map((s) => s.p)
}

// Render one place as a compact, unambiguous block for the model.
function formatPlace(p, n) {
  const lines = [`${n}. ${p.name || 'Unnamed'}`]
  const cat = [p.category?.name, p.subcategory?.name].filter(Boolean).join(' › ')
  if (cat) lines.push(`   Category: ${cat}`)
  if (p.address) lines.push(`   Address: ${p.address}`)
  if (p.phone) lines.push(`   Phone: ${p.phone}`)
  if (p.whatsapp) lines.push(`   WhatsApp: ${p.whatsapp}`)
  if (p.hours) {
    const hours = typeof p.hours === 'string' ? p.hours : JSON.stringify(p.hours)
    lines.push(`   Hours: ${hours}`)
  }
  if (Array.isArray(p.languages) && p.languages.length) {
    lines.push(`   Languages: ${p.languages.join(', ')}`)
  }
  const flags = []
  if (p.is_promoted) flags.push('PROMOTED (advertised)')
  if (p.is_verified) flags.push('VERIFIED')
  if (flags.length) lines.push(`   Flags: ${flags.join(', ')}`)
  return lines.join('\n')
}

// Build the grounded system instruction: persona + the strict source-of-truth
// rules (§6/§11) + the approved place list (or an explicit "empty" marker).
function systemInstruction(lang, places, cityContext) {
  const langName = LANGUAGE_NAMES[lang] || lang || 'English'

  // Persona location = the user's ACTUAL active city/country. Neutral fallback if
  // we couldn't resolve it — never a hardcoded city (CLAUDE.md §5.3).
  const placeLine = cityContext
    ? `The current city is ${cityContext.city}${cityContext.country ? `, ${cityContext.country}` : ''}.`
    : "You are helping in the user's current city."

  const rules = [
    'You are CityMate — a warm, knowledgeable local friend who helps people',
    `live in a new city. ${placeLine}`,
    '',
    'STRICT GROUNDING RULES — follow them exactly:',
    '- Answer ONLY from the verified CityMate places listed below. This list is',
    '  your single source of truth.',
    '- NEVER invent places, addresses, phone numbers, hours or any detail that is',
    '  not in the list. Do NOT use general world knowledge to name businesses.',
    '- If nothing in the list fits the question, say honestly — in the user\'s',
    '  language — that there is no verified information for this request yet.',
    '  Do not guess.',
    '- Show PROMOTED places first and clearly label them as advertised /',
    '  promoted (be transparent that it is a paid placement).',
    '- Label VERIFIED places as verified — it is a trust signal, not an ad.',
    '- Keep answers short and natural. When you list a place, include the details',
    '  that are present (address, phone/WhatsApp, hours, languages).',
    `- ALWAYS reply in the user's language: ${langName}.`,
  ]

  let source
  if (places.length === 0) {
    source = [
      '',
      'VERIFIED CITYMATE PLACES: (none available for this city right now)',
      'Because the list is empty, tell the user there is no verified information',
      'yet and avoid naming any specific business.',
    ]
  } else {
    source = [
      '',
      `VERIFIED CITYMATE PLACES (${places.length}), already ordered by priority:`,
      ...places.map((p, i) => formatPlace(p, i + 1)),
    ]
  }

  return [...rules, ...source].join('\n')
}

// Read + JSON-parse the request body. Vercel usually pre-parses JSON into
// req.body, but fall back to the raw stream so a missing parser never crashes.
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body.length > 0) {
    return JSON.parse(req.body)
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

// Map our message shape to Gemini's `contents`. Gemini uses 'user' / 'model'
// roles and `parts[].text`; everything that isn't an assistant turn is 'user'.
function toGeminiContents(messages) {
  return messages
    .filter((m) => m && typeof m.text === 'string' && m.text.trim() !== '')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'AI is not configured (missing GEMINI_API_KEY).' })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' })
    return
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  const lang = typeof body.lang === 'string' ? body.lang : 'en'
  const cityId = typeof body.city_id === 'string' ? body.city_id : ''
  const contents = toGeminiContents(messages)

  if (contents.length === 0) {
    res.status(400).json({ error: 'No messages to send.' })
    return
  }

  // Identify the user from their Supabase access token (chat is behind sign-in,
  // so a valid token is always present). No token => 401.
  const userId = await authenticatedUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Sign in to chat with CityMate.' })
    return
  }

  // Enforce the daily limit BEFORE spending a Gemini call. `count` is null when
  // accounting is unavailable — in that case we fail open and just let it through.
  const count = await todaysMessageCount(userId)
  if (count !== null && count >= DAILY_LIMIT) {
    res.status(200).json({ limitReached: true })
    return
  }

  // Ground the answer on the active city's approved places before calling Gemini,
  // and resolve the city/country names so the persona introduces the right city.
  const [allPlaces, cityContext] = await Promise.all([
    fetchApprovedPlaces(cityId),
    fetchCityContext(cityId),
  ])
  const places = selectPlaces(allPlaces, queryTokens(messages))

  try {
    const geminiRes = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction(lang, places, cityContext) }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    })

    const data = await geminiRes.json().catch(() => null)

    // Surface Gemini's own error text so the cause is visible on the front end.
    if (!geminiRes.ok) {
      const detail = data?.error?.message || `Gemini HTTP ${geminiRes.status}`
      res.status(502).json({ error: 'The AI service returned an error.', detail })
      return
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p?.text || '')
      .join('')
      .trim()

    if (!reply) {
      // No text — usually a safety block or an empty candidate. Pass the reason on.
      const detail =
        data?.promptFeedback?.blockReason ||
        data?.candidates?.[0]?.finishReason ||
        'No content returned.'
      res.status(502).json({ error: 'The AI returned no answer.', detail })
      return
    }

    // Count this message against today's budget (best-effort, fail-open).
    await recordMessage(userId, count)

    res.status(200).json({ reply })
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the AI service.', detail: String(err?.message || err) })
  }
}
