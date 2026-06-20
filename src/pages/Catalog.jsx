// Catalog — category grid (CLAUDE.md §4.3, §5). Tapping a category drills into
// its subcategories + place list (CatalogCategory). Categories are reference
// data (active-only); their labels come from i18n (catalog.categories.<slug>)
// and fall back to the DB name. Empty state when no categories exist yet.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { fetchCategories } from '../lib/content.js'
import { categoryIcon } from '../lib/categoryIcons.js'

export default function Catalog() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    let active = true
    fetchCategories()
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'error', rows: [] }))
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="app-shell catalog">
      <header className="catalog__header">
        <h1 className="catalog__title">{t('nav.catalog')}</h1>
        <p className="catalog__subtitle">{t('catalog.subtitle')}</p>
      </header>

      {state.status === 'loading' ? (
        <div className="catalog__grid">
          <div className="catalog__skeleton" />
          <div className="catalog__skeleton" />
          <div className="catalog__skeleton" />
          <div className="catalog__skeleton" />
        </div>
      ) : state.rows.length === 0 ? (
        <p className="catalog__empty">{t('catalog.empty')}</p>
      ) : (
        <div className="catalog__grid">
          {state.rows.map((cat) => {
            const Icon = categoryIcon(cat.icon)
            return (
              <button
                key={cat.id}
                type="button"
                className="cat-tile"
                onClick={() => navigate(`/catalog/${cat.slug}`)}
              >
                <span className="cat-tile__icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={2} />
                </span>
                <span className="cat-tile__name">
                  {t(`catalog.categories.${cat.slug}`, cat.name)}
                </span>
                <ChevronRight className="cat-tile__chevron" size={18} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
