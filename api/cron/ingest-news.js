// CityMate daily RSS news ingest (CLAUDE.md §7, §11) — Vercel Cron serverless.
// STAGE 0 (MVP): collect only. We pull a few curated Turkish RSS feeds, insert
// the freshest items into `news` as status='pending', source='ai_parse', and
// link them to Alanya via news_cities — so they land straight in the admin
// moderation queue. NO Gemini and NO translation here: the base row is the
// Turkish headline VERBATIM from the feed (0 invention, §11). The owner presses
// "Save & translate" on approval, which fans it out to the other 12 languages.
//
// GET /api/cron/ingest-news
//   Authorization: Bearer <CRON_SECRET>   ← Vercel Cron sends this automatically
//   200: { ok, feeds, inserted, skipped, cityResolved, feedErrors: [...] }
//   401: { error }  when the bearer token doesn't match CRON_SECRET
//
// Trust rules (§11): title and source_url are stored EXACTLY as the feed gives
// them (no rewriting, no summarising); a link to the primary source is required
// on every row (items without a link are skipped).

import Parser from 'rss-parser'

// Curated feeds. Hardcoded for stage 0 (a `news_sources` table comes later).
// Each item lands in the city named by `city_slug` (Turkey). Antalya-province
// feeds cover Alanya, so they all map to Alanya for now.
const NEWS_SOURCES = [
  { url: 'https://www.haberler.com/rss/antalya/', source_name: 'Haberler — Antalya', city_slug: 'alanya' },
  { url: 'https://www.haberantalya.com/rss/type/news', source_name: 'Haber Antalya', city_slug: 'alanya' },
  { url: 'https://www.haberantalya.com/rss/category/kultur-sanat', source_name: 'Haber Antalya — Kültür', city_slug: 'alanya' },
]

// Max NEW rows inserted per run. Whatever doesn't fit is picked up tomorrow —
// keeps the moderation queue digestible and the run cheap.
const MAX_NEW_PER_RUN = 5

// ISO-3166 alpha-2 of the country whose city slugs above belong to (Turkey).
const COUNTRY_CODE = 'TR'

// ---- Supabase (service_role, server-only, §9) -------------------------------
// The cron writes past RLS with the service_role key, exactly like ai_usage in
// api/chat.js. The key NEVER reaches the client bundle.
function serviceRest() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return {
    base: `${url.replace(/\/$/, '')}/rest/v1`,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  }
}

// Resolve a city id by slug within the given country code. Returns null on any
// failure (unknown slug / misconfig) so the caller aborts cleanly.
async function resolveCityId(rest, slug, countryCode) {
  const select = 'id,slug,country:countries!inner(code)'
  const endpoint =
    `${rest.base}/cities` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&country.code=eq.${encodeURIComponent(countryCode)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=1`
  try {
    const res = await fetch(endpoint, { headers: rest.headers })
    if (!res.ok) return null
    const rows = await res.json().catch(() => null)
    const row = Array.isArray(rows) ? rows[0] : null
    return row?.id || null
  } catch {
    return null
  }
}

// Which of `urls` already exist in `news.source_url`? ONE batched select over the
// whole run's link set (not per-item), so dedup costs a single round-trip. Returns
// a Set of the already-present source_urls.
async function existingSourceUrls(rest, urls) {
  const seen = new Set()
  if (!urls.length) return seen
  // PostgREST in.() list — quote each value and comma-join. URLs contain commas
  // rarely, but quoting keeps the list unambiguous regardless.
  const inList = urls.map((u) => `"${String(u).replace(/"/g, '\\"')}"`).join(',')
  const endpoint =
    `${rest.base}/news` +
    `?source_url=in.(${encodeURIComponent(inList)})` +
    `&select=source_url`
  try {
    const res = await fetch(endpoint, { headers: rest.headers })
    if (!res.ok) return seen
    const rows = await res.json().catch(() => null)
    if (Array.isArray(rows)) for (const r of rows) if (r?.source_url) seen.add(r.source_url)
  } catch {
    // On a read error we fall back to "none seen" — the DB write below is still
    // guarded by the source_url content and MAX_NEW_PER_RUN, so worst case is a
    // possible duplicate row an admin can delete, never a crash.
  }
  return seen
}

