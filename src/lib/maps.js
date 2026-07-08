// Shared "open a route in maps" helper (CLAUDE.md §4, §5.8).
//
// The owner wants the same "tap the address → open in maps" behaviour everywhere
// an address or coordinates appear: the Home market rail, the place card, and
// event listings. This is the single source of truth for that link so the
// callers stay consistent (previously each had its own copy).
//
// PRIORITY (why): a Turkish street address is often just a district (a whole
// neighbourhood), so routing by it drops the user at the district centre. When
// the owner has pasted a ready-made Google Maps link (Share → Copy link) we open
// THAT verbatim; only when there's no link do we fall back to coordinates, and
// only when there are none of those do we fall back to the address text.
//   1. maps_url  → open exactly as pasted (short maps.app.goo.gl links included);
//   2. lat/lng   → a maps search at that point;
//   3. address   → last resort.
// Returns null when there's nothing to route to (the caller then simply doesn't
// render a link). Always open the result in a NEW tab.

/**
 * A Google Maps link for a location-bearing row.
 *
 * @param {{ maps_url?: string|null, latitude?: number|null, longitude?: number|null, address?: string|null }} target
 * @returns {string|null} maps URL, or null when there's no location
 */
export function directionsUrl(target) {
  if (!target) return null
  const { maps_url, latitude, longitude, address } = target
  // 1. A pasted link wins — open it EXACTLY as the owner entered it, no rebuild.
  const pasted = typeof maps_url === 'string' ? maps_url.trim() : ''
  if (pasted) return pasted
  // 2. Exact coordinates → a maps search pin at that point.
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  }
  // 3. Last resort: the textual address (often imprecise in Turkey).
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }
  return null
}
