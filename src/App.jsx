import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Catalog from './pages/Catalog.jsx'
import CatalogCategory from './pages/CatalogCategory.jsx'
import Place from './pages/Place.jsx'
import Events from './pages/Events.jsx'
import News from './pages/News.jsx'
import NewsArticle from './pages/NewsArticle.jsx'
import Guides from './pages/Guides.jsx'
import Guide from './pages/Guide.jsx'
import Favorites from './pages/Favorites.jsx'
import Chat from './pages/Chat.jsx'
import Profile from './pages/Profile.jsx'
import Welcome from './pages/Welcome.jsx'
import AuthModal from './components/AuthModal.jsx'
import { useApp } from './context/appContext.js'

export default function App() {
  const { isOnboarded } = useApp()

  return (
    <>
    <Routes>
      {/* First run → welcome; afterwards it redirects straight to home (§4).
          Welcome lives outside the Layout, so the tab bar never shows on it. */}
      <Route
        path="/welcome"
        element={isOnboarded ? <Navigate to="/" replace /> : <Welcome />}
      />

      {/* Main app: tabbed shell with the bottom navigation (§4). Guarded — until
          onboarded, every main route bounces to welcome. */}
      {isOnboarded ? (
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/catalog/place/:placeId" element={<Place />} />
          <Route path="/catalog/:categorySlug" element={<CatalogCategory />} />
          <Route path="/events" element={<Events />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:newsId" element={<NewsArticle />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="/guides/:guideId" element={<Guide />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      )}
    </Routes>
    {/* Shared sign-in / register modal — any gated surface opens it (§6, §12). */}
    <AuthModal />
    </>
  )
}
