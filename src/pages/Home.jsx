import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'

export default function Home() {
  const { t } = useTranslation()

  return (
    <main className="app-shell">
      <section className="card">
        <h1>{t('appName')}</h1>
        <p className="muted">{t('home.tagline')}</p>
        <p className="muted">{t('home.skeletonNotice')}</p>
        <LanguageSwitcher />
      </section>
    </main>
  )
}
