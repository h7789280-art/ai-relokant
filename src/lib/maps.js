// Shared "open a route in maps" helper (CLAUDE.md §4).
//
// The owner wants the same "tap the address → get driving directions" behaviour
// everywhere an address or coordinates appear: the Home market rail, the place
// card, and event listings. This is the single source of truth for that link so
// the three callers stay consistent (previously each had its own copy).
//
// Prefer exact coordinates when a row has them; otherwise route to the textual
// address. Returns null when there's nothing to route to (the caller then simply
// doesn't render a link). Always open the result in a NEW tab.

/**
 * A Google Maps DIRECTIONS link for a location-bearing row.
 *
 * @param {{ latitude?: number|null, longitude?: number|null, address?: string|null }} target
 * @returns {string|null} maps directions URL, or null when there's no location
 */
export function directionsUrl(target) {
  if (!target) return null
  const { latitude, longitude, address } = target
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
  }
  if (address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
  }
  return null
}
