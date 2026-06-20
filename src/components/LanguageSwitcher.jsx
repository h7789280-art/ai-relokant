import { useTranslation } from 'react-i18next'
import i18n, { SUPPORTED_LANGUAGES } from '../i18n/index.js'

// Language picker. Persists the choice to localStorage (handled in i18n setup
// on the languageChanged event). Temporarily shown on the home placeholder;
// later it moves to the welcome screen / profile.
export default function LanguageSwitcher() {
  const { t } = useTranslation()

  function handleChange(event) {
    i18n.changeLanguage(event.target.value)
  }

  return (
    <label className="language-switcher">
      <span className="muted">{t('language.label')}</span>
      <select
        value={i18n.resolvedLanguage}
        onChange={handleChange}
        aria-label={t('language.select')}
      >
        {SUPPORTED_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {i18n.getResource(code, 'translation', 'languageName')}
          </option>
        ))}
      </select>
    </label>
  )
}
