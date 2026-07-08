// Local persistence for the AI chat transcript (CLAUDE.md §4.2, §6). The chat
// screen only holds its messages in React state, so switching tabs and coming
// back wipes the conversation. This keeps the LAST conversation on the device —
// the same localStorage approach used for the country/city/language selection
// (src/context/appContext.js) and the interface language (src/i18n/index.js).
//
// This is DRAW-ONLY persistence: restoring the transcript just re-renders past
// bubbles. It never calls /api/chat and never touches the daily limit — a new
// request goes out only when the user actually sends a new message.

// Bumping the version resets the stored transcript if the shape ever changes.
const STORAGE_KEY = 'citymate.chat.v1'

// Sliding-window cap: keep only the most recent messages so the transcript can
// never grow without bound. Oldest ones are silently dropped on save.
export const MAX_MESSAGES = 30

/**
 * Load the last saved conversation. Returns an array of { role, text } (newest
 * last), or [] when there's nothing valid stored.
 * @returns {{ role: 'user' | 'assistant', text: string }[]}
 */
export function loadChatHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Keep only well-formed bubbles, and enforce the cap on read too (in case a
    // larger transcript was written by an older build).
    return parsed
      .filter((m) => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-MAX_MESSAGES)
  } catch {
    return []
  }
}

/**
 * Persist the conversation, keeping only the last MAX_MESSAGES (sliding window).
 * @param {{ role: string, text: string }[]} messages
 */
export function saveChatHistory(messages) {
  try {
    const trimmed = (messages ?? []).slice(-MAX_MESSAGES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage full / unavailable (private mode): losing persistence is fine,
    // the in-memory chat keeps working.
  }
}

/** Wipe the saved conversation (used by the "Clear chat" button). */
export function clearChatHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — nothing to clean up if storage is unavailable.
  }
}
