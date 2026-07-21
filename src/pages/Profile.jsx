import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Building2,
  ChevronRight,
  Globe,
  LogOut,
  Mail,
  UserPlus,
  ShieldCheck,
  BookUser,
} from 'lucide-react'
import i18n, { SUPPORTED_LANGUAGES } from '../i18n/index.js'
import { fetchCountries, fetchCities } from '../lib/content.js'
import { CITIZENSHIP_COUNTRIES, countryName } from '../lib/sosConfig.js'
import { useApp } from '../context/appContext.js'
import { useAuth } from '../context/authContext.js'
import { useIsAdmin } from '../hooks/useIsAdmin.js'

// Profile (CLAUDE.md §4). Account block (email + sign out / sign in, admin link)
// plus a Settings section: interface language and active city. Language reuses
// the existing change logic (i18n.changeLanguage — persistence + content
// re-souping are driven by the languageChanged event in src/i18n). City reuses
// confirmSelection from the app context (Stage 3), which re-scopes all content.
export default function Profile() {
  const { t } = useTranslation()
  const { isAuthed, user, loading, openAuth, signOut } = useAuth()
  const { isAdmin } = useIsAdmin()
  const { selection, confirmSelection, citizenship, setCitizenship } = useApp()

  // Citizenship options, sorted by their name in the ACTIVE language (the names
  // come from Intl, so the order has to be computed per language, not baked in).
  // useTranslation re-renders this component on every language change, so
  // reading resolvedLanguage here keeps the memo key honest.
  const lang = i18n.resolvedLanguage
  const citizenshipOptions = useMemo(
    () =>
      CITIZENSHIP_COUNTRIES.map((code) => ({ code, name: countryName(code, lang) })).sort((a, b) =>
        a.name.localeCompare(b.name, lang),
      ),
    [lang],
  )

  // Country switching (Stage A). The country the selector shows is local state so
  // it can lead the persisted selection while cities load; it follows `selection`
  // whenever that changes elsewhere. Only ACTIVE countries are offered.
  const [countries, setCountries] = useState([])
  const [countryId, setCountryId] = useState(selection?.countryId ?? '')
  // Cities of the shown country. Active ones are selectable; inactive show
  // "(soon)" and are disabled — same rule as the welcome screen.
  const [cities, setCities] = useState([])
  // Set when the user picks a NEW country: once that country's cities load we
  // auto-switch to its first active city (a country change implies a city change,
  // §5 — content is city-scoped). Avoids auto-switching on the initial load.
  const pendingCitySwitch = useRef(false)

  useEffect(() => {
    let active = true
    fetchCountries()
      .then((rows) => active && setCountries(rows))
      .catch(() => active && setCountries([]))
    return () => {
      active = false
    }
  }, [])

  // Follow the persisted selection's country (e.g. after a city switch elsewhere).
  useEffect(() => {
    if (selection?.countryId) setCountryId(selection.countryId)
  }, [selection?.countryId])

  useEffect(() => {
    if (!countryId) return
    let active = true
    fetchCities(countryId)
      .then((rows) => {
        if (!active) return
        setCities(rows)
        if (pendingCitySwitch.current) {
          pendingCitySwitch.current = false
          const firstActive = rows.find((c) => c.is_active)
          if (firstActive) applySelection(countryId, firstActive)
        }
      })
      .catch(() => {
        if (active) setCities([])
      })
    return () => {
      active = false
    }
    // applySelection is stable enough (reads countries/confirmSelection); deps kept
    // minimal so this only re-runs on a country change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId])

  function handleLanguageChange(event) {
    i18n.changeLanguage(event.target.value)
  }

  // Re-scope the app to (country, city): rebuild the full country row from the
  // loaded countries list (confirmSelection stores ids/names, not full rows) and
  // keep the current language. Hard country boundary stays intact — content is
  // scoped by the new city_id (§5).
  function applySelection(cId, city) {
    const country = countries.find((c) => c.id === cId)
    if (!country || !city) return
    confirmSelection({
      country: { id: country.id, code: country.code, name: country.name },
      city,
      lang: i18n.resolvedLanguage,
    })
  }

  // Changing COUNTRY: show it immediately and, once its cities load, switch to
  // its first active city (see pendingCitySwitch).
  function handleCountryChange(event) {
    const id = event.target.value
    if (!id || id === countryId) return
    pendingCitySwitch.current = true
    setCountryId(id)
  }

  // Changing CITY within the shown country.
  function handleCityChange(event) {
    const city = cities.find((c) => c.id === event.target.value)
    if (!city || !city.is_active) return
    applySelection(countryId, city)
  }

  const nativeName = (code) =>
    i18n.getResource(code, 'translation', 'languageName') || code

  // Keep the <select>s controlled even before their lists have loaded.
  const countryValue = countries.some((c) => c.id === countryId) ? countryId : ''
  const cityValue = cities.some((c) => c.id === selection?.cityId)
    ? selection.cityId
    : ''

  return (
    <main className="app-shell">
      <section className="card profile">
        <h1>{t('nav.profile')}</h1>

        {loading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : isAuthed ? (
          <div className="profile__account">
            <span className="profile__avatar" aria-hidden="true">
              <Mail size={20} strokeWidth={1.75} />
            </span>
            <div className="profile__account-body">
              <span className="profile__label">{t('auth.signedInAs')}</span>
              <span className="profile__email">{user?.email}</span>
            </div>
            <button type="button" className="profile__signout" onClick={signOut}>
              <LogOut size={18} aria-hidden="true" />
              {t('auth.signOut')}
            </button>
          </div>
        ) : null}

        {/* Admin panel link — shown only to admins (CLAUDE.md §7). */}
        {isAuthed && isAdmin && (
          <Link to="/admin" className="profile__admin-link">
            <ShieldCheck size={18} aria-hidden="true" />
            {t('admin.link')}
          </Link>
        )}

        {!loading && !isAuthed && (
          <div className="profile__guest">
            <p className="muted">{t('auth.guestNotice')}</p>
            <button type="button" className="profile__signin" onClick={openAuth}>
              <UserPlus size={18} aria-hidden="true" />
              {t('auth.signInOrUp')}
            </button>
          </div>
        )}

        {/* Settings: interface language + active city (iOS-style list). */}
        <h2 className="profile__settings-title">{t('profile.settingsTitle')}</h2>
        <div className="profile__settings">
          {/* Language */}
          <label className="welcome__field">
            <span className="welcome__field-icon welcome__field-icon--text" aria-hidden="true">
              Aa
            </span>
            <span className="welcome__field-body">
              <span className="welcome__label">{t('profile.language')}</span>
              <select
                className="welcome__select"
                value={i18n.resolvedLanguage}
                onChange={handleLanguageChange}
                aria-label={t('profile.language')}
              >
                {SUPPORTED_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {nativeName(code)}
                  </option>
                ))}
              </select>
            </span>
            <ChevronRight className="welcome__field-chevron" size={20} aria-hidden="true" />
          </label>

          {/* Country */}
          <label className="welcome__field">
            <span className="welcome__field-icon" aria-hidden="true">
              <Globe size={22} strokeWidth={1.75} />
            </span>
            <span className="welcome__field-body">
              <span className="welcome__label">{t('profile.country')}</span>
              <select
                className="welcome__select"
                value={countryValue}
                onChange={handleCountryChange}
                aria-label={t('profile.country')}
              >
                {countries
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </span>
            <ChevronRight className="welcome__field-chevron" size={20} aria-hidden="true" />
          </label>

          {/* City */}
          {countryId && (
            <label className="welcome__field">
              <span className="welcome__field-icon" aria-hidden="true">
                <Building2 size={22} strokeWidth={1.75} />
              </span>
              <span className="welcome__field-body">
                <span className="welcome__label">{t('profile.city')}</span>
                <select
                  className="welcome__select"
                  value={cityValue}
                  onChange={handleCityChange}
                  aria-label={t('profile.city')}
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.is_active}>
                      {c.name}
                      {c.is_active ? '' : ` ${t('profile.soon')}`}
                    </option>
                  ))}
                </select>
              </span>
              <ChevronRight className="welcome__field-chevron" size={20} aria-hidden="true" />
            </label>
          )}

          {/* Citizenship — used ONLY by the SOS screen, to show the right
              consulate (§4 SOS). Deliberately a separate setting from the
              interface language and the active country: a Russian-speaking
              Kazakh citizen living in Turkey needs the KAZAKH consulate.
              Optional — left empty, SOS shows the full local directory. */}
          <label className="welcome__field">
            <span className="welcome__field-icon" aria-hidden="true">
              <BookUser size={22} strokeWidth={1.75} />
            </span>
            <span className="welcome__field-body">
              <span className="welcome__label">{t('profile.citizenship')}</span>
              <select
                className="welcome__select"
                value={citizenship}
                onChange={(e) => setCitizenship(e.target.value)}
                aria-label={t('profile.citizenship')}
              >
                <option value="">{t('profile.citizenshipNone')}</option>
                {citizenshipOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
            <ChevronRight className="welcome__field-chevron" size={20} aria-hidden="true" />
          </label>
          <p className="profile__hint muted">{t('profile.citizenshipHint')}</p>
        </div>
      </section>
    </main>
  )
}
