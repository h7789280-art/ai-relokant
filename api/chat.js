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

// ---- Grounding: events / news / guides / markets (CLAUDE.md §5.3, §6) -------
//
// Stage 1 of widening the AI's field of view: besides places, the model now also
// sees the SAME events/news/guides/markets a user sees on their city's screens.
// The hard invariant (§5.3/§5.4): everything is built ONLY from the trusted
// city_id in the request body, using the EXACT same visibility functions the
// screens use, so the AI's field of view matches the screens and the
// city/country boundary can't leak:
//   * events  → RPC events_by_country_proximity (event_cities visibility +
//               country boundary live inside it) — never a raw select * on events.
//   * news    → news_cities !inner join on city_id + status=approved.
//   * guides  → guide_cities !inner join on city_id + status=approved.
//   * markets → market_schedule for today's Turkey weekday, is_active only.
// All read under the anon key + RLS, and all fail SOFT (return []) so a reader
// error degrades to "no verified info" instead of breaking chat.

// Public PostgREST base (anon key + URL, both public — RLS gates every read,
// §6/§9). Returns null when unconfigured so callers can bail to [].
function publicRest() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return {
    base: url.replace(/\/$/, ''),
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  }
}

// Small helper: GET a PostgREST endpoint and return a rows array, or [] on any
// failure. Keeps each reader below to a single clear line.
async function restRows(endpoint, headers) {
  try {
    const res = await fetch(endpoint, { headers })
    if (!res.ok) return []
    const rows = await res.json().catch(() => null)
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

// Turkey is UTC+3 all year (no DST since 2016). We measure "today" by Turkey
// wall-clock everywhere in the afisha/markets, so a day doesn't flip a few hours
// early/late for users in other timezones (mirrors src/lib/content.js).
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000

// Today's weekday in Turkey time, ISO-8601: 1 = Monday … 7 = Sunday. Pure port of
// turkeyDayOfWeek() from src/lib/content.js — keep the two in sync.
function turkeyDayOfWeek() {
  const nowTurkey = new Date(Date.now() + TURKEY_OFFSET_MS)
  const jsDay = nowTurkey.getUTCDay() // 0 = Sunday … 6 = Saturday
  return jsDay === 0 ? 7 : jsDay
}

// Format an ISO instant as Turkey-local { date: 'YYYY-MM-DD', time: 'HH:MM' } so
// the model states event times in the city's own clock. Null on missing/bad input.
function turkeyDateTime(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return null
  const d = new Date(ms + TURKEY_OFFSET_MS)
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }
}

// Cap constants — keep the prompt cheap (§6). Small N per type on purpose.
const MAX_EVENTS = 10
const MAX_NEWS = 5
const MAX_GUIDES = 10

// Regional afisha the user's city actually shows — the SAME source as Events.jsx
// (RPC events_by_country_proximity: event_cities visibility + country boundary +
// not-past cutoff + proximity order all live server-side). No dates passed
// (p_from/p_to default NULL) → the full upcoming feed, capped to the soonest few.
// We then resolve venue city NAMES for the formatter in one extra read.
async function fetchUpcomingEvents(cityId) {
  const rest = publicRest()
  if (!rest || !cityId) return []
  // POST the RPC with its args as a JSON body (the standard PostgREST RPC call);
  // ?limit caps the returned set. The RPC's own ORDER BY is preserved.
  let rows = []
  try {
    const res = await fetch(`${rest.base}/rest/v1/rpc/events_by_country_proximity?limit=${MAX_EVENTS}`, {
      method: 'POST',
      headers: { ...rest.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_city_id: cityId }),
    })
    if (!res.ok) return []
    const data = await res.json().catch(() => null)
    rows = Array.isArray(data) ? data : []
  } catch {
    return []
  }
  if (!rows.length) return rows

  // Resolve venue city names in ONE read so the formatter can say where each
  // event physically happens (the RPC returns only venue_city_id).
  const venueIds = [...new Set(rows.map((e) => e.venue_city_id).filter(Boolean))]
  if (venueIds.length) {
    const inList = venueIds.map((id) => `"${id}"`).join(',')
    const cityRows = await restRows(
      `${rest.base}/rest/v1/cities?id=in.(${encodeURIComponent(inList)})&select=id,name`,
      rest.headers,
    )
    const nameById = new Map(cityRows.map((c) => [c.id, c.name]))
    for (const e of rows) e.venue_city_name = nameById.get(e.venue_city_id) || null
  }
  return rows
}

