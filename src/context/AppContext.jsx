import { createContext, useContext, useState, useEffect } from 'react';
import { supabaseGet } from '../lib/supabase';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [city, setCity] = useState(null);
  const [cities, setCities] = useState([]);
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const [extraCurrencies, setExtraCurrencies] = useState(() => {
    const saved = localStorage.getItem('extraCurrencies');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    supabaseGet('cities', { order: 'name.asc' }).then((data) => {
      setCities(data);
      if (data.length > 0 && !city) {
        const saved = localStorage.getItem('selectedCity');
        const found = data.find((c) => c.id === saved);
        setCity(found || data[0]);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('extraCurrencies', JSON.stringify(extraCurrencies));
  }, [extraCurrencies]);

  const selectCity = (c) => {
    setCity(c);
    localStorage.setItem('selectedCity', c.id);
  };

  const toggleFavorite = (type, id) => {
    const key = `${type}:${id}`;
    setFavorites((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const isFavorite = (type, id) => favorites.includes(`${type}:${id}`);

  return (
    <AppContext.Provider
      value={{
        city,
        cities,
        selectCity,
        favorites,
        toggleFavorite,
        isFavorite,
        extraCurrencies,
        setExtraCurrencies,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
