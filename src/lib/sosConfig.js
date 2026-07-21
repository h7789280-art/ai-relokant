// SOS screen configuration (CLAUDE.md §4 — emergency help, §11 — trust).
//
// Everything here is a VERIFIED FACT hardcoded on purpose: the SOS screen must
// open instantly, offline-ish, with no AI and no network round-trip. The rule
// from §11 counts double on this screen — an invented emergency number or a
// made-up duty-pharmacy link is worse than showing nothing at all. So a country
// or city that isn't listed below simply renders no block; nothing is guessed
// and nothing falls back to "probably the same as Turkey".
//
// Whoever edits this file: cite the official source in the comment above the
// entry, exactly as it is done for the entries already here.

// ---------------------------------------------------------------------------
// Emergency call numbers, by app country (ISO alpha-2).
//
//   primary  — the number the big red button dials.
//   unified  — true when that ONE number covers ambulance + police + fire, so
//              the caption may honestly say so. false ⇒ the caption names what
//              `primary` actually reaches and `extra` lists the rest.
//   extra    — further services, each { key, number }; `key` maps to the i18n
//              label sos.services.<key>.
//
// Sources:
//   TR — 112 has been Turkey's single emergency number since 2019 (ambulance,
//        police, fire and gendarmerie were all merged into it).
//   AE — u.ae (official UAE Government platform), "Handling emergencies":
//        999 police, 998 ambulance, 997 fire (civil defence). There is NO
//        single unified number, so we must not claim one; 112 is only an
//        alternate route to 999.
// ---------------------------------------------------------------------------
const EMERGENCY_NUMBERS = {
  TR: { primary: '112', unified: true, extra: [] },
  AE: {
    primary: '999',
    unified: false,
    primaryKey: 'police',
    extra: [
      { key: 'ambulance', number: '998' },
      { key: 'fire', number: '997' },
    ],
  },
}

/**
 * The emergency-call config for a country, or null when we have none verified
 * (the caller then renders no call block rather than guessing a number).
 *
 * @param {string|null|undefined} countryCode  ISO alpha-2 of the ACTIVE country
 */
export function emergencyNumbers(countryCode) {
  if (!countryCode) return null
  return EMERGENCY_NUMBERS[String(countryCode).toUpperCase()] ?? null
}

// ---------------------------------------------------------------------------
// Duty pharmacies ("nöbetçi eczane"), by city slug.
//
// Turkish pharmacies rotate an overnight/holiday duty roster published by the
// provincial chamber of pharmacists. We LINK OUT to the official chamber page
// instead of scraping it: parsing the roster ourselves would mean publishing
// medical-hours data we can't verify, and a wrong "open now" is a wasted trip
// at 3 a.m. Auto-parsing stays a deliberate future item (§14).
//
// Keyed by cities.slug (unique per country, §5.1). A city absent from this map
// hides the block entirely.
//
// Source: antalyaeo.org.tr — Antalya Eczacı Odası (Antalya Chamber of
// Pharmacists), "Nöbetçi Eczaneler" page, which lists the duty roster per
// district of Antalya province — Alanya included. All the cities below are
// districts of Antalya province, so the same chamber page serves them.
// ---------------------------------------------------------------------------
const DUTY_PHARMACY_BY_CITY = {
  alanya: { url: 'https://www.antalyaeo.org.tr/tr/nobetci-eczaneler', source: 'Antalya Eczacı Odası' },
  antalya: { url: 'https://www.antalyaeo.org.tr/tr/nobetci-eczaneler', source: 'Antalya Eczacı Odası' },
  kemer: { url: 'https://www.antalyaeo.org.tr/tr/nobetci-eczaneler', source: 'Antalya Eczacı Odası' },
  belek: { url: 'https://www.antalyaeo.org.tr/tr/nobetci-eczaneler', source: 'Antalya Eczacı Odası' },
  side: { url: 'https://www.antalyaeo.org.tr/tr/nobetci-eczaneler', source: 'Antalya Eczacı Odası' },
  kas: { url: 'https://www.antalyaeo.org.tr/tr/nobetci-eczaneler', source: 'Antalya Eczacı Odası' },
}