// Freshest approved news SHOWN in the active city — the same visibility as
// fetchContent('news'): a news_cities !inner join on city_id (+ status=approved),
// NOT the legacy city_id column. The link table can't cross a country (§5.4), so
// the boundary holds. Newest first.
async function fetchCityNews(cityId) {
  const rest = publicRest()
  if (!rest || !cityId) return []
  const select = 'title,summary,source_name,published_at,news_cities!inner(city_id)'
  const endpoint =
    `${rest.base}/rest/v1/news` +
    `?status=eq.approved` +
    `&news_cities.city_id=eq.${encodeURIComponent(cityId)}` +
    `&select=${encodeURIComponent(select)}` +
    `&order=published_at.desc.nullslast` +
    `&limit=${MAX_NEWS}`
  return restRows(endpoint, rest.headers)
}

// Approved guides SHOWN in the active city — the same visibility as
// fetchContent('guides'): a guide_cities !inner join on city_id (+ approved), NOT
// the legacy city_id column. Titles + a short body snippet only (§6 prompt size).
async function fetchCityGuides(cityId) {
  const rest = publicRest()
  if (!rest || !cityId) return []
  const select = 'title,body,disclaimer,guide_cities!inner(city_id)'
  const endpoint =
    `${rest.base}/rest/v1/guides` +
    `?status=eq.approved` +
    `&guide_cities.city_id=eq.${encodeURIComponent(cityId)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=${MAX_GUIDES}`
  return restRows(endpoint, rest.headers)
}

