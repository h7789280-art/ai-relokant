// Catalog — search + category grid (CLAUDE.md §4.3, §5). Search comes FIRST:
// in CityMate finding beats browsing. The search box does a plain text filter
// over the city's places, categories and subcategories (city-scoped, approved
// only) — the AI assistant ("Ask CityMate") lives on Home and is separate (§6).
// With no query we show the category grid; tapping a category drills into its
// subcategories + place list (CatalogCategory). Labels come from i18n
// (catalog.categories.<slug> / catalog.subcategories.<slug>), falling back to
// the DB name.
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Search, X } from 'lucide-react'
import { useApp } from '../context/appContext.js'
import {
  fetchCategories,
  fetchAllSubcategories,
  searchPlaces,
  withTranslations,
} from '../lib/content.js'
import { categoryIcon } from '../lib/categoryIcons.js'
import PlaceRow from '../components/PlaceRow.jsx'

// Category slug → illustration file in public/categories/ (800×600 WebP, subject
// on the right over a light ivory left third). Served by URL (not bundled) so
// Vite never re-encodes or inlines them and the file weight stays as shipped.
const CATEGORY_IMAGE = {
  health: 'stethoscope',
  documents: 'documents',
  home: 'armchair',
  shops: 'shops',
  food: 'food',
  transport: 'transport',
  kids: 'kids_teddy',
  leisure: 'leisure',
  realestate: 'real_estate',
  pets: 'pets',
}

