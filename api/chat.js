// CityMate AI chat proxy (CLAUDE.md §6) — Vercel serverless function.
// The model is called ONLY here, server-side: the Gemini key lives in
// process.env.GEMINI_API_KEY and never reaches the client bundle.
//
// POST /api/chat
//   body: { messages: [{ role: 'user' | 'assistant', text: string }, …],
//           lang: 'ru' | 'en' | … }
//   200:  { reply: string }
//   4xx/5xx: { error: string, detail?: string }  ← always JSON, never a silent crash
//
// Stage 9A: a working Gemini chat. Grounding on Supabase city data and the
// per-user daily limit are deliberately NOT here yet — they come next.

// Gemini model. Flash tier (fast + free quota). One constant so it's trivial to
// bump when Google ships a newer Flash. See https://ai.google.dev/gemini-api.
const GEMINI_MODEL = 'gemini-2.5-flash'

const GEMINI_ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

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

// System persona (§6). Grounding on real city data is the next step.
function systemInstruction(lang) {
  const langName = LANGUAGE_NAMES[lang] || lang || 'English'
  return [
    'You are CityMate — a warm, knowledgeable local friend who helps people',
    'live in a new city. The current city is Alanya, Turkey.',
    'Answer briefly, in a natural human tone, and be genuinely useful for',
    'everyday questions (places, services, documents, transport, daily life).',
    `ALWAYS reply in the user's language: ${langName}.`,
    'If you are unsure about a specific place or fact, say so honestly rather',
    'than inventing details.',
  ].join(' ')
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
  const contents = toGeminiContents(messages)

  if (contents.length === 0) {
    res.status(400).json({ error: 'No messages to send.' })
    return
  }

  try {
    const geminiRes = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction(lang) }] },
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

    res.status(200).json({ reply })
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the AI service.', detail: String(err?.message || err) })
  }
}
