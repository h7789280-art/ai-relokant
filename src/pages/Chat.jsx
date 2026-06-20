// AI-помощник — сердце приложения (CLAUDE.md §4.2, §6). Требует входа (лимит
// будет считаться по аккаунту со следующего шага). Свободный чат с Gemini через
// серверный прокси /api/chat: лента пузырей, поле ввода, индикатор «печатает…»,
// аккуратная ошибка. Заземление на данные города добавим следующим шагом.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Bot, ArrowUp } from 'lucide-react'
import AuthGate from '../components/AuthGate.jsx'
import { Markdown } from '../lib/markdown.jsx'
import { useApp } from '../context/appContext.js'

function ChatRoom() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { cityId } = useApp()

  // A pre-filled question handed over from Home ("Ask CityMate" bar / chips)
  // lands in the input, ready to send (read once so re-renders don't refill it).
  const [input, setInput] = useState(() => location.state?.question || '')
  const [messages, setMessages] = useState([]) // { role: 'user' | 'assistant', text }
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const listRef = useRef(null)
  const inputRef = useRef(null)

  // Keep the newest message (and the typing indicator) in view.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  // Focus the field on mount so a seeded question can be sent straight away.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    const history = [...messages, { role: 'user', text }]
    setMessages(history)
    setInput('')
    setError(null)
    setSending(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // city_id scopes the answer to the active city's approved data (§6/§5).
        body: JSON.stringify({ messages: history, lang: i18n.language, city_id: cityId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.reply) {
        // Show Gemini's own detail when the proxy passes it through (§6).
        setError(data?.detail || data?.error || t('chat.error'))
        return
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply }])
    } catch {
      setError(t('chat.error'))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const empty = messages.length === 0

  return (
    <main className="app-shell chat">
      <div className="chat__log" ref={listRef}>
        {empty && (
          <div className="chat__welcome">
            <span className="chat__welcome-icon" aria-hidden="true">
              <Bot size={30} strokeWidth={1.8} />
            </span>
            <h1 className="chat__welcome-title">{t('chat.welcomeTitle')}</h1>
            <p className="chat__welcome-text">{t('chat.welcomeText')}</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`chat__bubble chat__bubble--${m.role === 'user' ? 'user' : 'bot'}`}
          >
            {m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}
          </div>
        ))}

        {sending && (
          <div className="chat__bubble chat__bubble--bot chat__typing" aria-live="polite">
            <span className="chat__typing-label">{t('chat.typing')}</span>
            <span className="chat__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}

        {error && <p className="chat__error" role="alert">{error}</p>}
      </div>

      <div className="chat__composer">
        <textarea
          ref={inputRef}
          className="chat__input"
          rows={1}
          placeholder={t('chat.inputPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="chat__send"
          onClick={send}
          disabled={!input.trim() || sending}
          aria-label={t('chat.send')}
        >
          <ArrowUp size={20} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </main>
  )
}

export default function Chat() {
  const { t } = useTranslation()
  return (
    <AuthGate message={t('auth.gateChat')}>
      <ChatRoom />
    </AuthGate>
  )
}
