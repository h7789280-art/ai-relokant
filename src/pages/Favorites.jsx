import { useTranslation } from 'react-i18next'
import AuthGate from '../components/AuthGate.jsx'

// Избранное пользователя (CLAUDE.md §4). Требует входа; пока заглушка за гейтом
// авторизации.
export default function Favorites() {
  const { t } = useTranslation()

  return (
    <AuthGate message={t('auth.gateFavorites')}>
      <main className="app-shell">
        <section className="card">
          <h1>{t('nav.favorites')}</h1>
          <p className="muted">{t('home.skeletonNotice')}</p>
        </section>
      </main>
    </AuthGate>
  )
}
