// CityMate daily RSS news ingest (CLAUDE.md §7, §11) — Vercel Cron serverless.
// STAGE 1: collect + literal TR->RU translation. We pull a few curated Turkish
// RSS feeds, dedup, pick the freshest ≤MAX_NEW_PER_RUN NEW items, translate each
// item's headline + snippet LITERALLY into Russian (via the shared translate core,
// same Gemini model + proper-name-safe prompt as api/translate.js), and insert
// them into `news` as status='pending', source='ai_parse', linked to Alanya via
// news_cities — so they land in the admin moderation queue ALREADY in Russian.
//
// Trust (§11): the translation is LITERAL only — no summarising, no paraphrase,
// no invention; proper names / brands / addresses are left untranslated (§8). We
// do NOT keep the Turkish original (title/summary hold the Russian text).
//
// FAIL-SOFT (§7.2): translation is best-effort per item. If Gemini fails/times
// out/returns nothing for a given item, we DO NOT drop it and DO NOT fail the run
// — we insert that item with its Turkish text (exactly as stage 0 did) so the
// owner can finish the translation from the admin. The robot must still deliver
// data when Gemini is down. Such items are counted in `translateErrors`.
//
// GET /api/cron/ingest-news
//   Authorization: Bearer <CRON_SECRET>   ← Vercel Cron sends this automatically
//   200: { ok, feeds: [{ url, status, contentType, rawItems, kept, sampleTitles,
//         error }], candidates, uniqueLinks, inserted, skipped, translated,
//         translateErrors, cityResolved, feedErrors: [...], insertErrors: [...] }
//         (also console.log'd for Vercel logs)
//   401: { error }  when the bearer token doesn't match CRON_SECRET
//
// Only the ≤MAX_NEW_PER_RUN items actually being inserted are translated — never
// the full candidate set — so we don't burn Gemini quota on items the dedup drops.

import Parser from 'rss-parser'
import { translateFields } from '../_lib/translate-core.js'

// Curated feeds. Hardcoded for stage 0 (a `news_sources` table comes later).
// Each item lands in the city named by `city_slug` (Turkey). Antalya-province
// feeds cover Alanya, so they all map to Alanya for now.
//
// ⚠️ Feed-URL history (why these exact URLs) — checked 9 July 2026:
//  - haberler.com: the old `www.haberler.com/rss/antalya/` 301-redirects to
//    `rss.haberler.com/` which serves an HTML landing page (0 items). The real
//    RSS lives at `rss.haberler.com/rss.asp?kategori=<slug>` (valid RSS 2.0).
//  - haberantalya.com: BOTH old feeds (`/rss/type/news`, `/rss/category/…`) now
//    sit behind a Cloudflare "Just a moment…" JS challenge and return HTTP 403
//    to any server-side fetch — unusable from a serverless cron. Dropped.
//    Replaced with gazetealanya.com/rss, an Alanya-specific feed (no CF gate).
const NEWS_SOURCES = [
  { url: 'https://rss.haberler.com/rss.asp?kategori=antalya', source_name: 'Haberler — Antalya', city_slug: 'alanya' },
  { url: 'https://www.gazetealanya.com/rss', source_name: 'Gazete Alanya', city_slug: 'alanya' },
]

// Browser-ish User-Agent for feed fetches. Some Turkish sites answer 403 / an
// empty body to a default/no User-Agent, so we always send one.
const FEED_USER_AGENT =
  'Mozilla/5.0 (compatible; CityMateBot/1.0; +https://citymate.app)'

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

