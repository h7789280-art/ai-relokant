// Currency rates for the home screen (CLAUDE.md §4.1).
// open.er-api.com — free, stable, no API key. We read TRY-based rates and show
// what 1 unit of a foreign currency is worth in Turkish lira (the launch city is
// in Turkey, so lira is the reference currency a newcomer cares about).
//
// Which currencies appear on the card is user-configurable (gear on the card);
// the choice is stored locally like the language/city (see hooks/useCurrencies).

const RATES_URL = 'https://open.er-api.com/v6/latest/TRY'

// Currencies the user can pick from, in picker order. `symbol` is the currency's
// own sign, shown next to the code. Curated for the launch audience (§8 start
// languages): majors + the currencies of the interface languages. Every code
// here is present in the open.er-api.com TRY payload (verified). TRY itself is
// the reference currency, so it is intentionally not listed.
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
 * Fetch TRY-conversion rates for the given currency codes.
 * @param {string[]} [codes] currency codes to price (defaults to USD/EUR/RUB).
 * @returns {Promise<Array<{ code: string, perTry: number }>>}
 *   each entry = price of 1 unit of `code` in Turkish lira, in the order asked.
 *   Codes the API happens not to return are dropped (the card shows the rest).
 */
export async function fetchRates(codes = DEFAULT_CURRENCIES) {
  const res = await fetch(RATES_URL)
  if (!res.ok) throw new Error(`rates ${res.status}`)
  const json = await res.json()
  if (json.result !== 'success' || !json.rates) {
    throw new Error('rates payload malformed')
  }
  // json.rates[X] = units of X per 1 TRY → invert to get TRY per 1 X.
  return codes.map((code) => {
    const rate = json.rates[code]
    return rate ? { code, perTry: 1 / rate } : null
  }).filter(Boolean)
}
