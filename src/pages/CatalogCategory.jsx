// Catalog → one category (CLAUDE.md §4.3, §5, §12). Shows subcategory filter
// chips, then the city-scoped, approved-only place list for the category.
// Promoted (paid) placements come first with an honest "promoted" label; the
// "verified" mark is a separate quality signal, never bought (§11/§12).
// Empty categories show a tidy "nothing yet" placeholder.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useApp } from '../context/appContext.js'
import PlaceRow from '../components/PlaceRow.jsx'
import {
  fetchCategoryBySlug,
  fetchSubcategories,
  fetchPlaces,
  withTranslations,
} from '../lib/content.js'

export default function CatalogCategory() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { categorySlug } = useParams()
  const { cityId } = useApp()

  const [category, setCategory] = useState(null)
  const [subcategories, setSubcategories] = useState([])
  const [activeSub, setActiveSub] = useState(null) // subcategory id, or null = all
  const [places, setPlaces] = useState({ status: 'loading', rows: [] })

  // Resolve the category + its subcategories from the slug.
  useEffect(() => {
    let active = true
    fetchCategoryBySlug(categorySlug)
      .then(async (cat) => {
        if (!active) return
        // Reset the filter here (not synchronously in the effect body) so a stale
        // subcategory id from the previous category can't filter the new list.
        setActiveSub(null)
        setCategory(cat)
        const subs = cat ? await fetchSubcategories(cat.id) : []
        if (active) setSubcategories(subs)
      })
      .catch(() => {
        if (active) {
          setCategory(null)
          setSubcategories([])
        }
      })
    return () => {
      active = false
    }
  }, [categorySlug])

  // Load places for the category (and active subcategory), translated.
  useEffect(() => {
    if (!cityId || !category) return
    let active = true
    fetchPlaces(cityId, { categoryId: category.id, subcategoryId: activeSub ?? undefined })
      .then((rows) => withTranslations('places', rows, i18n.language))
      .then((rows) => active && setPlaces({ status: 'ready', rows }))
      .catch(() => active && setPlaces({ status: 'error', rows: [] }))
    return () => {
      active = false
    }
  }, [cityId, category, activeSub, i18n.language])

  const categoryName = category
    ? t(`catalog.categories.${category.slug}`, category.name)
    : t('nav.catalog')

  return (
    <main className="app-shell catalog">
      <header className="catalog__header">
        <button
          type="button"
          className="catalog__back"
          onClick={() => navigate('/catalog')}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          {t('nav.catalog')}
        </button>
        <h1 className="catalog__title">{categoryName}</h1>
      </header>

      {subcategories.length > 0 && (
        <div className="catalog__filters">
          <button
            type="button"
            className={`catalog__filter${activeSub === null ? ' is-active' : ''}`}
            onClick={() => setActiveSub(null)}
          >
            {t('catalog.all')}
          </button>
          {subcategories.map((sub) => (
            <button
              key={sub.id}
              type="button"
              className={`catalog__filter${activeSub === sub.id ? ' is-active' : ''}`}
              onClick={() => setActiveSub(sub.id)}
            >
              {t(`catalog.subcategories.${sub.slug}`, sub.name)}
            </button>
          ))}
        </div>
      )}

      {places.status === 'loading' ? (
        <div className="place-list">
          <div className="catalog__skeleton catalog__skeleton--row" />
          <div className="catalog__skeleton catalog__skeleton--row" />
        </div>
      ) : places.rows.length === 0 ? (
        <p className="catalog__empty">{t('catalog.empty')}</p>
      ) : (
        <ul className="place-list">
          {places.rows.map((place) => (
            <li key={place.id}>
              <PlaceRow place={place} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
