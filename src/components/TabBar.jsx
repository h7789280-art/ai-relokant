import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Grid3X3, CalendarDays, Megaphone, Bot } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Главная', icon: Home },
  { path: '/catalog', label: 'Каталог', icon: Grid3X3 },
  { path: '/events', label: 'Афиша', icon: CalendarDays },
  { path: '/ads', label: 'Объявления', icon: Megaphone },
  { path: '/ai', label: 'AI', icon: Bot },
];

export default function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="tab-bar">
      {tabs.map((t) => {
        const active = location.pathname === t.path ||
          (t.path !== '/' && location.pathname.startsWith(t.path));
        return (
          <button
            key={t.path}
            className={`tab-item ${active ? 'active' : ''}`}
            onClick={() => navigate(t.path)}
          >
            <t.icon size={22} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
