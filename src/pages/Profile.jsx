import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'

// Профиль пользователя (CLAUDE.md §4). Пока заглушка; язык можно сменить здесь.
export default function Profile() {
  const { t } = useTranslation()

  return (
    <main className="app-shell">
      <section className="card">
        <h1>{t('nav.profile')}</h1>
        <p className="muted">{t('home.skeletonNotice')}</p>
        <LanguageSwitcher />
      </section>
    </main>
  )
}
