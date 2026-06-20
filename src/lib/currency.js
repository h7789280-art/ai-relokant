// Currency rates for the home screen (CLAUDE.md §4.1).
// open.er-api.com — free, stable, no API key. We read TRY-based rates and show
// what 1 USD / 1 EUR / 1 RUB is worth in Turkish lira (the launch city is in
// Turkey, so lira is the reference currency a newcomer cares about).

const RATES_URL = 'https://open.er-api.com/v6/latest/TRY'

// Foreign currencies shown on the home card, in display order.
export const SHOWN_CURRENCIES = ['USD', 'EUR', 'RUB']

/**
 * @returns {Promise<Array<{ code: string, perTry: number }>>}
 *   each entry = price of 1 unit of `code` in Turkish lira.
 */
export async function fetchRates() {
  const res = await fetch(RATES_URL)
  if (!res.ok) throw new Error(`rates ${res.status}`)
  const json = await res.json()
  if (json.result !== 'success' || !json.rates) {
    throw new Error('rates payload malformed')
  }
  // json.rates[X] = units of X per 1 TRY → invert to get TRY per 1 X.
  return SHOWN_CURRENCIES.map((code) => {
    const rate = json.rates[code]
    return rate ? { code, perTry: 1 / rate } : null
  }).filter(Boolean)
}
