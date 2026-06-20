// "Documents & life" — guides list (CLAUDE.md §4 screen 4, §11). City-scoped,
// approved-only instructions and checklists (residence permit, numarataj,
// notary, insurance…). Tapping a guide opens its full page. Empty → a tidy
// placeholder. Mandatory disclaimers live on the guide page itself (§11).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, ChevronRight, ListChecks } from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchContent, withTranslations } from '../lib/content.js'

export default function Guides() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { cityId } = useApp()
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchContent('guides', cityId)
      .then((rows) => withTranslations('guides', rows, i18n.language))
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId, i18n.language])

  return (
    <main className="app-shell listing">
      <header className="catalog__header">
        <button type="button" className="catalog__back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t('nav.home')}
        </button>
        <h1 className="catalog__title">{t('guides.title')}</h1>
        <p className="catalog__subtitle">{t('guides.subtitle')}</p>
      </header>

      {state.status === 'loading' ? (
        <div className="listing__cards">
          <div className="catalog__skeleton catalog__skeleton--row" />
          <div className="catalog__skeleton catalog__skeleton--row" />
        </div>
      ) : state.rows.length === 0 ? (
        <p className="catalog__empty">{t('guides.empty')}</p>
      ) : (
        <ul className="listing__cards">
          {state.rows.map((row) => {
            const hasChecklist = Array.isArray(row.checklist) && row.checklist.length > 0
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="guide-row"
                  onClick={() => navigate(`/guides/${row.id}`)}
                >
                  <span className="guide-row__icon" aria-hidden="true">
                    <FileText size={20} />
                  </span>
                  <span className="guide-row__body">
                    <span className="guide-row__title">{row.title}</span>
                    {hasChecklist && (
                      <span className="guide-row__tag">
                        <ListChecks size={13} aria-hidden="true" />
                        {t('guides.checklist')}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="guide-row__chevron" size={18} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
