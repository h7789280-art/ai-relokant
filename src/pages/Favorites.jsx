// Saved places for the current user (CLAUDE.md §4). Lives behind the auth gate
// (favorites need an account). Shows the user's saved places as catalog rows,
// newest first, with a tidy empty state. Tapping a row opens the place card.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react'
import AuthGate from '../components/AuthGate.jsx'
import PlaceRow from '../components/PlaceRow.jsx'
import { useAuth } from '../context/authContext.js'
import { listFavoriteIds } from '../lib/favorites.js'
import { fetchPlacesByIds, withTranslations } from '../lib/content.js'

function FavoritesList() {
  const { t, i18n } = useTranslation()
  const { isAuthed } = useAuth()
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    if (!isAuthed) return
    let active = true
    listFavoriteIds('place')
      .then(async (ids) => {
        if (!ids.length) return []
        const rows = await fetchPlacesByIds(ids)
        // Re-order to favorite order (newest first) — .in() doesn't preserve it.
        const rank = new Map(ids.map((id, i) => [id, i]))
        rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        return withTranslations('places', rows, i18n.language)
      })
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch(() => active && setState({ status: 'error', rows: [] }))
    return () => {
      active = false
    }
  }, [isAuthed, i18n.language])

  return (
    <main className="app-shell catalog">
      <header className="catalog__header">
        <h1 className="catalog__title">{t('nav.favorites')}</h1>
        <p className="catalog__subtitle muted">{t('favorites.subtitle')}</p>
      </header>

      {state.status === 'loading' ? (
        <div className="place-list">
          <div className="catalog__skeleton catalog__skeleton--row" />
          <div className="catalog__skeleton catalog__skeleton--row" />
        </div>
      ) : state.status === 'error' ? (
        <p className="catalog__empty">{t('favorites.error')}</p>
      ) : state.rows.length === 0 ? (
        <div className="favorites__empty">
          <span className="favorites__empty-icon" aria-hidden="true">
            <Heart size={26} strokeWidth={1.75} />
          </span>
          <p className="favorites__empty-title">{t('favorites.empty')}</p>
          <p className="favorites__empty-hint muted">{t('favorites.emptyHint')}</p>
        </div>
      ) : (
        <ul className="place-list">
          {state.rows.map((place) => (
            <li key={place.id}>
              <PlaceRow place={place} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default function Favorites() {
  const { t } = useTranslation()

  return (
    <AuthGate message={t('auth.gateFavorites')}>
      <FavoritesList />
    </AuthGate>
  )
}