export default function Catalog() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { cityId } = useApp()

  const [query, setQuery] = useState('')
  // Slugs whose illustration failed to load — the card then drops the image and
  // scrim and falls back to the icon plaque + text on a clean surface.
  const [imgFailed, setImgFailed] = useState(() => new Set())
  const [cats, setCats] = useState({ status: 'loading', rows: [] })
  const [subs, setSubs] = useState([])
  // `q` tags which query these rows answer (null = none yet); a search is
  // "loading" while the current query hasn't been answered (places.q !== q).
  const [places, setPlaces] = useState({ rows: [], q: null })

  // Reference data for the grid + client-side category/subcategory matching.
  useEffect(() => {
    let active = true
    Promise.all([fetchCategories(), fetchAllSubcategories()])
      .then(([categories, subcategories]) => {
        if (!active) return
        setCats({ status: 'ready', rows: categories })
        setSubs(subcategories)
      })
      .catch(() => active && setCats({ status: 'error', rows: [] }))
    return () => {
      active = false
    }
  }, [])

  const q = query.trim()
  const searching = q.length > 0

  // Place search (server-side, city-scoped, approved). Only runs while typing;
  // when the query is cleared the results are simply not rendered (the grid
  // shows instead), so we don't need to reset state here.
  useEffect(() => {
    if (!searching || !cityId) return
    let active = true
    searchPlaces(cityId, q)
      .then((rows) => withTranslations('places', rows, i18n.language))
      .then((rows) => active && setPlaces({ rows, q }))
      .catch(() => active && setPlaces({ rows: [], q }))
    return () => {
      active = false
    }
  }, [searching, q, cityId, i18n.language])

  // Localized label for a category / subcategory slug (i18n, DB name fallback).
  const catLabel = (cat) => t(`catalog.categories.${cat.slug}`, cat.name)
  const subLabel = (sub) => t(`catalog.subcategories.${sub.slug}`, sub.name)
  // Short subtitle under the name (i18n; empty string = not shown).
  const catDesc = (cat) => t(`catalog.categoryDesc.${cat.slug}`, '')

  // Category slug by id, so a matched subcategory can link to its parent screen.
  const catSlugById = useMemo(() => {
    const map = new Map()
    for (const c of cats.rows) map.set(c.id, c.slug)
    return map
  }, [cats.rows])

  const needle = q.toLowerCase()
  const matchedCats = searching
    ? cats.rows.filter((c) => catLabel(c).toLowerCase().includes(needle))
    : []
  const matchedSubs = searching
    ? subs.filter((s) => subLabel(s).toLowerCase().includes(needle))
    : []

  // Results for the current query are in once places.q matches it.
  const placesLoading = searching && places.q !== q
  const noResults =
    searching &&
    !placesLoading &&
    places.rows.length === 0 &&
    matchedCats.length === 0 &&
    matchedSubs.length === 0

  return (
    <main className="app-shell catalog">
      <header className="catalog__header">
        <h1 className="catalog__title">{t('nav.catalog')}</h1>
        <p className="catalog__subtitle">{t('catalog.subtitle')}</p>
      </header>

      <div className="catalog__search">
        <Search className="catalog__search-icon" size={18} aria-hidden="true" />
        <input
          type="search"
          className="catalog__search-input"
          placeholder={t('catalog.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('catalog.searchPlaceholder')}
        />
        {query && (
          <button
            type="button"
            className="catalog__search-clear"
            onClick={() => setQuery('')}
            aria-label={t('common.cancel')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {!searching ? (
        cats.status === 'loading' ? (
          <div className="catalog__grid">
            <div className="catalog__skeleton" />
            <div className="catalog__skeleton" />
            <div className="catalog__skeleton" />
            <div className="catalog__skeleton" />
          </div>
        ) : cats.rows.length === 0 ? (
          <p className="catalog__empty">{t('catalog.empty')}</p>
        ) : (
          <div className="catalog__grid">
            {cats.rows.map((cat) => {
              const Icon = categoryIcon(cat.icon)
              const imgName = CATEGORY_IMAGE[cat.slug]
              const showImg = imgName && !imgFailed.has(cat.slug)
              const desc = catDesc(cat)
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="cat-tile"
                  onClick={() => navigate(`/catalog/${cat.slug}`)}
                >
                  {showImg && (
                    <>
                      <img
                        className="cat-tile__img"
                        src={`/categories/${imgName}.webp`}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        onError={() =>
                          setImgFailed((prev) => new Set(prev).add(cat.slug))
                        }
                      />
                      <span className="cat-tile__scrim" aria-hidden="true" />
                    </>
                  )}
                  <span className="cat-tile__body">
                    <span className="cat-tile__icon" aria-hidden="true">
                      <Icon size={22} strokeWidth={2} />
                    </span>
                    <span className="cat-tile__text">
                      <span className="cat-tile__name-row">
                        <span className="cat-tile__name">{catLabel(cat)}</span>
                        <ChevronRight
                          className="cat-tile__chevron"
                          size={18}
                          aria-hidden="true"
                        />
                      </span>
                      {desc && <span className="cat-tile__desc">{desc}</span>}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )
      ) : (
        <div className="catalog__results">
          {(matchedCats.length > 0 || matchedSubs.length > 0) && (
            <div className="catalog__subchips">
              {matchedCats.map((cat) => {
                const Icon = categoryIcon(cat.icon)
                return (
                  <button
                    key={`c-${cat.id}`}
                    type="button"
                    className="cat-subchip"
                    onClick={() => navigate(`/catalog/${cat.slug}`)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {catLabel(cat)}
                  </button>
                )
              })}
              {matchedSubs.map((sub) => {
                const parentSlug = catSlugById.get(sub.category_id)
                if (!parentSlug) return null
                return (
                  <button
                    key={`s-${sub.id}`}
                    type="button"
                    className="cat-subchip"
                    onClick={() => navigate(`/catalog/${parentSlug}`)}
                  >
                    {subLabel(sub)}
                  </button>
                )
              })}
            </div>
          )}

          {placesLoading ? (
            <div className="place-list">
              <div className="catalog__skeleton catalog__skeleton--row" />
              <div className="catalog__skeleton catalog__skeleton--row" />
            </div>
          ) : places.rows.length > 0 ? (
            <ul className="place-list">
              {places.rows.map((place) => (
                <li key={place.id}>
                  <PlaceRow place={place} />
                </li>
              ))}
            </ul>
          ) : null}

          {noResults && <p className="catalog__empty">{t('catalog.noResults')}</p>}
        </div>
      )}
    </main>
  )
}
