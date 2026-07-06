// Small inline-SVG country flags for the currency card (§ task, cosmetic only).
//
// Why SVG and not emoji: emoji flags (🇺🇸) are regional-indicator pairs that
// Windows deliberately does NOT render as flags — it shows the plain letters
// ("US"). Since the owner/dev runs Windows 11 and much of the launch audience
// does too, emoji would look broken exactly where it matters. These 20×14 SVGs
// carry no images, no font dependency, and render identically on every platform.
//
// Covers the curated currency set in lib/currency.js (USD, EUR, RUB, GBP, UAH,
// PLN, CZK, SEK, NOK, DKK). EUR uses the EU flag. Shapes are intentionally
// simplified to read cleanly at ~20px; they are recognisable, not heraldic.

// 12-star ring for the EU flag, precomputed once (i·30° from the top).
const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180
  return { x: 10 + 4.3 * Math.sin(a), y: 7 - 4.3 * Math.cos(a) }
})

// Nordic cross bars, shared by DK / SE / NO. Offset toward the hoist: all bars
// share one centre (x 7.25, y 7) so a thinner inner cross sits inside a thicker
// one (Norway). `w` is the bar thickness.
function cross(color, w = 2.5) {
  return (
    <>
      <rect x={7.25 - w / 2} y="0" width={w} height="14" fill={color} />
      <rect x="0" y={7 - w / 2} width="20" height={w} fill={color} />
    </>
  )
}

// Per-currency flag artwork. Each entry draws inside the rounded-clipped 20×14
// frame provided by <Flag>; a white background is painted first by the frame.
const FLAGS = {
  USD: (
    <>
      <rect width="20" height="14" fill="#B22234" />
      {[2, 4, 6, 8, 10, 12].map((y) => (
        <rect key={y} x="0" y={y} width="20" height="1" fill="#fff" />
      ))}
      <rect width="9" height="7" fill="#3C3B6E" />
      {[1, 3, 5, 7].flatMap((x) =>
        [1.4, 3.5, 5.6].map((y) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.4" fill="#fff" />
        )),
      )}
    </>
  ),
  EUR: (
    <>
      <rect width="20" height="14" fill="#003399" />
      {EU_STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r="0.75" fill="#FFCC00" />
      ))}
    </>
  ),
  RUB: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <rect y="4.67" width="20" height="4.67" fill="#0039A6" />
      <rect y="9.33" width="20" height="4.67" fill="#D52B1E" />
    </>
  ),
  GBP: (
    <>
      <rect width="20" height="14" fill="#012169" />
      <path d="M0,0 L20,14 M20,0 L0,14" stroke="#fff" strokeWidth="3" />
      <path d="M0,0 L20,14 M20,0 L0,14" stroke="#C8102E" strokeWidth="1.2" />
      <path d="M10,0 V14 M0,7 H20" stroke="#fff" strokeWidth="4" />
      <path d="M10,0 V14 M0,7 H20" stroke="#C8102E" strokeWidth="2" />
    </>
  ),
  UAH: (
    <>
      <rect width="20" height="7" fill="#0057B7" />
      <rect y="7" width="20" height="7" fill="#FFD500" />
    </>
  ),
  PLN: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <rect y="7" width="20" height="7" fill="#DC143C" />
    </>
  ),
  CZK: (
    <>
      <rect width="20" height="7" fill="#fff" />
      <rect y="7" width="20" height="7" fill="#D7141A" />
      <path d="M0,0 L9,7 L0,14 Z" fill="#11457E" />
    </>
  ),
  SEK: (
    <>
      <rect width="20" height="14" fill="#006AA7" />
      {cross('#FECC00')}
    </>
  ),
  DKK: (
    <>
      <rect width="20" height="14" fill="#C8102E" />
      {cross('#fff')}
    </>
  ),
  NOK: (
    <>
      <rect width="20" height="14" fill="#EF2B2D" />
      {cross('#fff', 3.5)}
      {cross('#002868', 1.6)}
    </>
  ),
}

/**
 * Inline-SVG flag for a currency code. Decorative (aria-hidden) — the code text
 * next to it carries the meaning. Renders nothing for an unknown code.
 */
export default function Flag({ code, className = 'flag' }) {
  const art = FLAGS[code]
  if (!art) return null
  const clipId = `flag-clip-${code}`
  return (
    <svg
      viewBox="0 0 20 14"
      width="20"
      height="14"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="20" height="14" rx="2.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="20" height="14" fill="#fff" />
        {art}
      </g>
      <rect
        x="0.5"
        y="0.5"
        width="19"
        height="13"
        rx="2"
        fill="none"
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1"
      />
    </svg>
  )
}
