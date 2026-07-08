#!/usr/bin/env node
// ============================================================================
// CityMate — i18n:sync  (CLAUDE.md §8)
// ----------------------------------------------------------------------------
// Fills in MISSING interface-translation keys across the 13 locale files so the
// other languages never lag behind when new strings are added.
//
//   HOW TO RUN
//     GEMINI_API_KEY=xxxx  npm run i18n:sync        # translate missing keys
//     npm run i18n:sync -- --dry-run                # report only, no API calls
//     npm run i18n:sync -- --include-admin          # also fill admin.* keys
//
//   ENVIRONMENT
//     Needs GEMINI_API_KEY (server-side key, read from process.env or a local
//     .env file — NEVER hard-coded, NEVER shipped to the client). Same key and
//     same Gemini model the app already uses in api/translate.js. If nothing is
//     missing, no key is required — the run is a no-op.
//
//   WHAT IT DOES
//     * Reference locale is en (the fullest). Every other locale is diffed
//       against en by its full set of (nested) keys.
//     * ONLY missing keys are translated. Keys a locale already has are left
//       byte-for-byte untouched — existing values are never re-translated or
//       overwritten. Re-running with no new keys changes nothing (idempotent).
//     * Placeholders/format tokens ({{count}}, {{city}}, <1>, \n, ₺ € $ %) are
//       preserved: the model is told to keep them verbatim AND every result is
//       validated afterwards. If a translation's tokens don't match the source,
//       that one key is skipped with a warning (never written half-broken).
//     * admin.* keys (owner-only internal UI) are SKIPPED by default; pass
//       --include-admin to translate them too.
//
//   NOT wired into `npm run build` — this is a manual, on-demand tool so the
//   Gemini quota isn't touched on every build.
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LOCALES_DIR = join(ROOT, 'src', 'i18n', 'locales')

// ---- Config ---------------------------------------------------------------
const REFERENCE_LANG = 'en'
// Keep in sync with src/i18n/index.js SUPPORTED_LANGUAGES and api/translate.js.
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

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

// Translate at most this many keys per Gemini call (keeps output within limits).
const BATCH_SIZE = 40

// ---- CLI flags ------------------------------------------------------------
const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const INCLUDE_ADMIN = argv.includes('--include-admin')

// ---- Minimal .env loader (no dependency) ----------------------------------
// Loads KEY=VALUE lines from ./.env into process.env WITHOUT overriding vars
// already set in the real environment. Only used to pick up GEMINI_API_KEY for
// local runs; the key is never written anywhere.
function loadDotEnv() {
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m) continue
    const key = m[1]
    let val = m[2]
    if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = val
  }
}

// ---- JSON helpers ---------------------------------------------------------
function readLocale(lang) {
  const path = join(LOCALES_DIR, `${lang}.json`)
  return JSON.parse(readFileSync(path, 'utf8'))
}
function writeLocale(lang, obj) {
  const path = join(LOCALES_DIR, `${lang}.json`)
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

// Flatten a nested object to a Map of dot-path → string leaf. Only string leaves
// are treated as translatable keys (these locale files have no arrays).
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, path, out)
    } else {
      out.set(path, v)
    }
  }
  return out
}

// Does a nested object already contain this dot-path (as an existing leaf)?
function hasPath(obj, path) {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object' || !(p in cur)) return false
    cur = cur[p]
  }
  return true
}

// Set a dot-path to a value, creating intermediate objects as needed. Never
// overwrites an existing object node with a string (defensive).
function setPath(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (cur[p] === undefined || cur[p] === null || typeof cur[p] !== 'object') {
      cur[p] = {}
    }
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

// ---- Placeholder / format-token guards ------------------------------------
// Everything that MUST survive translation byte-for-byte. Compared as multisets
// between source and translation; any mismatch → the key is rejected.
function extractGuards(str) {
  const s = String(str)
  const placeholders = (s.match(/\{\{[^}]+\}\}/g) || []).slice().sort()
  const tags = (s.match(/<\/?[^<>]+>/g) || []).slice().sort()
  const symbols = {}
  for (const sym of ['₺', '€', '$', '%']) {
    const count = s.split(sym).length - 1
    if (count) symbols[sym] = count
  }
  const newlines = (s.match(/\n/g) || []).length
  return { placeholders, tags, symbols, newlines }
}

