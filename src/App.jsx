import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import WeatherDetails from './pages/WeatherDetails.jsx'
import Markets from './pages/Markets.jsx'
import Sos from './pages/Sos.jsx'
import Catalog from './pages/Catalog.jsx'
import CatalogCategory from './pages/CatalogCategory.jsx'
import Place from './pages/Place.jsx'
import Events from './pages/Events.jsx'
import Event from './pages/Event.jsx'
import News from './pages/News.jsx'
import NewsArticle from './pages/NewsArticle.jsx'
import Guides from './pages/Guides.jsx'
import Guide from './pages/Guide.jsx'
import Favorites from './pages/Favorites.jsx'
import Chat from './pages/Chat.jsx'
import Profile from './pages/Profile.jsx'
import Admin from './pages/Admin.jsx'
import Welcome from './pages/Welcome.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import AuthModal from './components/AuthModal.jsx'
import SessionToast from './components/SessionToast.jsx'
import { useApp } from './context/appContext.js'
import { useAuth } from './context/authContext.js'

export default function App() {
  const { isOnboarded } = useApp()
  const { recovering } = useAuth()

  // While a "reset password" link is being handled, the new-password screen is
  // the ONLY thing allowed to render — no matter the path or onboarding state.
  // This keeps the recovery session from being adopted as a normal login and
  // sweeping the user into the app before they set a new password (CLAUDE.md §3).
  if (recovering) {
    return (
      <Routes>
        <Route path="*" element={<ResetPassword />} />
      </Routes>
    )
  }

  return (
    <>
    <Routes>
      {/* First run → welcome; afterwards it redirects straight to home (§4).
          Welcome lives outside the Layout, so the tab bar never shows on it. */}
      <Route
        path="/welcome"
        element={isOnboarded ? <Navigate to="/" replace /> : <Welcome />}
      />

      {/* Password-reset link target (§3). Outside the onboarding guard and the
          tab-bar Layout so it works regardless of whether a city is picked. */}
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Main app: tabbed shell with the bottom navigation (§4). Guarded — until
          onboarded, every main route bounces to welcome. */}
      {isOnboarded ? (
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/weather" element={<WeatherDetails />} />
          <Route path="/markets" element={<Markets />} />
          {/* Emergency help (§4). An ordinary screen inside the tab shell — no
              tab of its own; the red SOS button in the Home header leads here. */}
          <Route path="/sos" element={<Sos />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/catalog/place/:placeId" element={<Place />} />
          <Route path="/catalog/:categorySlug" element={<CatalogCategory />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:eventId" element={<Event />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:newsId" element={<NewsArticle />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="/guides/:guideId" element={<Guide />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profile" element={<Profile />} />
          {/* Closed moderation panel — Admin itself redirects non-admins (§7). */}
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      )}
    </Routes>
    {/* Shared sign-in / register modal — any gated surface opens it (§6, §12). */}
    <AuthModal />
    {/* Unobtrusive "session expired" notice on token loss (§3). */}
    <SessionToast />
    </>
  )
}
