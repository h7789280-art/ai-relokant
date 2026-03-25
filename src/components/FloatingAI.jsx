import { useNavigate, useLocation } from 'react-router-dom';
import { Bot } from 'lucide-react';

export default function FloatingAI() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === '/ai') return null;

  return (
    <button className="floating-ai" onClick={() => navigate('/ai')}>
      <Bot size={24} />
    </button>
  );
}
