import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { useApp } from '../context/appContext.js'

export default function Home() {
  const { t } = useTranslation()
  const { selection } = useApp()

  return (
    <main className="app-shell">
      <section className="card">
        <h1>{t('appName')}</h1>
        {/* Active city — all content is scoped to selection.cityId (§5). */}
        {selection?.cityName && (
          <p className="muted">
            {selection.cityName}, {selection.countryName}
          </p>
        )}
        <p className="muted">{t('home.tagline')}</p>
        <p className="muted">{t('home.skeletonNotice')}</p>
        <LanguageSwitcher />
      </section>
    </main>
  )
}
