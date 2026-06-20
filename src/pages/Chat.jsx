import { useTranslation } from 'react-i18next'
import AuthGate from '../components/AuthGate.jsx'

// AI-помощник — сердце приложения (CLAUDE.md §4.2, §6). Требует входа (лимит
// считается по аккаунту); пока заглушка за гейтом авторизации.
export default function Chat() {
  const { t } = useTranslation()

  return (
    <AuthGate message={t('auth.gateChat')}>
      <main className="app-shell">
        <section className="card">
          <h1>{t('nav.chat')}</h1>
          <p className="muted">{t('home.skeletonNotice')}</p>
        </section>
      </main>
    </AuthGate>
  )
}
