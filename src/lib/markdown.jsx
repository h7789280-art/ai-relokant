// Tiny, dependency-free Markdown renderer for chat bubbles (CLAUDE.md §9B).
// Gemini replies come back with Markdown (**bold**, bullet/numbered lists,
// blank-line paragraphs). Rendering the raw text would leak the asterisks, so we
// translate the small subset the model actually uses into React elements.
//
// Intentionally minimal — bold, italic, lists, paragraphs and line breaks. No
// links/tables/code, which the assistant doesn't produce here. Plain text is
// always rendered as-is (no HTML is ever injected), so this is XSS-safe.
import { Fragment } from 'react'

// Inline pass: **bold** and *italic* / _italic_. Splits on the markers and emits
// <strong>/<em> nodes; everything else stays literal text.
function renderInline(text, keyBase) {
  const nodes = []
  // Match **bold** first, then *italic* or _italic_.
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>)
    } else {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[2] ?? m[3]}</em>)
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
