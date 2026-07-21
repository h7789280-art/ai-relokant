// Client-side distance helper (CLAUDE.md §5.5).
//
// The afisha computes proximity SERVER-SIDE (public.haversine_km +
// events_by_country_proximity) so the ordering is identical for everyone. The
// SOS screen can't do that: it sorts by the distance from the USER'S CURRENT
// GPS position, which is a browser-only fact we deliberately never send to a
// server (§ SOS — nothing about the user's location is stored or transmitted).
// So this is a faithful port of supabase/events-regional.sql's haversine_km,
// kept byte-for-byte equivalent in behaviour: kilometres, NULL-safe.

/**
 * Great-circle distance in kilometres between two points.
 * Returns null when any coordinate is missing — callers sort those last.
 *
 * @param {number|null} lat1
 * @param {number|null} lon1
 * @param {number|null} lat2
 * @param {number|null} lon2
 * @returns {number|null}
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
  const rad = (deg) => (deg * Math.PI) / 180
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}
