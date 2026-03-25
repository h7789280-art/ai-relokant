import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';

const SYSTEM_PROMPT = `Ты — AI-помощник для русскоязычных экспатов в Турции (город Аланья и другие).
Ты помогаешь с любыми вопросами о жизни в Турции: ВНЖ, аренда, медицина, банки, транспорт, еда, шоппинг, культура, язык.
Отвечай на русском языке, дружелюбно и по делу. Если не знаешь точного ответа — честно скажи и предложи где искать.
Давай практичные советы из реальной жизни экспатов.`;

export default function AIPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Привет! Я AI-помощник для жизни в Турции. Спрашивайте о ВНЖ, аренде, медицине, банках и чём угодно! 🇹🇷' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const apiMessages = newMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const reply = data.content?.[0]?.text || 'Извините, не удалось получить ответ.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Ошибка: ${err.message}. Убедитесь что VITE_ANTHROPIC_API_KEY задан в .env` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="page ai-page">
      <h1 className="page-title">AI Помощник</h1>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              <div className="chat-avatar">
                {msg.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}
              </div>
              <div className="chat-bubble">{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg assistant">
              <div className="chat-avatar"><Bot size={18} /></div>
              <div className="chat-bubble typing">Думаю...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-row">
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Задайте вопрос о жизни в Турции..."
            disabled={loading}
          />
          <button className="chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
