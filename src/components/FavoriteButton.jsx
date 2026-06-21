// Heart toggle for saving a place to favorites (CLAUDE.md §4). Shared by the
// place card and the catalog list rows. Signed out, it softly invites sign-in
// (opens the shared auth modal) instead of failing. The toggle is optimistic and
// reverts if the write fails, so a tap always feels instant.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react'
import { useAuth } from '../context/authContext.js'
import { isFavorite, addFavorite, removeFavorite } from '../lib/favorites.js'

export default function FavoriteButton({ itemId, itemType = 'place', size = 20, className = '' }) {
  const { t } = useTranslation()
  const { isAuthed, openAuth } = useAuth()
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)

  // Reflect the stored state once we know who's signed in.
  useEffect(() => {
    let alive = true
    if (!isAuthed || !itemId) {
      setActive(false)
      return
    }
    isFavorite(itemId, itemType)
      .then((v) => alive && setActive(v))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isAuthed, itemId, itemType])

  async function toggle(event) {
    // The button often sits inside a clickable row — don't trigger navigation.
    event.preventDefault()
    event.stopPropagation()
    if (!isAuthed) {
      openAuth()
      return
    }
    if (busy || !itemId) return
    const next = !active
    setActive(next) // optimistic
    setBusy(true)
    try {
      if (next) await addFavorite(itemId, itemType)
      else await removeFavorite(itemId, itemType)
    } catch {
      setActive(!next) // revert on failure
    } finally {
      setBusy(false)
    }
  }

  const label = active ? t('favorites.remove') : t('favorites.add')

  return (
    <button
      type="button"
      className={`fav-btn${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      onClick={toggle}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      <Heart size={size} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}
