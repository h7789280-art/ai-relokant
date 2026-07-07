// Ticket-price formatting for events (CLAUDE.md §4 screen 5). One row carries a
// mutually-exclusive `price_type` — 'paid' (a from–to range), 'free', or
// 'deposit' (a single amount applied to the order) — plus a `price_currency`
// code. Shared by the event page and the event card so both read a price the
// same way. Returns a display string, or null when there's nothing to show
// (old events, or a price the owner left unset).

// Launch currencies offered in the admin (the column itself accepts any code,
// so this list can grow without a migration — see supabase/events-fields.sql).
export const EVENT_CURRENCIES = ['TRY', 'EUR', 'USD']

// Currency symbol via i18n (en+ru filled, others fall back to en). Falls back to
// the raw code for a currency not yet given a symbol.
export function currencySymbol(code, t) {
  const c = code || 'TRY'
  return t(`events.price.currency.${c}`, c)
}

// numeric comes back from PostgREST as a string ("100.00"); coerce to a number
// and drop trailing zeros. Null for blank / non-numeric so callers can skip it.
function fmtAmount(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : String(n)
}

export function formatEventPrice(event, t) {
  if (!event) return null
  const type = event.price_type
  if (type === 'free') return t('events.price.free')

  const symbol = currencySymbol(event.price_currency, t)

  if (type === 'deposit') {
    const amount = fmtAmount(event.price_deposit)
    return amount ? t('events.price.deposit', { amount, symbol }) : null
  }

  if (type === 'paid') {
    const from = fmtAmount(event.price_from)
    const to = fmtAmount(event.price_to)
    if (from && to) return t('events.price.range', { from, to, symbol })
    if (from) return t('events.price.from', { from, symbol })
    if (to) return t('events.price.to', { to, symbol })
    return null
  }

  return null
}
