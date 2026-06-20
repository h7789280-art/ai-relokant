// Provider for the app-wide selection (country / city / language).
// Persists to localStorage so the welcome screen is shown only on first run
// (CLAUDE.md §4). Changing the selection later (header/profile) reuses
// `confirmSelection`.
import { useCallback, useMemo, useState } from 'react'
import i18n from '../i18n/index.js'
import { AppContext, STORAGE_KEY } from './appContext.js'

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

export function AppProvider({ children }) {
  const [selection, setSelection] = useState(loadSelection)

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
    }),
    [selection, confirmSelection],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
