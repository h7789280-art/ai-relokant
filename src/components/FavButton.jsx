import { Star } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function FavButton({ type, id }) {
  const { isFavorite, toggleFavorite } = useApp();
  const fav = isFavorite(type, id);

  return (
    <button
      className={`fav-btn ${fav ? 'fav-active' : ''}`}
      onClick={(e) => { e.stopPropagation(); toggleFavorite(type, id); }}
      aria-label="В избранное"
    >
      <Star size={18} fill={fav ? '#fbbf24' : 'none'} stroke={fav ? '#fbbf24' : '#666'} />
    </button>
  );
}
