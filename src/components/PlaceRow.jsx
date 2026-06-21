// A single place row for catalog lists (category list + catalog search).
// Photo · name/address · trust badges · chevron. Promoted (paid) and verified
// (quality) are separate, honest marks (CLAUDE.md §11/§12). Tapping opens the
// place card.
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin, BadgeCheck, Megaphone } from 'lucide-react'
import FavoriteButton from './FavoriteButton.jsx'

export default function PlaceRow({ place }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // The favorite heart is a sibling of the row button, not a child — a button
  // can't be nested inside another button. A relative wrapper overlays it.
  return (
    <div className="place-row-wrap">
      <button
        type="button"
        className="place-row"
        onClick={() => navigate(`/catalog/place/${place.id}`)}
      >
        {place.photos?.[0] ? (
          <img className="place-row__photo" src={place.photos[0]} alt="" loading="lazy" />
        ) : (
          <span className="place-row__photo place-row__photo--ph" aria-hidden="true">
            <MapPin size={20} />
          </span>
        )}
        <span className="place-row__body">
          <span className="place-row__name">{place.name}</span>
          {place.address && <span className="place-row__address">{place.address}</span>}
          {(place.is_promoted || place.is_verified) && (
            <span className="place-row__badges">
              {place.is_promoted && (
                <span className="badge badge--promoted">
                  <Megaphone size={12} aria-hidden="true" />
                  {t('catalog.promoted')}
                </span>
              )}
              {place.is_verified && (
                <span className="badge badge--verified">
                  <BadgeCheck size={12} aria-hidden="true" />
                  {t('catalog.verified')}
                </span>
              )}
            </span>
          )}
        </span>
        <ChevronRight className="place-row__chevron" size={18} aria-hidden="true" />
      </button>
      <FavoriteButton itemId={place.id} size={18} className="place-row__fav" />
    </div>
  )
}
