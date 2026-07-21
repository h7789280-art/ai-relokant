// Provider for the app-wide selection (country / city / language).
// Persists to localStorage so the welcome screen is shown only on first run
// (CLAUDE.md §4). Changing the selection later (header/profile) reuses
// `confirmSelection`.
import { useCallback, useMemo, useState } from 'react'
import i18n from '../i18n/index.js'
import { AppContext, CITIZENSHIP_KEY, STORAGE_KEY } from './appContext.js'

function loadSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // A valid selection needs at least a scoping city and a language.
    if (parsed && parsed.cityId && parsed.lang) return parsed
    return null
  } catch {
    return null
  }
}

// The user's citizenship (ISO alpha-2) — an optional profile setting the SOS
// screen uses to show THEIR consulate. Empty string means "not told us yet",
// which the SOS screen handles with a prompt rather than a guess.
function loadCitizenship() {
  try {
    return localStorage.getItem(CITIZENSHIP_KEY) || ''
  } catch {
    return ''
  }
}

export function AppProvider({ children }) {
  const [selection, setSelection] = useState(loadSelection)
  const [citizenship, setCitizenshipState] = useState(loadCitizenship)

  // Persist the citizenship code. Passing an empty value clears it (back to the
  // "tell us your citizenship" prompt on the SOS screen).
  const setCitizenship = useCallback((code) => {
    const next = (code || '').toUpperCase()
    try {
      if (next) localStorage.setItem(CITIZENSHIP_KEY, next)
      else localStorage.removeItem(CITIZENSHIP_KEY)
    } catch {
      // A blocked localStorage shouldn't break the setting for this session.
    }
    setCitizenshipState(next)
  }, [])

  // Persist the chosen country/city/language and switch the UI language.
  // `next` carries the full country and city rows so we can store display names.
  const confirmSelection = useCallback((next) => {
    const record = {
      countryId: next.country.id,
      countryCode: next.country.code,
      countryName: next.country.name,
      cityId: next.city.id,
      citySlug: next.city.slug,
      cityName: next.city.name,
      lang: next.lang,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    if (i18n.resolvedLanguage !== next.lang) {
      i18n.changeLanguage(next.lang)
    }
    setSelection(record)
  }, [])

  const value = useMemo(
    () => ({
      selection,
      isOnboarded: Boolean(selection?.cityId),
      // Active scoping key for every content query (CLAUDE.md §5).
      cityId: selection?.cityId ?? null,
      confirmSelection,
      // Citizenship (SOS consulate lookup) — independent of the selection above.
      citizenship,
      setCitizenship,
    }),
    [selection, confirmSelection, citizenship, setCitizenship],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
