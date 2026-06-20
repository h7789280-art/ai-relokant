import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Welcome from './pages/Welcome.jsx'
import { useApp } from './context/appContext.js'

export default function App() {
  const { isOnboarded } = useApp()

  return (
    <Routes>
      {/* First run → welcome; afterwards it redirects straight to home (§4). */}
      <Route
        path="/welcome"
        element={isOnboarded ? <Navigate to="/" replace /> : <Welcome />}
      />
      <Route
        path="/"
        element={isOnboarded ? <Home /> : <Navigate to="/welcome" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
