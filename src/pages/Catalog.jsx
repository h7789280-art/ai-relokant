import { useTranslation } from 'react-i18next'

// Каталог компаний и специалистов (CLAUDE.md §4.3). Пока заглушка.
export default function Catalog() {
  const { t } = useTranslation()

  return (
    <main className="app-shell">
      <section className="card">
        <h1>{t('nav.catalog')}</h1>
        <p className="muted">{t('home.skeletonNotice')}</p>
      </section>
    </main>
  )
}
