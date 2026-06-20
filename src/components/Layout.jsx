import { Outlet } from 'react-router-dom'
import TabBar from './TabBar.jsx'

// Каркас основных экранов: отрисованная вкладка + фиксированный таб-бар внизу
// (CLAUDE.md §4). Экран приветствия (Welcome) рендерится вне этого каркаса,
// поэтому таб-бар на нём не показывается.
export default function Layout() {
  return (
    <div className="layout">
      <div className="layout__content">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}
