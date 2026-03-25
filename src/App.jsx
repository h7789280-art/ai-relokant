import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Header from './components/Header';
import TabBar from './components/TabBar';
import FloatingAI from './components/FloatingAI';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import EventsPage from './pages/EventsPage';
import AdsPage from './pages/AdsPage';
import AIPage from './pages/AIPage';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <div className="app">
          <Header />
          <main className="main">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/catalog/:categoryId" element={<CatalogPage />} />
              <Route path="/catalog/:categoryId/:subcategoryId" element={<CatalogPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/ads" element={<AdsPage />} />
              <Route path="/ai" element={<AIPage />} />
            </Routes>
          </main>
          <FloatingAI />
          <TabBar />
        </div>
      </AppProvider>
    </BrowserRouter>
  );
}
