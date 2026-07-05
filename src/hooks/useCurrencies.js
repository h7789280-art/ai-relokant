// Home currency-card selection, persisted locally — same approach as the
// language (i18n) and city (AppProvider) choices: a versioned localStorage key
// that works for guests, no account needed (CLAUDE.md §8). Bumping the version
// resets everyone's selection if the stored shape ever changes.
import { useCallback, useState } from 'react'
import {
  AVAILABLE_CURRENCIES,
  DEFAULT_CURRENCIES,
  MAX_CURRENCIES,
} from '../lib/currency.js'

export const STORAGE_KEY = 'citymate.currencies.v1'

const KNOWN = new Set(AVAILABLE_CURRENCIES.map((c) => c.code))

// Read the stored codes, keeping only known ones and capping at the max. Falls
// back to the historical default (USD/EUR/RUB) for anyone who never picked.
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CURRENCIES
    const parsed = JSON.parse(raw)
    const clean = Array.isArray(parsed)
      ? parsed.filter((c) => KNOWN.has(c)).slice(0, MAX_CURRENCIES)
      : []
    return clean.length ? clean : DEFAULT_CURRENCIES
  } catch {
    return DEFAULT_CURRENCIES
  }
}

/** @returns {[string[], (next: string[]) => void]} selected codes + setter. */
export function useCurrencies() {
  const [codes, setCodes] = useState(load)

  const setSelection = useCallback((next) => {
    const clean = next.filter((c) => KNOWN.has(c)).slice(0, MAX_CURRENCIES)
    const value = clean.length ? clean : DEFAULT_CURRENCIES
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    setCodes(value)
  }, [])

  return [codes, setSelection]
}
