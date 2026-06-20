// Welcome / onboarding screen (CLAUDE.md §4).
// Shown only on first run: a globe, an iOS-"Hello"-style greeting that cycles
// through every start language, and three selectors (country / city / language).
// The screen itself is always English (the base language); the chosen language
// takes effect across the rest of the app after "Continue".
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe } from 'lucide-react'
import i18n, { SUPPORTED_LANGUAGES } from '../i18n/index.js'
import { fetchCountries, fetchCities } from '../lib/content.js'
import { useApp } from '../context/appContext.js'

// English copy for the screen, read straight from the en bundle so it stays
// English regardless of the language being selected below.
const en = (key) => i18n.getResource('en', 'translation', `welcome.${key}`)

// "Welcome" in each of the 13 start languages, for the cycling header.
const GREETINGS = SUPPORTED_LANGUAGES.map(
  (code) => i18n.getResource(code, 'translation', 'welcome.greeting') || 'Welcome',
)

const GREETING_INTERVAL_MS = 1800

function nativeName(code) {
  return i18n.getResource(code, 'translation', 'languageName') || code
}

export default function Welcome() {
  const navigate = useNavigate()
  const { confirmSelection } = useApp()

  // --- cycling greeting -----------------------------------------------------
  const [greetingIndex, setGreetingIndex] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setGreetingIndex((i) => (i + 1) % GREETINGS.length)
    }, GREETING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // --- selectors ------------------------------------------------------------
  const [countries, setCountries] = useState([])
  const [cities, setCities] = useState([])
  const [countryId, setCountryId] = useState('')
  const [cityId, setCityId] = useState('')
  const [lang, setLang] = useState(i18n.resolvedLanguage || 'en')
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  // Load countries once; default to the first active one.
  useEffect(() => {
    let active = true
    fetchCountries()
      .then((rows) => {
        if (!active) return
        setCountries(rows)
        const firstActive = rows.find((c) => c.is_active)
        if (firstActive) setCountryId(firstActive.id)
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  // Load cities for the chosen country; default to the first active one.
  // `countryId` only ever goes empty -> set (the placeholder option is
  // disabled and defaults pick the first active country), so there is no
  // "deselect" branch to reset here.
  useEffect(() => {
    if (!countryId) return
    let active = true
    fetchCities(countryId)
      .then((rows) => {
        if (!active) return
        setCities(rows)
        const firstActive = rows.find((c) => c.is_active)
        setCityId(firstActive ? firstActive.id : '')
      })
      .catch(() => {
        if (!active) return
        setCities([])
        setCityId('')
      })
    return () => {
      active = false
    }
  }, [countryId])

  const selectedCountry = useMemo(
    () => countries.find((c) => c.id === countryId) || null,
    [countries, countryId],
  )
  const selectedCity = useMemo(
    () => cities.find((c) => c.id === cityId) || null,
    [cities, cityId],
  )

  const canContinue = Boolean(
    selectedCountry?.is_active && selectedCity?.is_active && lang,
  )

  function handleContinue() {
    if (!canContinue) return
    confirmSelection({ country: selectedCountry, city: selectedCity, lang })
    navigate('/', { replace: true })
  }

  return (
    <main className="welcome">
      <div className="welcome__hero">
        <Globe className="welcome__globe" size={88} strokeWidth={1.25} aria-hidden="true" />
        <h1 className="welcome__greeting" aria-label="Welcome">
          <span key={greetingIndex} className="welcome__greeting-word">
            {GREETINGS[greetingIndex]}
          </span>
        </h1>
        <p className="welcome__subtitle">{en('subtitle')}</p>
      </div>

      {status === 'error' ? (
        <div className="card welcome__card">
          <p className="muted">{en('loadError')}</p>
        </div>
      ) : (
        <div className="card welcome__card">
          {/* Country */}
          <label className="welcome__field">
            <span className="welcome__label">{en('countryLabel')}</span>
            <select
              className="welcome__select"
              value={countryId}
              disabled={status !== 'ready'}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="" disabled>
                {status === 'ready' ? en('countryPlaceholder') : en('loading')}
              </option>
              {countries.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.is_active}>
                  {c.name}
                  {c.is_active ? '' : ` ${en('soon')}`}
                </option>
              ))}
            </select>
          </label>

          {/* City */}
          <label className="welcome__field">
            <span className="welcome__label">{en('cityLabel')}</span>
            <select
              className="welcome__select"
              value={cityId}
              disabled={status !== 'ready' || !countryId}
              onChange={(e) => setCityId(e.target.value)}
            >
              <option value="" disabled>
                {en('cityPlaceholder')}
              </option>
              {cities.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.is_active}>
                  {c.name}
                  {c.is_active ? '' : ` ${en('soon')}`}
                </option>
              ))}
            </select>
          </label>

          {/* Language */}
          <label className="welcome__field">
            <span className="welcome__label">{en('languageLabel')}</span>
            <select
              className="welcome__select"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {nativeName(code)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="welcome__continue"
            disabled={!canContinue}
            onClick={handleContinue}
          >
            {en('continue')}
          </button>
        </div>
      )}
    </main>
  )
}
