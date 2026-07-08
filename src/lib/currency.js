// Currency rates for the home screen (CLAUDE.md §4.1).
// open.er-api.com — free, stable, no API key. We read rates based on the active
// country's local currency and show what 1 unit of a foreign currency is worth
// in it — the reference currency a newcomer actually spends (Turkey → lira,
// UAE → dirham). The base follows the active country, it is not hardcoded.
//
// Which currencies appear on the card is user-configurable (gear on the card);
// the choice is stored locally like the language/city (see hooks/useCurrencies).

// Base (reference) currency per country ISO alpha-2 code (CLAUDE.md §5.1). Extend
// this map as new countries go live; anything unmapped falls back to DEFAULT_BASE.
export const COUNTRY_BASE = { TR: 'TRY', AE: 'AED' }
export const DEFAULT_BASE = 'TRY'

// Display sign shown after the converted value ("33,21 ₺"). The lira has a widely
// rendered glyph; the dirham's new glyph is not, so we use the readable ISO code.
const BASE_SYMBOLS = { TRY: '₺', AED: 'AED' }

/** Base currency code for a country ISO alpha-2 code (defaults to TRY). */
export function baseForCountry(countryCode) {
  return COUNTRY_BASE[countryCode] || DEFAULT_BASE
}

/** Display sign for a base currency code (falls back to the code itself). */
export function baseSymbol(base) {
  return BASE_SYMBOLS[base] || base
}

// Currencies the user can pick from, in picker order. `symbol` is the currency's
// own sign, shown next to the code. Curated for the launch audience (§8 start
// languages): majors + the currencies of the interface languages. Every code
// here is present in the open.er-api.com payload (verified). The active country's
// base currency is intentionally not listed — it's what everything is priced in.
export const AVAILABLE_CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'RUB', symbol: '₽' },
  { code: 'GBP', symbol: '£' },
  { code: 'UAH', symbol: '₴' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'CZK', symbol: 'Kč' },
  { code: 'SEK', symbol: 'kr' },
  { code: 'NOK', symbol: 'kr' },
  { code: 'DKK', symbol: 'kr' },
]

// Shown to users who never opened the picker — the historical USD/EUR/RUB card.
export const DEFAULT_CURRENCIES = ['USD', 'EUR', 'RUB']

// How many currencies fit on the card at once (§ task: 3–4 at a time).
export const MAX_CURRENCIES = 4

/**
 * Fetch base-currency conversion rates for the given currency codes.
 * @param {string[]} [codes] currency codes to price (defaults to USD/EUR/RUB).
 * @param {string} [base] the reference currency (e.g. TRY, AED); defaults to TRY.
 * @returns {Promise<Array<{ code: string, perBase: number }>>}
 *   each entry = price of 1 unit of `code` in the base currency, in the order
 *   asked. The base itself is skipped (no "1 AED = 1 AED" row) and codes the API
 *   happens not to return are dropped (the card shows the rest).
 */
export async function fetchRates(codes = DEFAULT_CURRENCIES, base = DEFAULT_BASE) {
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
  if (!res.ok) throw new Error(`rates ${res.status}`)
  const json = await res.json()
  if (json.result !== 'success' || !json.rates) {
    throw new Error('rates payload malformed')
  }
  // json.rates[X] = units of X per 1 base → invert to get base per 1 X.
  return codes
    .filter((code) => code !== base)
    .map((code) => {
      const rate = json.rates[code]
      return rate ? { code, perBase: 1 / rate } : null
    })
    .filter(Boolean)
}