// Insert one news row (pending, ai_parse) and return its new id, or null on
// failure. `item.title`/`item.summary` are already the Russian translation (or,
// after a fail-soft, the Turkish text — §7.2). We request the created row back
// (Prefer: return=representation) so we can immediately link it to the city.
async function insertNews(rest, item) {
  try {
    const res = await fetch(`${rest.base}/news`, {
      method: 'POST',
      headers: { ...rest.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        title: item.title, // Russian (literal TR->RU); Turkish on fail-soft (§7.2)
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

// Literal TR->RU translation of one item's title + snippet, via the shared
// translate core (same Gemini model + proper-name-safe prompt as api/translate.js).
// Returns { title, summary, translated }:
//   * translated=true  -> Russian title/summary from Gemini (§7.2 stage 1)
//   * translated=false -> FAIL-SOFT: the original Turkish title/summary, so the
//     item is still inserted and the owner can finish it in the admin (§7.2).
// `apiKey` may be '' (missing config) — then we fail-soft without calling Gemini.
async function translateItemToRussian(item, apiKey) {
  // Build the fields to translate. summary may be empty — only translate what's
  // present (mirrors cleanFields: blanks are dropped).
  const fields = {}
  if (item.title && item.title.trim()) fields.title = item.title.trim()
  if (item.summary && item.summary.trim()) fields.summary = item.summary.trim()
  const fieldNames = Object.keys(fields)
  if (!apiKey || fieldNames.length === 0) {
    return { title: item.title, summary: item.summary, translated: false }
  }
  const result = await translateFields({
    fields,
    fieldNames,
    sourceLang: 'tr',
    targetLangs: ['ru'],
    apiKey,
  })
  if (!result.ok) {
    console.log(`[ingest-news] translate FAIL-SOFT (TR kept) url=${item.source_url} detail=${result.detail || result.error}`)
    return { title: item.title, summary: item.summary, translated: false }
  }
  const ru = result.translations?.ru
  // Guard the shape: a valid translation must at least give us a Russian title.
  if (!ru || typeof ru.title !== 'string' || !ru.title.trim()) {
    console.log(`[ingest-news] translate FAIL-SOFT (TR kept, bad shape) url=${item.source_url}`)
    return { title: item.title, summary: item.summary, translated: false }
  }
  return {
    // Russian title (required). Summary: use the Russian one when the model
    // returned it, otherwise keep whatever the base item had (possibly '').
    title: ru.title.trim(),
    summary: typeof ru.summary === 'string' ? ru.summary.trim() : item.summary,
    translated: true,
  }
}

// Fetch a feed ourselves (so we control redirects, User-Agent and can SEE the
// HTTP status + content-type) and hand the raw text to rss-parser. This is more
// robust than parser.parseURL, which hides the response and, for a feed that
// 301s to an HTML page, fails deep inside the XML parser with an opaque error.
// Returns { items, status, contentType, error } — never throws.
async function fetchFeed(parser, url) {
  let status = 0
  let contentType = ''
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': FEED_USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      },
    })
    status = res.status
    contentType = res.headers.get('content-type') || ''
    if (!res.ok) {
      return { items: [], status, contentType, error: `HTTP ${status}` }
    }
    const text = await res.text()
    // A feed that redirected to an HTML landing page (haberler.com's old URL did
    // exactly this) parses to zero items — flag it clearly instead of silently
    // returning nothing.
    if (/^\s*<!doctype html|<html[\s>]/i.test(text)) {
      return { items: [], status, contentType, error: 'response is HTML, not RSS/XML' }
    }
    const feed = await parser.parseString(text)
    return { items: feed.items || [], status, contentType, error: null }
  } catch (err) {
    return { items: [], status, contentType, error: String(err?.message || err) }
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
  console.log(`[ingest-news] cityResolved(alanya, ${COUNTRY_CODE}) = ${cityId || 'NOT FOUND'}`)
  if (!cityId) {
    res.status(500).json({ error: 'Could not resolve the Alanya city id.' })
    return
  }

  const parser = new Parser({ timeout: 15000 })

  // ---- 1) Fetch + parse every feed (fail-soft: a broken feed can't stop the
  // others — each is wrapped, and fetchFeed never throws). Log per feed so the
  // Vercel logs show, for EACH feed: URL, HTTP status, content-type, item count,
  // the first couple of titles, and any error.
  const feedErrors = []
  const feedReports = [] // per-feed detail for the final JSON summary
  const candidates = [] // normalised items, in feed order
  for (const src of NEWS_SOURCES) {
    const { items, status, contentType, error } = await fetchFeed(parser, src.url)
    let kept = 0
    const sampleTitles = []
    for (const entry of items) {
      const item = normaliseItem(entry, src.source_name)
      if (!item) continue
      if (sampleTitles.length < 2) sampleTitles.push(item.title)
      candidates.push(item)
      kept += 1
    }
    console.log(
      `[ingest-news] feed ${src.url} -> status=${status} ct="${contentType}" ` +
        `rawItems=${items.length} kept=${kept} error=${error || 'none'} ` +
        `sample=${JSON.stringify(sampleTitles)}`,
    )
    feedReports.push({
      url: src.url,
      source_name: src.source_name,
      status,
      contentType,
      rawItems: items.length,
      kept,
      sampleTitles,
      error: error || null,
    })
    if (error) feedErrors.push({ url: src.url, detail: error })
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

  // ---- 3) Translate (TR->RU, literal) + insert the fresh rows + Alanya link. --
  // Only these ≤MAX_NEW_PER_RUN items are translated — never the full candidate
  // set — so dedup-dropped items never cost Gemini quota (§7.2). Translation is
  // fail-soft per item: a failure keeps the Turkish text and still inserts.
  const geminiKey = process.env.GEMINI_API_KEY || ''
  if (!geminiKey) console.log('[ingest-news] GEMINI_API_KEY missing — inserting Turkish text (fail-soft) for all items')
  let inserted = 0
  let translated = 0
  let translateErrors = 0
  const insertErrors = []
  for (const item of fresh) {
    const ru = await translateItemToRussian(item, geminiKey)
    if (ru.translated) translated += 1
    else translateErrors += 1
    const row = { ...item, title: ru.title, summary: ru.summary }

    const newsId = await insertNews(rest, row)
    if (!newsId) {
      insertErrors.push({ source_url: item.source_url, detail: 'insert failed' })
      continue
    }
    const linked = await linkNewsCity(rest, newsId, cityId)
    if (!linked) insertErrors.push({ source_url: item.source_url, detail: 'link failed' })
    inserted += 1
  }

  const skipped = allUrls.length - fresh.length

  const summary = {
    ok: true,
    feeds: feedReports, // per-feed detail: url, status, contentType, rawItems, kept, sampleTitles, error
    candidates: candidates.length,
    uniqueLinks: allUrls.length,
    inserted,
    skipped, // duplicates + anything over MAX_NEW_PER_RUN this run
    translated, // items whose TR->RU translation succeeded (§7.2 stage 1)
    translateErrors, // items inserted with Turkish text after a fail-soft translation
    cityResolved: cityId,
    feedErrors,
    insertErrors,
  }
  // Emit the whole summary to the Vercel logs too, so the numbers are visible
  // even without inspecting the HTTP response body.
  console.log('[ingest-news] summary', JSON.stringify(summary))
  res.status(200).json(summary)
}
