import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, LogOut, Mail, UserPlus, ShieldCheck } from 'lucide-react'
import i18n, { SUPPORTED_LANGUAGES } from '../i18n/index.js'
import { fetchCities } from '../lib/content.js'
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
  const { selection, confirmSelection } = useApp()

  // Cities of the currently selected country, for the city selector. The active
  // (selectable) ones are chosen; inactive ones show "(soon)" and are disabled.
  const [cities, setCities] = useState([])
  useEffect(() => {
    if (!selection?.countryId) return
    let active = true
    fetchCities(selection.countryId)
      .then((rows) => {
        if (active) setCities(rows)
      })
      .catch(() => {
        if (active) setCities([])
      })
    return () => {
      active = false
    }
  }, [selection?.countryId])

  function handleLanguageChange(event) {
    i18n.changeLanguage(event.target.value)
  }

  // Switch the active city. We rebuild the country row from the persisted
  // selection (confirmSelection stores names/ids, not full rows) and keep the
  // current language. This re-scopes every content read to the new city_id.
  function handleCityChange(event) {
    const city = cities.find((c) => c.id === event.target.value)
    if (!city || !city.is_active || !selection) return
    confirmSelection({
      country: {
        id: selection.countryId,
        code: selection.countryCode,
        name: selection.countryName,
      },
      city,
      lang: i18n.resolvedLanguage,
    })
  }

  const nativeName = (code) =>
    i18n.getResource(code, 'translation', 'languageName') || code

  // Keep the <select> controlled even before the city list has loaded.
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

          {/* City */}
          {selection?.countryId && (
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
        </div>
      </section>
    </main>
  )
}
