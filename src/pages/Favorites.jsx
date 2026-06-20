import { useTranslation } from 'react-i18next'

// Избранное пользователя (CLAUDE.md §4). Требует входа; пока заглушка.
export default function Favorites() {
  const { t } = useTranslation()

  return (
    <main className="app-shell">
      <section className="card">
        <h1>{t('nav.favorites')}</h1>
        <p className="muted">{t('home.skeletonNotice')}</p>
      </section>
    </main>
  )
}
