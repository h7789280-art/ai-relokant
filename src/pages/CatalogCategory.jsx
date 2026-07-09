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

// The one subcategory that groups its places BY district instead of a flat list
// (CLAUDE.md §5.2 — "Groceries"). Dozens of near-identical chain names (A101,
// BIM, Migros) are useless as a flat list; grouping by neighbourhood lets a user
// find the shops near them. Matched by the subcategory SLUG, so it's scoped to
// exactly groceries — every other category/subcategory keeps the flat list.
const GROUPED_SUB_SLUG = 'groceries'

/**
 * Group approved places by their `district`, districts A→Z, places with no
 * district collected last into their own bucket (district: null → "Other" header
 * so they never get lost). Within a district the incoming order is preserved
 * (fetchPlaces already sorts promoted-first, then by name).
 */
function groupByDistrict(rows) {
  const byDistrict = new Map()
  for (const place of rows) {
    const key = place.district?.trim() || ''
    if (!byDistrict.has(key)) byDistrict.set(key, [])
    byDistrict.get(key).push(place)
  }
  const named = [...byDistrict.entries()]
    .filter(([district]) => district)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([district, places]) => ({ key: district, district, places }))
  const undistricted = byDistrict.get('')
  if (undistricted?.length) {
    named.push({ key: '__other', district: null, places: undistricted })
  }
  return named
}

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

  // Group by district ONLY when the active subcategory is "Groceries" (matched by
  // slug). Any other filter — including "All" — keeps the plain flat list.
  const groupByDistrictActive =
    subcategories.find((s) => s.id === activeSub)?.slug === GROUPED_SUB_SLUG
  const districtGroups =
    groupByDistrictActive && places.status === 'ready'
      ? groupByDistrict(places.rows)
      : null

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
      ) : districtGroups ? (
        // "Groceries": a block per district (like the markets screen groups days).
        districtGroups.map(({ key, district, places: groupPlaces }) => (
          <section className="catalog__group" key={key}>
            <h2 className="catalog__group-title">
              {district ?? t('catalog.districtOther')}
            </h2>
            <ul className="place-list">
              {groupPlaces.map((place) => (
                <li key={place.id}>
                  <PlaceRow place={place} />
                </li>
              ))}
            </ul>
          </section>
        ))
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