// Insert one news row (Turkish base, pending, ai_parse) and return its new id, or
// null on failure. We request the created row back (Prefer: return=representation)
// so we can immediately link it to the city.
async function insertNews(rest, item) {
  try {
    const res = await fetch(`${rest.base}/news`, {
      method: 'POST',
      headers: { ...rest.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        title: item.title, // Turkish headline, VERBATIM from the feed (§11)
        summary: item.summary,
        source_url: item.source_url, // primary source, required (§11)
        source_name: item.source_name,
        published_at: item.published_at,
        status: 'pending',
        source: 'ai_parse',
        // city_id left NULL on purpose — visibility comes from news_cities (§5.3).
      }),
    })
    if (!res.ok) return null
    const rows = await res.json().catch(() => null)
    const row = Array.isArray(rows) ? rows[0] : null
    return row?.id || null
  } catch {
    return null
  }
}

// Link a news row to a city. The enforce_news_cities_same_country trigger runs
// server-side; one Alanya link can't conflict. Returns true on success.
async function linkNewsCity(rest, newsId, cityId) {
  try {
    const res = await fetch(`${rest.base}/news_cities`, {
      method: 'POST',
      headers: { ...rest.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ news_id: newsId, city_id: cityId }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Collapse whitespace + trim; cap length so a feed's full-article content can't
// bloat a summary. Returns '' for empty/blank input.
function cleanSummary(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return clean.length > 2000 ? `${clean.slice(0, 2000)}…` : clean
}

// Normalise one RSS item into the shape insertNews expects, or null when it has
// no usable link (source_url is required, §11) or no title.
function normaliseItem(entry, sourceName) {
  const title = String(entry.title || '').trim()
  const link = String(entry.link || entry.guid || '').trim()
  if (!title || !link) return null
  const published = entry.isoDate || entry.pubDate || null
  return {
    title,
    summary: cleanSummary(entry.contentSnippet || entry.content || ''),
    source_url: link,
    source_name: sourceName,
    published_at: published ? new Date(published).toISOString() : null,
  }
}

export default async function handler(req, res) {
  // ---- Auth: only Vercel Cron (or a caller holding CRON_SECRET) may run this.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    res.status(500).json({ error: 'Cron is not configured (missing CRON_SECRET).' })
    return
  }
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized.' })
    return
  }

  const rest = serviceRest()
  if (!rest) {
    res.status(500).json({ error: 'Supabase is not configured (missing service role key).' })
    return
  }

  // Resolve Alanya's id once for the whole run (all stage-0 feeds map to it).
  const cityId = await resolveCityId(rest, 'alanya', COUNTRY_CODE)
  if (!cityId) {
    res.status(500).json({ error: 'Could not resolve the Alanya city id.' })
    return
  }

  const parser = new Parser({ timeout: 15000 })

  // ---- 1) Fetch + parse every feed (fail-soft: a broken feed is skipped). ----
  const feedErrors = []
  const candidates = [] // normalised items, in feed order
  for (const src of NEWS_SOURCES) {
    try {
      const feed = await parser.parseURL(src.url)
      for (const entry of feed.items || []) {
        const item = normaliseItem(entry, src.source_name)
        if (item) candidates.push(item)
      }
    } catch (err) {
      feedErrors.push({ url: src.url, detail: String(err?.message || err) })
    }
  }

  // ---- 2) Dedup in ONE batched select over all candidate links. --------------
  // Collapse duplicate links within this run first, then ask the DB which links
  // already exist, and keep only genuinely-new items.
  const uniqueByUrl = new Map()
  for (const item of candidates) if (!uniqueByUrl.has(item.source_url)) uniqueByUrl.set(item.source_url, item)
  const allUrls = [...uniqueByUrl.keys()]
  const alreadyStored = await existingSourceUrls(rest, allUrls)

  const fresh = []
  for (const item of uniqueByUrl.values()) {
    if (!alreadyStored.has(item.source_url)) fresh.push(item)
    if (fresh.length >= MAX_NEW_PER_RUN) break
  }

  // ---- 3) Insert the fresh rows + their Alanya link. -------------------------
  let inserted = 0
  const insertErrors = []
  for (const item of fresh) {
    const newsId = await insertNews(rest, item)
    if (!newsId) {
      insertErrors.push({ source_url: item.source_url, detail: 'insert failed' })
      continue
    }
    const linked = await linkNewsCity(rest, newsId, cityId)
    if (!linked) insertErrors.push({ source_url: item.source_url, detail: 'link failed' })
    inserted += 1
  }

  const skipped = allUrls.length - fresh.length

  res.status(200).json({
    ok: true,
    feeds: NEWS_SOURCES.length,
    candidates: candidates.length,
    uniqueLinks: allUrls.length,
    inserted,
    skipped, // duplicates + anything over MAX_NEW_PER_RUN this run
    cityResolved: cityId,
    feedErrors,
    insertErrors,
  })
}
