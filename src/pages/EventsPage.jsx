import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { supabaseGet } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import FavButton from '../components/FavButton';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export default function EventsPage() {
  const { city } = useApp();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  useEffect(() => {
    const year = new Date().getFullYear();
    const month = String(selectedMonth + 1).padStart(2, '0');
    const start = `${year}-${month}-01`;
    const end = selectedMonth === 11
      ? `${year + 1}-01-01`
      : `${year}-${String(selectedMonth + 2).padStart(2, '0')}-01`;

    const params = {
      'date_start': `gte.${start}`,
      order: 'date_start.asc',
      is_active: 'eq.true',
    };
    if (city?.id) params.city_id = `eq.${city.id}`;

    setLoading(true);
    supabaseGet('events', params)
      .then((data) => {
        setEvents(data.filter((e) => e.date_start < end));
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [selectedMonth, city]);

  return (
    <div className="page">
      <h1 className="page-title">Афиша</h1>

      <div className="months-scroll">
        {MONTHS.map((m, i) => (
          <button
            key={i}
            className={`month-btn ${i === selectedMonth ? 'active' : ''}`}
            onClick={() => setSelectedMonth(i)}
          >
            {m}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : events.length === 0 ? (
        <div className="empty-state">Нет мероприятий в {MONTHS[selectedMonth].toLowerCase()}</div>
      ) : (
        <div className="events-list">
          {events.map((ev) => (
            <div key={ev.id} className="event-card">
              <div className="event-date">
                <Calendar size={14} />
                <span>{ev.date_start}</span>
              </div>
              <h3>{ev.icon} {ev.title}</h3>
              <p>{ev.description}</p>
              {ev.location && <div className="event-location">{ev.location}</div>}
              {ev.price && <div className="event-price">{ev.price}</div>}
              <FavButton type="event" id={ev.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
