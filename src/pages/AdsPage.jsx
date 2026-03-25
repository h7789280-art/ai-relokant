import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabaseGet } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import FavButton from '../components/FavButton';

const FILTERS = [
  { label: 'Все', value: 'all' },
  { label: 'Работа', value: 'Работа' },
  { label: 'Услуги', value: 'Услуги' },
];

export default function AdsPage() {
  const { city } = useApp();
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const params = { order: 'created_at.desc' };
    if (city?.id) params.city_id = `eq.${city.id}`;
    if (filter !== 'all') params.type = `eq.${filter}`;

    setLoading(true);
    supabaseGet('ads', params)
      .then(setAds)
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  }, [filter, city]);

  const renderText = (text) => {
    if (!text) return null;
    // Make @username and t.me links clickable
    return text.replace(
      /@(\w+)/g,
      '<a href="https://t.me/$1" target="_blank" rel="noopener noreferrer">@$1</a>'
    ).replace(
      /(https?:\/\/t\.me\/\S+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  };

  return (
    <div className="page">
      <h1 className="page-title">Объявления</h1>

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-btn ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : ads.length === 0 ? (
        <div className="empty-state">Нет объявлений</div>
      ) : (
        <div className="ads-list">
          {ads.map((ad) => (
            <div key={ad.id} className="ad-card">
              <div className="ad-header">
                <span className="ad-type">{ad.type || 'Общее'}</span>
                <FavButton type="ad" id={ad.id} />
              </div>
              <h3>{ad.title}</h3>
              <p dangerouslySetInnerHTML={{ __html: renderText(ad.description) }} />
              {ad.telegram_link && (
                <a
                  className="ad-tg-link"
                  href={ad.telegram_link.startsWith('http') ? ad.telegram_link : `https://t.me/${ad.telegram_link.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} /> Написать в Telegram
                </a>
              )}
              <div className="ad-date">
                {ad.created_at ? new Date(ad.created_at).toLocaleDateString('ru-RU') : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
