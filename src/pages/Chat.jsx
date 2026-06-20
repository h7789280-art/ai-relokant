import { useTranslation } from 'react-i18next'

// AI-помощник — сердце приложения (CLAUDE.md §4.2, §6). Пока заглушка.
export default function Chat() {
  const { t } = useTranslation()

  return (
    <main className="app-shell">
      <section className="card">
        <h1>{t('nav.chat')}</h1>
        <p className="muted">{t('home.skeletonNotice')}</p>
      </section>
    </main>
  )
}