function guardsMatch(a, b) {
  if (a.placeholders.length !== b.placeholders.length) return false
  if (a.placeholders.some((p, i) => p !== b.placeholders[i])) return false
  if (a.tags.length !== b.tags.length) return false
  if (a.tags.some((t, i) => t !== b.tags[i])) return false
  if (a.newlines !== b.newlines) return false
  const keys = new Set([...Object.keys(a.symbols), ...Object.keys(b.symbols)])
  for (const k of keys) if ((a.symbols[k] || 0) !== (b.symbols[k] || 0)) return false
  return true
}

// ---- Gemini call ----------------------------------------------------------
function buildPrompt(entries, targetLang) {
  const targetName = LANGUAGE_NAMES[targetLang]
  const payload = {}
  for (const [key, text] of entries) payload[key] = text
  return [
    'You are a professional localization translator for CityMate, a city-life',
    'assistant app for tourists and expats.',
    `Translate the UI string VALUES below from English into ${targetName}.`,
    '',
    'The input is a JSON object of { key: englishText }. Return a JSON object',
    'with the SAME keys, where each value is the translation of that string.',
    '',
    'RULES:',
    '- Keys are identifiers — NEVER translate or change them, only the values.',
    '- Keep interpolation placeholders EXACTLY as-is, verbatim and in place:',
    '  anything inside {{ }} such as {{count}}, {{city}}, {{amount}}, {{max}},',
    '  {{base}}, {{symbol}}. Do not translate, reorder or space them out.',
    '- Keep tags like <1> </1>, line breaks (\\n), and the symbols ₺ € $ %',
    '  exactly as they appear.',
    '- Do NOT translate the product name "CityMate", nor brand names like',
    '  "WhatsApp", "Instagram", "Telegram".',
    '- Match the tone of the source: natural, warm, concise UI copy.',
    '- Every value must be real translated text in the target language (never',
    '  leave English), except proper names which stay as-is.',
    '- Return ONLY the JSON object. No markdown, no code fences, no commentary.',
    '',
    'INPUT (JSON):',
    JSON.stringify(payload),
  ].join('\n')
}

function buildResponseSchema(keys) {
  const properties = {}
  for (const k of keys) properties[k] = { type: 'string' }
  return { type: 'object', properties, required: keys }
}

