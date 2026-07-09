// CityMate shared translation core (CLAUDE.md §6, §8) — server-only helper.
// Extracted verbatim from api/translate.js so BOTH the admin translate endpoint
// AND the RSS news cron (api/cron/ingest-news.js, §7.2 stage 1) reuse the SAME
// Gemini model, the SAME proper-name-safe prompt and the SAME strict JSON schema.
// This module is NOT a Vercel route (the `_lib` prefix keeps it off the routing
// table). It performs no auth of its own — callers gate access (translate.js:
// admin-only; the cron: CRON_SECRET).
//
// translateFields() NEVER throws: it returns a discriminated result
//   { ok: true,  translations: { <lang>: { <field>: text } } }
//   { ok: false, status, error, detail }
// so each caller decides what a failure means (translate.js surfaces the HTTP
// error to the admin; the cron falls back to the Turkish base row, §7.2 fail-soft).

// Same Flash tier + endpoint shape as api/chat.js (one constant to bump later).
export const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

// The 13 start languages (§8). Keep in sync with src/i18n/index.js and chat.js.
export const LANGUAGE_NAMES = {
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
export const ALL_LANGS = Object.keys(LANGUAGE_NAMES)

// Defensive cap: a content field is short prose; refuse anything absurd so a bad
// caller can't push a huge prompt through. (Bodies/guides are well under this.)
const MAX_FIELD_CHARS = 8000

// Keep only non-empty string fields, trimmed and length-capped. Returns the
// cleaned { field: text } map (drops blanks — nothing to translate there).
export function cleanFields(fields) {
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

// Translate already-cleaned `fields` from `sourceLang` into `targetLangs` in one
// Gemini call. `fields` must be pre-cleaned via cleanFields() (non-empty, capped);
// `fieldNames` are its keys. Returns a discriminated result (see file header);
// never throws. Mirrors api/translate.js's original error mapping (all 502).
export async function translateFields({ fields, fieldNames, sourceLang, targetLangs, apiKey }) {
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
      return { ok: false, status: 502, error: 'The translation service returned an error.', detail }
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('').trim()
    if (!raw) {
      const detail =
        data?.promptFeedback?.blockReason ||
        data?.candidates?.[0]?.finishReason ||
        'No content returned.'
      return { ok: false, status: 502, error: 'The translator returned no answer.', detail }
    }

    let translations
    try {
      translations = JSON.parse(raw)
    } catch {
      return { ok: false, status: 502, error: 'The translator returned malformed JSON.', detail: raw.slice(0, 300) }
    }

    return { ok: true, translations }
  } catch (err) {
    return { ok: false, status: 502, error: 'Could not reach the translation service.', detail: String(err?.message || err) }
  }
}
