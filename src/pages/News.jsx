// City news (CLAUDE.md §4 screen 6, §11). City-scoped, approved-only feed
// (Stage-2 helpers), newest first. Each card is a short summary — what
// happened / who it affects / what to do — with a verifiable source (§11);
// tapping opens the full article. Reached from Home ("News today → See all")
// and direct navigation. Empty → a tidy placeholder.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Newspaper, ChevronRight } from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { fetchContent, withTranslations } from '../lib/content.js'
import i18n from '../i18n/index.js'

const NEWS_OPTS = { order: { column: 'published_at', ascending: false } }

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export default function News() {
  const { t, i18n: i18nInstance } = useTranslation()
  const navigate = useNavigate()
  const { cityId } = useApp()
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    if (!cityId) return
    let active = true
    fetchContent('news', cityId, NEWS_OPTS)
      .then((rows) => withTranslations('news', rows, i18nInstance.language))
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'ready', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId, i18nInstance.language])

  return (
    <main className="app-shell listing">
      <header className="catalog__header">
        <button type="button" className="catalog__back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t('nav.home')}
        </button>
        <h1 className="catalog__title">{t('news.title')}</h1>
        <p className="catalog__subtitle">{t('news.subtitle')}</p>
      </header>

      {state.status === 'loading' ? (
        <div className="listing__cards">
          <div className="catalog__skeleton catalog__skeleton--row" />
          <div className="catalog__skeleton catalog__skeleton--row" />
        </div>
      ) : state.rows.length === 0 ? (
        <p className="catalog__empty">{t('news.empty')}</p>
      ) : (
        <ul className="listing__cards">
          {state.rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="news-card"
                onClick={() => navigate(`/news/${row.id}`)}
              >
                {row.image_url ? (
                  <img className="news-card__photo" src={row.image_url} alt="" loading="lazy" />
                ) : (
                  <span className="news-card__photo news-card__photo--ph" aria-hidden="true">
                    <Newspaper size={22} />
                  </span>
                )}
                <span className="news-card__body">
                  <span className="news-card__title">{row.title}</span>
                  {row.summary && <span className="news-card__summary">{row.summary}</span>}
                  <span className="news-card__foot">
                    {formatDate(row.published_at) && (
                      <span className="news-card__date">{formatDate(row.published_at)}</span>
                    )}
                    {row.source_name && (
                      <span className="news-card__source">{row.source_name}</span>
                    )}
                  </span>
                </span>
                <ChevronRight className="news-card__chevron" size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
