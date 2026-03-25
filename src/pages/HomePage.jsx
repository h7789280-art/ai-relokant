import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Sun, ChevronRight, Calendar, BookOpen, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabaseGet } from '../lib/supabase';
import FavButton from '../components/FavButton';

const TIPS = [
  'Турецкий кофе подают с водой — выпейте воду до кофе, чтобы очистить вкусовые рецепторы.',
  'В Турции принято торговаться на базарах — не стесняйтесь!',
  'Чаевые в ресторанах обычно 10% от счёта.',
  'Большинство музеев закрыты по понедельникам.',
  'Скажите "Teşekkürler" (тешеккюрлер) — спасибо по-турецки!',
  'Общественный транспорт работает по карте Antalyakart — купите на остановке.',
];

export default function HomePage() {
  const { city, extraCurrencies, setExtraCurrencies } = useApp();
  const navigate = useNavigate();
  const [rates, setRates] = useState([]);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [guides, setGuides] = useState([]);
  const [eventsFilter, setEventsFilter] = useState('today');
  const [showCurrSettings, setShowCurrSettings] = useState(false);
  const [availableCurrencies, setAvailableCurrencies] = useState([]);

  const tip = TIPS[new Date().getDate() % TIPS.length];

  useEffect(() => {
    supabaseGet('currency_cache', { order: 'id.asc' }).then(setRates).catch(() => {});
    supabaseGet('categories', { order: 'name.asc', limit: '8' }).then(setCategories).catch(() => {});
    supabaseGet('guides', { order: 'created_at.desc' }).then(setGuides).catch(() => {});
  }, []);

  useEffect(() => {
    if (rates.length) {
      const codes = rates.map((r) => r.currency_code || r.code).filter(Boolean);
      setAvailableCurrencies(codes);
    }
  }, [rates]);

  useEffect(() => {
    const params = { order: 'date.asc' };
    const today = new Date().toISOString().slice(0, 10);
    if (eventsFilter === 'today') {
      params['date'] = `eq.${today}`;
    } else {
      const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      params['date'] = `gte.${today}`;
      params['date'] = `lte.${week}`;
    }
    if (city?.id) params['city_id'] = `eq.${city.id}`;
    supabaseGet('events', params).then(setEvents).catch(() => {});
  }, [eventsFilter, city]);

  const displayRates = rates.filter((r) => {
    const code = r.currency_code || r.code;
    return code === 'USD' || code === 'EUR' || extraCurrencies.includes(code);
  });

  const toggleCurrency = (code) => {
    setExtraCurrencies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  return (
    <div className="page home-page">
      {/* Hero */}
      <div className="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1>Добро пожаловать в {city?.name || 'Турцию'}!</h1>
          <p>Ваш AI-гид по жизни в Турции</p>
        </div>
      </div>

      {/* Weather demo */}
      <section className="section">
        <div className="weather-card">
          <Sun size={32} color="#fbbf24" />
          <div>
            <div className="weather-temp">28°C</div>
            <div className="weather-desc">Солнечно · {city?.name || 'Аланья'}</div>
          </div>
        </div>
      </section>

      {/* Currency */}
      <section className="section">
        <div className="section-header">
          <h2>Курсы валют</h2>
          <button className="icon-btn" onClick={() => setShowCurrSettings(true)}>
            <Settings size={18} />
          </button>
        </div>
        <div className="currency-row">
          {displayRates.length > 0 ? displayRates.map((r) => (
            <div key={r.id} className="currency-card">
              <span className="currency-code">{r.currency_code || r.code}</span>
              <span className="currency-rate">{Number(r.rate).toFixed(2)} ₺</span>
            </div>
          )) : (
            <div className="empty-state">Нет данных о курсах</div>
          )}
        </div>
      </section>

      {/* Currency Settings Modal */}
      {showCurrSettings && (
        <div className="modal-overlay" onClick={() => setShowCurrSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Настройка валют</h3>
              <button className="icon-btn" onClick={() => setShowCurrSettings(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="modal-hint">USD и EUR показываются всегда. Выберите дополнительные:</p>
            <div className="currency-settings-list">
              {availableCurrencies.filter((c) => c !== 'USD' && c !== 'EUR').map((code) => (
                <label key={code} className="currency-toggle">
                  <input
                    type="checkbox"
                    checked={extraCurrencies.includes(code)}
                    onChange={() => toggleCurrency(code)}
                  />
                  <span>{code}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Events */}
      <section className="section">
        <div className="section-header">
          <h2>Мероприятия</h2>
          <div className="toggle-group">
            <button
              className={`toggle-btn ${eventsFilter === 'today' ? 'active' : ''}`}
              onClick={() => setEventsFilter('today')}
            >Сегодня</button>
            <button
              className={`toggle-btn ${eventsFilter === 'week' ? 'active' : ''}`}
              onClick={() => setEventsFilter('week')}
            >Неделя</button>
          </div>
        </div>
        {events.length > 0 ? events.slice(0, 4).map((ev) => (
          <div key={ev.id} className="event-card">
            <div className="event-date">
              <Calendar size={14} />
              <span>{ev.date}</span>
            </div>
            <h3>{ev.title}</h3>
            <p>{ev.description}</p>
            <FavButton type="event" id={ev.id} />
          </div>
        )) : (
          <div className="empty-state">Нет мероприятий</div>
        )}
      </section>

      {/* Categories grid */}
      <section className="section">
        <div className="section-header">
          <h2>Категории</h2>
          <button className="link-btn" onClick={() => navigate('/catalog')}>
            Все <ChevronRight size={16} />
          </button>
        </div>
        <div className="categories-grid">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="category-card"
              onClick={() => navigate(`/catalog/${cat.id}`)}
            >
              <span className="category-icon">{cat.icon || '📁'}</span>
              <span className="category-name">{cat.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Guides */}
      <section className="section">
        <div className="section-header">
          <h2>Гайды</h2>
          <BookOpen size={18} />
        </div>
        <div className="guides-scroll">
          {guides.length > 0 ? guides.map((g) => (
            <div key={g.id} className="guide-card">
              {g.image_url && <img src={g.image_url} alt={g.title} />}
              <h3>{g.title}</h3>
              <p>{g.summary || g.description}</p>
              <FavButton type="guide" id={g.id} />
            </div>
          )) : (
            <div className="empty-state">Скоро появятся гайды!</div>
          )}
        </div>
      </section>

      {/* Tip */}
      <section className="section">
        <div className="tip-card">
          <Sparkles size={20} color="#fbbf24" />
          <div>
            <strong>Совет дня</strong>
            <p>{tip}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
