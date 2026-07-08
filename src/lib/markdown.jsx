// Tiny, dependency-free Markdown renderer for chat bubbles (CLAUDE.md §9B).
// Gemini replies come back with Markdown (**bold**, bullet/numbered lists,
// blank-line paragraphs, and — since stage 2 — [label](path) card links).
// Rendering the raw text would leak the markers, so we translate the small
// subset the model actually uses into React elements.
//
// Intentionally minimal — bold, italic, links, lists, paragraphs, line breaks.
// Plain text is always rendered as-is (no HTML is ever injected), so this is
// XSS-safe; link targets are additionally whitelisted (see below).
import { Fragment } from 'react'
import { Link } from 'react-router-dom'

// HALLUCINATION GUARD for in-app links (CLAUDE.md §5.4): an internal path is only
// turned into a working <Link> when it exactly matches a known card route AND ends
// in a real UUID. Anything else (wrong prefix, malformed/invented id, markets —
// which have no card page) renders as plain text, so a hallucinated path can never
// become a live, wrong navigation. Routes: /catalog/place/:id, /events/:id,
// /news/:id, /guides/:id.
//
// The leading slash is OPTIONAL here: the model sometimes drops it and emits
// "events/<id>" instead of "/events/<id>". We tolerate both on the render side
// (and normalize to a leading-slash path before building the <Link>), so a valid
// card link stays clickable regardless. The guard is unchanged — prefix must be
// whitelisted AND the id must be a real UUID.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const INTERNAL_CARD_RE = new RegExp(
  `^/?(?:catalog/place|events|news|guides)/${UUID}$`,
  'i',
)

// Inline pass: [label](url) links, **bold**, *italic* / _italic_. Splits on the
// markers and emits <Link>/<a>/<strong>/<em> nodes; everything else stays literal.
function renderInline(text, keyBase) {
  const nodes = []
  // Order matters: match a whole [label](url) link first, then bold, then italic.
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      // Link: m[1] = label, m[2] = url.
      const label = m[1]
      const url = m[2]
      if (INTERNAL_CARD_RE.test(url)) {
        // Internal card path — passed the whitelist+UUID guard. Normalize the
        // path (add a leading "/" if the model dropped it) before building the
        // soft react-router <Link>, so "events/<id>" links exactly like
        // "/events/<id>".
        const to = url.startsWith('/') ? url : `/${url}`
        nodes.push(
          <Link key={`${keyBase}-a${i}`} to={to}>
            {label}
          </Link>,
        )
      } else if (/^https?:\/\//i.test(url)) {
        // External link — open safely in a new tab.
        nodes.push(
          <a
            key={`${keyBase}-a${i}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label}
          </a>,
        )
      } else {
        // Unknown scheme (mailto:, javascript:, relative-no-slash…) — not linked.
        nodes.push(label)
      }
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[3]}</strong>)
    } else {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[4] ?? m[5]}</em>)
    }
    last = re.lastIndex
    i += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const BULLET_RE = /^\s*[-*]\s+(.*)$/
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/

// Block pass: group consecutive list lines into <ul>/<ol>, keep other runs as
// paragraphs with <br/> between their lines.
export function Markdown({ text }) {
  const src = typeof text === 'string' ? text : String(text ?? '')
  const lines = src.replace(/\r\n/g, '\n').split('\n')

  const blocks = []
  let para = [] // buffered plain lines
  let list = null // { ordered: boolean, items: string[] }

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', lines: para })
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items })
      list = null
    }
  }

  for (const line of lines) {
    const bullet = line.match(BULLET_RE)
    const ordered = line.match(ORDERED_RE)
    if (bullet || ordered) {
      flushPara()
      const wantOrdered = Boolean(ordered)
      if (!list || list.ordered !== wantOrdered) {
        flushList()
        list = { ordered: wantOrdered, items: [] }
      }
      list.items.push((bullet ? bullet[1] : ordered[1]).trim())
    } else if (line.trim() === '') {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.type === 'list') {
          const items = block.items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `b${bi}-l${ii}`)}</li>
          ))
          return block.ordered ? (
            <ol key={bi} className="md__ol">{items}</ol>
          ) : (
            <ul key={bi} className="md__ul">{items}</ul>
          )
        }
        return (
          <p key={bi} className="md__p">
            {block.lines.map((ln, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(ln, `b${bi}-p${li}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}
