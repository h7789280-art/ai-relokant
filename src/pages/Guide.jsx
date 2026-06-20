// A single "Documents & life" guide (CLAUDE.md §4 screen 4, §11). Renders the
// guide's title, a MANDATORY reference disclaimer (§11 — legal/document topics
// are high-risk), the markdown body, an interactive checklist (tick items as
// you go — local only, not persisted), the source link and the last-checked
// date (verified_at). The disclaimer is always shown: the guide's own text if
// set, otherwise the standard i18n fallback.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, ListChecks, ExternalLink, ShieldCheck } from 'lucide-react'
import { fetchGuide, withTranslations } from '../lib/content.js'
import i18n from '../i18n/index.js'

// Normalise the jsonb checklist into [{ label }] rows. Accepts an array of
// strings or of { label | text } objects; anything else yields no items.
function checklistItems(checklist) {
  if (!Array.isArray(checklist)) return []
  return checklist
    .map((it) => (typeof it === 'string' ? { label: it } : { label: it?.label ?? it?.text }))
    .filter((it) => it.label)
}

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

// Inline markdown: **bold** spans only (the rest renders as plain text).
function renderInline(text, keyBase) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  )
}

// Minimal markdown for guide bodies: blocks split on blank lines become
// headings (#/##/###), unordered lists (- / *), or paragraphs.
function renderMarkdown(body) {
  const blocks = body.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  return blocks.map((block, bi) => {
    const lines = block.split('\n')
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return (
        <ul className="guide__list" key={`b-${bi}`}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\s*[-*]\s+/, ''), `b-${bi}-${li}`)}</li>
          ))}
        </ul>
      )
    }
    const heading = lines.length === 1 && block.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const Tag = `h${heading[1].length + 1}` // h2 … h4
      return (
        <Tag className="guide__heading" key={`b-${bi}`}>
          {renderInline(heading[2], `b-${bi}`)}
        </Tag>
      )
    }
    return (
      <p className="guide__para" key={`b-${bi}`}>
        {renderInline(block.replace(/\n/g, ' '), `b-${bi}`)}
      </p>
    )
  })
}

export default function Guide() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { guideId } = useParams()
  const [state, setState] = useState({ status: 'loading', guide: null })
  const [checked, setChecked] = useState({}) // index -> boolean (local only)

  useEffect(() => {
    let active = true
    fetchGuide(guideId)
      .then(async (guide) => {
        if (!guide) return null
        const [translated] = await withTranslations('guides', [guide], i18n.language)
        return translated
      })
      .then((guide) => active && setState({ status: guide ? 'ready' : 'missing', guide }))
      .catch(() => active && setState({ status: 'error', guide: null }))
    return () => {
      active = false
    }
  }, [guideId])

  const back = (
    <button type="button" className="catalog__back" onClick={() => navigate(-1)}>
      <ArrowLeft size={18} aria-hidden="true" />
      {t('common.back')}
    </button>
  )

  if (state.status === 'loading') {
    return (
      <main className="app-shell guide">
        {back}
        <div className="catalog__skeleton catalog__skeleton--hero" />
        <div className="catalog__skeleton catalog__skeleton--row" />
      </main>
    )
  }

  if (state.status !== 'ready' || !state.guide) {
    return (
      <main className="app-shell guide">
        {back}
        <p className="catalog__empty">{t('guides.notFound')}</p>
      </main>
    )
  }

  const guide = state.guide
  const items = checklistItems(guide.checklist)
  const verified = formatDate(guide.verified_at)

  return (
    <main className="app-shell guide">
      {back}

      <h1 className="guide__title">{guide.title}</h1>

      {/* MANDATORY reference disclaimer (§11) — always shown. */}
      <div className="guide__disclaimer" role="note">
        <AlertTriangle size={18} aria-hidden="true" />
        <p>{guide.disclaimer || t('guides.disclaimer')}</p>
      </div>

      {guide.body && <div className="guide__body">{renderMarkdown(guide.body)}</div>}

      {items.length > 0 && (
        <section className="guide__checklist">
          <h2 className="guide__checklist-title">
            <ListChecks size={18} aria-hidden="true" />
            {t('guides.checklist')}
          </h2>
          <ul className="guide__checklist-list">
            {items.map((item, i) => (
              <li key={i}>
                <label className={`guide__check${checked[i] ? ' is-done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!checked[i]}
                    onChange={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                  />
                  <span className="guide__check-box" aria-hidden="true" />
                  <span className="guide__check-label">{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(guide.source_url || verified) && (
        <footer className="guide__foot">
          {guide.source_url && (
            <a
              className="guide__source"
              href={guide.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" />
              {t('guides.source')}
            </a>
          )}
          {verified && (
            <span className="guide__verified">
              <ShieldCheck size={16} aria-hidden="true" />
              {t('guides.verifiedAt')}: {verified}
            </span>
          )}
        </footer>
      )}
    </main>
  )
}
