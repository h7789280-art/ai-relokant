import { useState } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Header() {
  const { city, cities, selectCity } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <header className="header">
      <div className="header-inner">
        <span className="logo">AI Релокант</span>
        <button className="city-selector" onClick={() => setOpen(!open)}>
          <MapPin size={16} />
          <span>{city?.name || 'Город'}</span>
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="city-dropdown">
          {cities.map((c) => (
            <button
              key={c.id}
              className={`city-option ${c.id === city?.id ? 'active' : ''}`}
              onClick={() => { selectCity(c); setOpen(false); }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
