import { NavLink } from 'react-router-dom'
import { Home, LayoutGrid, Heart, Bot, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Нижнее меню — 5 вкладок (CLAUDE.md §4): Главная / Каталог / Избранное / AI чат
// / Профиль. Фиксировано внизу, iOS-стиль; активная вкладка — акцентным синим,
// неактивные приглушённые. Подписи берутся из i18n. Показывается на основных
// экранах, но НЕ на экране приветствия (см. Layout).
const TABS = [
  { to: '/', icon: Home, labelKey: 'nav.home', end: true },
  { to: '/catalog', icon: LayoutGrid, labelKey: 'nav.catalog' },
  { to: '/favorites', icon: Heart, labelKey: 'nav.favorites' },
  { to: '/chat', icon: Bot, labelKey: 'nav.chat' },
  { to: '/profile', icon: User, labelKey: 'nav.profile' },
]

export default function TabBar() {
  const { t } = useTranslation()

  return (
    <nav className="tab-bar" aria-label={t('nav.home')}>
      <div className="tab-bar__inner">
        {TABS.map((tab) => {
          // Pulled out as a local (not a destructured arg) so the uppercase
          // varsIgnorePattern covers it — JSX-only usage isn't tracked by the
          // lint config, which has no react/jsx-uses-vars rule.
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `tab-bar__item${isActive ? ' is-active' : ''}`
              }
            >
              <Icon className="tab-bar__icon" size={24} strokeWidth={2} aria-hidden="true" />
              <span className="tab-bar__label">{t(tab.labelKey)}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