/**
 * The official duty-pharmacy page for a city, or null when we have none — the
 * caller then hides the block (no guessing, §11).
 *
 * @param {string|null|undefined} citySlug  cities.slug of the ACTIVE city
 * @returns {{url: string, source: string}|null}
 */
export function dutyPharmacy(citySlug) {
  if (!citySlug) return null
  return DUTY_PHARMACY_BY_CITY[String(citySlug).toLowerCase()] ?? null
}

// ---------------------------------------------------------------------------
// Capital city per app country. Used for ONE honest sentence: when we hold no
// consulate for the user's citizenship, we say so and suggest looking for their
// EMBASSY in the capital — every country keeps its embassy there, so this is a
// safe pointer rather than a guess. Not a fallback for missing data: we never
// show someone else's consulate in its place.
// ---------------------------------------------------------------------------
const CAPITALS = { TR: 'Ankara', AE: 'Abu Dhabi' }

/** Capital of an app country (ISO alpha-2), or '' when unknown. */
export function capitalCity(countryCode) {
  if (!countryCode) return ''
  return CAPITALS[String(countryCode).toUpperCase()] ?? ''
}

// ---------------------------------------------------------------------------
// Citizenship options for the profile setting the SOS consulate block reads.
//
// This is NOT public.countries: that table lists the countries the APP covers
// (Turkey, UAE, …), while citizenship can be any country on earth. It is also
// deliberately NOT derived from the interface language — a Russian-speaking
// Kazakh citizen must be sent to the Kazakh consulate, not the Russian one.
//
// Only ISO alpha-2 CODES live here; the display name is produced at render time
// by Intl.DisplayNames in the active language, so the list needs no translation
// upkeep across the 13 languages (§8). Codes are matched against
// consulates.citizenship_country_code.
//
// The list leans towards the countries CityMate's users actually come from
// (post-Soviet space, EU, Turkey's other large expat groups) — extend it freely,
// it costs nothing but a line.
// ---------------------------------------------------------------------------
export const CITIZENSHIP_COUNTRIES = [
  'RU', 'UA', 'BY', 'KZ', 'KG', 'UZ', 'TM', 'TJ', 'AZ', 'AM', 'GE', 'MD',
  'TR', 'DE', 'GB', 'US', 'CA', 'PL', 'NL', 'CZ', 'SK', 'FR', 'FI', 'SE',
  'NO', 'DK', 'IT', 'ES', 'PT', 'AT', 'CH', 'BE', 'IE', 'GR', 'HU', 'RO',
  'BG', 'RS', 'HR', 'LT', 'LV', 'EE', 'IL', 'IR', 'IQ', 'SY', 'LB', 'JO',
  'AE', 'SA', 'EG', 'MA', 'DZ', 'TN', 'IN', 'PK', 'AF', 'CN', 'KR', 'JP',
  'AU', 'NZ', 'BR', 'AR', 'MX', 'ZA', 'NG',
]

/**
 * Localized country name for an ISO alpha-2 code, e.g. ('RU', 'ru') → "Россия".
 * Falls back to the bare code when the browser has no Intl.DisplayNames or the
 * code is unknown — never throws, never blanks the option.
 *
 * @param {string} code  ISO alpha-2
 * @param {string} lang  active UI language
 */
export function countryName(code, lang) {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

// ---------------------------------------------------------------------------
// Nearest-hospital block: which catalog subcategory counts as "hospital".
// Matches supabase/seed-categories.sql — category `health`, subcategory
// `hospitals` (§5.1). Kept here so the SOS screen has one obvious knob.
// ---------------------------------------------------------------------------
export const HOSPITAL_SUBCATEGORY_SLUG = 'hospitals'
