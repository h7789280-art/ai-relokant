// A single city news article (CLAUDE.md §4 screen 6, §11). Full text of one
// approved, city-scoped news item: photo, title, date, summary, body and a
// verifiable source link (§11 — news must carry a checkable source).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Newspaper, ExternalLink } from 'lucide-react'
import { fetchNewsItem, withTranslations } from '../lib/content.js'
import i18n from '../i18n/index.js'

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

export default function NewsArticle() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { newsId } = useParams()
  const [state, setState] = useState({ status: 'loading', item: null })

  useEffect(() => {
    let active = true
    fetchNewsItem(newsId)
      .then(async (item) => {
        if (!item) return null
        const [translated] = await withTranslations('news', [item], i18n.language)
        return translated
      })
      .then((item) => active && setState({ status: item ? 'ready' : 'missing', item }))
      .catch(() => active && setState({ status: 'error', item: null }))
    return () => {
      active = false
    }
  }, [newsId])

  const back = (
    <button type="button" className="catalog__back" onClick={() => navigate(-1)}>
      <ArrowLeft size={18} aria-hidden="true" />
      {t('common.back')}
    </button>
  )

  if (state.status === 'loading') {
    return (
      <main className="app-shell article">
        {back}
        <div className="catalog__skeleton catalog__skeleton--hero" />
        <div className="catalog__skeleton catalog__skeleton--row" />
      </main>
    )
  }

  if (state.status !== 'ready' || !state.item) {
    return (
      <main className="app-shell article">
        {back}
        <p className="catalog__empty">{t('news.notFound')}</p>
      </main>
    )
  }

  const item = state.item
  const date = formatDate(item.published_at)

  return (
    <main className="app-shell article">
      {back}

      {item.image_url ? (
        <img className="article__hero" src={item.image_url} alt={item.title} />
      ) : (
        <div className="article__hero article__hero--ph" aria-hidden="true">
          <Newspaper size={40} />
        </div>
      )}

      <header className="article__head">
        <h1 className="article__title">{item.title}</h1>
        {date && <p className="article__date">{date}</p>}
      </header>

      {item.summary && <p className="article__summary">{item.summary}</p>}
      {item.body && <p className="article__body">{item.body}</p>}

      {item.source_url && (
        <a
          className="article__source"
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} aria-hidden="true" />
          {item.source_name || t('news.source')}
        </a>
      )}
    </main>
  )
}
