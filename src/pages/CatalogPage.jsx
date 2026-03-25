import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MapPin, Clock, Star } from 'lucide-react';
import { supabaseGet } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import FavButton from '../components/FavButton';

export default function CatalogPage() {
  const { categoryId, subcategoryId } = useParams();
  const navigate = useNavigate();
  const { city } = useApp();
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (!categoryId) {
      supabaseGet('categories', { order: 'sort_order.asc' }).then(setCategories).finally(() => setLoading(false));
    } else if (!subcategoryId) {
      supabaseGet('subcategories', { category_id: `eq.${categoryId}`, order: 'label.asc' })
        .then(setSubcategories).finally(() => setLoading(false));
    } else {
      const params = { subcategory_id: `eq.${subcategoryId}`, order: 'name.asc' };
      if (city?.id) params.city_id = `eq.${city.id}`;
      supabaseGet('places', params).then(setPlaces).finally(() => setLoading(false));
    }
  }, [categoryId, subcategoryId, city]);

  if (loading) return <div className="page loading">Загрузка...</div>;

  // Places list
  if (subcategoryId) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate(`/catalog/${categoryId}`)}>
          <ArrowLeft size={18} /> Назад
        </button>
        <h1 className="page-title">Места</h1>
        {places.length === 0 && <div className="empty-state">Пока нет мест в этой категории</div>}
        <div className="places-list">
          {places.map((p) => (
            <div key={p.id} className="place-card">
              <div className="place-header">
                <h3>{p.name}</h3>
                <FavButton type="place" id={p.id} />
              </div>
              {p.description && <p>{p.description}</p>}
              {p.rating && (
                <div className="place-rating">
                  <Star size={13} fill="#fbbf24" stroke="#fbbf24" /> {p.rating}
                </div>
              )}
              {p.address && (
                <a
                  className="place-link"
                  href={p.lat && p.lng
                    ? `https://www.google.com/maps?q=${p.lat},${p.lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin size={14} /> {p.address}
                </a>
              )}
              {p.phone && (
                <a className="place-link" href={`tel:${p.phone}`}>
                  <Phone size={14} /> {p.phone}
                </a>
              )}
              {p.hours && (
                <div className="place-hours">
                  <Clock size={14} /> {p.hours}
                </div>
              )}
              {p.tags && p.tags.length > 0 && (
                <div className="place-tags">
                  {p.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Subcategories
  if (categoryId) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate('/catalog')}>
          <ArrowLeft size={18} /> Назад
        </button>
        <h1 className="page-title">Подкатегории</h1>
        {subcategories.length === 0 && <div className="empty-state">Нет подкатегорий</div>}
        <div className="categories-grid two-col">
          {subcategories.map((sub) => (
            <button
              key={sub.id}
              className="category-card"
              onClick={() => navigate(`/catalog/${categoryId}/${sub.id}`)}
            >
              <span className="category-name">{sub.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // All categories
  return (
    <div className="page">
      <h1 className="page-title">Каталог</h1>
      <div className="categories-grid two-col">
        {categories.map((cat) => (
          <button
            key={cat.id}
            className="category-card"
            onClick={() => navigate(`/catalog/${cat.id}`)}
          >
            <span className="category-icon">{cat.icon || '📁'}</span>
            <span className="category-name">{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