// Today's markets for the city — the same rule as fetchTodayMarkets: active rows
// for the CURRENT Turkey weekday only. However many there are today (0..few).
async function fetchTodayMarketsProxy(cityId) {
  const rest = publicRest()
  if (!rest || !cityId) return []
  const dow = turkeyDayOfWeek()
  const select = 'name,hours,address,day_of_week'
  const endpoint =
    `${rest.base}/rest/v1/market_schedule` +
    `?city_id=eq.${encodeURIComponent(cityId)}` +
    `&day_of_week=eq.${dow}` +
    `&is_active=eq.true` +
    `&select=${encodeURIComponent(select)}` +
    `&order=name.asc`
  return restRows(endpoint, rest.headers)
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

// Ticket price as a short human phrase, or null when the event has no pricing.
// Proper names / amounts are passed through verbatim (§8) — no invention.
function formatPrice(e) {
  const cur = e.price_currency || 'TRY'
  if (e.price_type === 'free') return 'Free'
  if (e.price_type === 'deposit' && e.price_deposit != null) {
    return `Deposit ${e.price_deposit} ${cur}`
  }
  if (e.price_type === 'paid') {
    const from = e.price_from
    const to = e.price_to
    if (from != null && to != null) return `${from}–${to} ${cur}`
    if (from != null) return `from ${from} ${cur}`
    if (to != null) return `up to ${to} ${cur}`
    return 'Paid'
  }
  return null
}

// Render one regional-afisha event compactly. Title carries proper names (artist
// / brand) verbatim in latin, exactly as stored (§8) — do not transliterate.
function formatEvent(e, n) {
  const lines = [`${n}. ${e.title || 'Untitled event'}`]
  const dt = turkeyDateTime(e.starts_at)
  if (dt) lines.push(`   When: ${dt.date} ${dt.time} (Turkey time)`)
  else lines.push('   When: date to be announced')
  const venue = [e.location, e.venue_city_name].filter(Boolean).join(', ')
  if (venue) lines.push(`   Venue: ${venue}`)
  const price = formatPrice(e)
  if (price) lines.push(`   Price: ${price}`)
  return lines.join('\n')
}

// Render one news item: headline + the short summary (what happened / who it
// affects). Source name is a trust signal, shown when present (§11).
function formatNews(nw, n) {
  const lines = [`${n}. ${nw.title || 'Untitled'}`]
  if (nw.summary) lines.push(`   ${nw.summary}`)
  if (nw.source_name) lines.push(`   Source: ${nw.source_name}`)
  return lines.join('\n')
}

// Render one guide: title + a short body snippet (guides are long markdown, so we
// truncate to keep the prompt cheap, §6). Disclaimer noted so the model relays it.
function formatGuide(g, n) {
  const lines = [`${n}. ${g.title || 'Untitled guide'}`]
  if (g.body) {
    const snippet = String(g.body).replace(/\s+/g, ' ').trim().slice(0, 240)
    if (snippet) lines.push(`   ${snippet}${g.body.length > 240 ? '…' : ''}`)
  }
  if (g.disclaimer) lines.push('   (Has an official disclaimer — remind the user to verify with official sources.)')
  return lines.join('\n')
}

// Render one market: district name + weekday + hours + address.
function formatMarket(m, n) {
  const lines = [`${n}. ${m.name || 'Market'}`]
  if (m.hours) lines.push(`   Hours: ${m.hours}`)
  if (m.address) lines.push(`   Address: ${m.address}`)
  return lines.join('\n')
}

// Build one "SECTION HEADER: …" block from a row list + its formatter. When the
// list is empty we emit an explicit "(none …)" marker so the model KNOWS there is
// no data and must not invent any (§6 grounding), instead of the section vanishing.
function sourceSection(header, rows, formatter, emptyNote) {
  if (!rows.length) return ['', `${header}: (none — ${emptyNote})`]
  return ['', `${header} (${rows.length}):`, ...rows.map((r, i) => formatter(r, i + 1))]
}

// Build the grounded system instruction: persona + the strict source-of-truth
// rules (§6/§11) + the approved place list (or an explicit "empty" marker).
function systemInstruction(lang, places, cityContext, extra = {}) {
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
    '- Besides places you also have VERIFIED EVENTS, CITY NEWS, GUIDES and',
    '  MARKETS TODAY below. Use them the SAME way: answer about events, news,',
    '  guides or markets ONLY from these lists. Never invent an event, date, time,',
    '  price, news item, headline or market. If a section says "(none …)", tell the',
    '  user honestly there is no verified information for that yet — do not guess.',
    '- Keep proper names (artists, brands) exactly as written — do not translate or',
    '  transliterate them; only your surrounding text is in the user\'s language.',
    '- Events/news may also be promoted or partner-placed; the same honesty applies',
    '  — never present a paid/promoted item as an organic recommendation.',
    '- For guides on legal/official topics (residence permit, taxes, documents),',
    '  remind the user the info is for reference and to verify with official sources.',
    `- ALWAYS reply in the user's language: ${langName}.`,
  ]

  let placeSource
  if (places.length === 0) {
    placeSource = [
      '',
      'VERIFIED CITYMATE PLACES: (none available for this city right now)',
      'Because the list is empty, tell the user there is no verified information',
      'yet and avoid naming any specific business.',
    ]
  } else {
    placeSource = [
      '',
      `VERIFIED CITYMATE PLACES (${places.length}), already ordered by priority:`,
      ...places.map((p, i) => formatPlace(p, i + 1)),
    ]
  }

  const { events = [], news = [], guides = [], markets = [] } = extra
  const otherSources = [
    ...sourceSection('VERIFIED EVENTS', events, formatEvent, 'no upcoming events shown in this city'),
    ...sourceSection('CITY NEWS', news, formatNews, 'no recent news for this city'),
    ...sourceSection('GUIDES', guides, formatGuide, 'no guides for this city yet'),
    ...sourceSection('MARKETS TODAY', markets, formatMarket, 'no market scheduled today'),
  ]

  return [...rules, ...placeSource, ...otherSources].join('\n')
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

  // Ground the answer on EVERYTHING the active city's screens show — approved
  // places, the regional afisha, city news, guides and today's markets — before
  // calling Gemini, plus the city/country names for the persona. All read under
  // the same trusted city_id with the SAME visibility functions the screens use
  // (§5.3/§5.4), so the AI's field of view matches the screens and the boundary
  // can't leak. Each reader fails soft to [] — a miss degrades to "no verified
  // info", never a crash.
  const [allPlaces, cityContext, events, news, guides, markets] = await Promise.all([
    fetchApprovedPlaces(cityId),
    fetchCityContext(cityId),
    fetchUpcomingEvents(cityId),
    fetchCityNews(cityId),
    fetchCityGuides(cityId),
    fetchTodayMarketsProxy(cityId),
  ])
  const places = selectPlaces(allPlaces, queryTokens(messages))

  try {
    const geminiRes = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction(lang, places, cityContext, { events, news, guides, markets }) }],
        },
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
