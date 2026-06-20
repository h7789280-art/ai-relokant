// CityMate — interface i18n setup (react-i18next). See CLAUDE.md §8.
// 13 start languages. UI strings live here; content translations live in
// Supabase, AI answers are generated on the fly.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import ru from './locales/ru.json'
import tr from './locales/tr.json'
import de from './locales/de.json'
import uk from './locales/uk.json'
import pl from './locales/pl.json'
import nl from './locales/nl.json'
import cs from './locales/cs.json'
import fr from './locales/fr.json'
import fi from './locales/fi.json'
import sv from './locales/sv.json'
import no from './locales/no.json'
import da from './locales/da.json'

export const STORAGE_KEY = 'citymate.lang'

// Order shown in the language switcher.
export const SUPPORTED_LANGUAGES = [
  'ru', 'en', 'tr', 'de', 'uk', 'pl', 'nl', 'cs', 'fr', 'fi', 'sv', 'no', 'da',
]

const resources = {
  en: { translation: en },
  ru: { translation: ru },
  tr: { translation: tr },
  de: { translation: de },
  uk: { translation: uk },
  pl: { translation: pl },
  nl: { translation: nl },
  cs: { translation: cs },
  fr: { translation: fr },
  fi: { translation: fi },
  sv: { translation: sv },
  no: { translation: no },
  da: { translation: da },
}

function detectInitialLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectInitialLanguage(),
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
  })

// Persist the active language whenever it changes.
i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng)
})

export default i18n