async function translateBatch(entries, targetLang, apiKey) {
  const keys = entries.map(([k]) => k)
  const res = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(entries, targetLang) }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: buildResponseSchema(keys),
      },
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.error?.message || `Gemini HTTP ${res.status}`
    throw new Error(detail)
  }
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('').trim()
  if (!raw) {
    const detail =
      data?.promptFeedback?.blockReason ||
      data?.candidates?.[0]?.finishReason ||
      'No content returned.'
    throw new Error(detail)
  }
  return JSON.parse(raw)
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ---- Main -----------------------------------------------------------------
async function main() {
  loadDotEnv()

  console.log('CityMate i18n:sync — reference locale: en' + (DRY_RUN ? '  (dry run)' : ''))
  if (!INCLUDE_ADMIN) console.log('Note: admin.* keys are skipped (owner-only UI). Use --include-admin to include them.')

  const reference = readLocale(REFERENCE_LANG)
  const refFlat = flatten(reference)

  // Which reference keys are eligible (drop admin.* unless asked).
  const eligibleKeys = [...refFlat.keys()].filter(
    (k) => INCLUDE_ADMIN || !k.startsWith('admin.'),
  )

  // Per-language diff (no network needed).
  const targetLangs = ALL_LANGS.filter((l) => l !== REFERENCE_LANG)
  const plan = []
  let adminSkippedTotal = 0
  for (const lang of targetLangs) {
    const locale = readLocale(lang)
    const missing = eligibleKeys.filter((k) => !hasPath(locale, k))
    if (!INCLUDE_ADMIN) {
      const adminMissing = [...refFlat.keys()].filter(
        (k) => k.startsWith('admin.') && !hasPath(locale, k),
      ).length
      adminSkippedTotal += adminMissing
    }
    plan.push({ lang, locale, missing })
  }

  const totalMissing = plan.reduce((n, p) => n + p.missing.length, 0)
  console.log('')
  console.log('Missing keys per language:')
  for (const { lang, missing } of plan) {
    console.log(`  ${lang}: ${missing.length}`)
  }
  if (!INCLUDE_ADMIN && adminSkippedTotal > 0) {
    console.log(`  (admin.* keys skipped across languages: ${adminSkippedTotal})`)
  }
  console.log('')

  if (totalMissing === 0) {
    console.log('Everything is in sync — nothing to translate. ✅')
    return
  }

  if (DRY_RUN) {
    console.log(`Dry run: ${totalMissing} key-translations would be requested. Sample per language:`)
    for (const { lang, missing } of plan) {
      if (!missing.length) continue
      console.log(`  ${lang}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`)
    }
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('')
    console.error('ERROR: GEMINI_API_KEY is not set. Missing keys were found but cannot be')
    console.error('translated without the server-side Gemini key. Set GEMINI_API_KEY in your')
    console.error('environment (or local .env) and re-run, or use --dry-run to preview.')
    process.exitCode = 1
    return
  }

  let grandTranslated = 0
  let grandSkipped = 0
  const changedFiles = []

  for (const { lang, locale, missing } of plan) {
    if (!missing.length) continue
    console.log(`Translating → ${lang} (${LANGUAGE_NAMES[lang]}): ${missing.length} keys`)

    let translated = 0
    let skipped = 0
    const batches = chunk(missing, BATCH_SIZE)
    for (const batch of batches) {
      const entries = batch.map((k) => [k, refFlat.get(k)])
      let result
      try {
        result = await translateBatch(entries, lang, apiKey)
      } catch (err) {
        console.warn(`  ! batch failed (${batch.length} keys): ${err.message} — skipping this batch`)
        skipped += batch.length
        continue
      }
      for (const [key, sourceText] of entries) {
        const value = result?.[key]
        if (typeof value !== 'string' || !value.trim()) {
          console.warn(`  ! ${lang} ${key}: no translation returned — skipped`)
          skipped++
          continue
        }
        if (!guardsMatch(extractGuards(sourceText), extractGuards(value))) {
          console.warn(`  ! ${lang} ${key}: placeholder/format mismatch — skipped (kept unset)`)
          skipped++
          continue
        }
        setPath(locale, key, value)
        translated++
      }
    }

    if (translated > 0) {
      writeLocale(lang, locale)
      changedFiles.push(`src/i18n/locales/${lang}.json`)
    }
    console.log(`  ${lang}: ${translated} written, ${skipped} skipped`)
    grandTranslated += translated
    grandSkipped += skipped
  }

  console.log('')
  console.log('Done.')
  console.log(`  Total translated & written: ${grandTranslated}`)
  console.log(`  Total skipped: ${grandSkipped}`)
  console.log(`  Files changed: ${changedFiles.length ? changedFiles.join(', ') : '(none)'}`)
  if (grandSkipped > 0) {
    console.log('  Some keys were skipped (placeholder mismatch or API issue). Re-run to retry them.')
  }
}

main().catch((err) => {
  console.error('i18n:sync failed:', err?.message || err)
  process.exitCode = 1
})
