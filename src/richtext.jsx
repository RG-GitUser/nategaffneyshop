/**
 * A tiny, safe formatter for dashboard-entered text.
 *
 * Supports exactly:
 *   **bold**              → <strong>
 *   *italic* or _italic_  → <em>
 *   lines starting "- "   → a bulleted list (accent dash markers)
 *   line breaks           → paragraph breaks
 *
 * The input is treated as plain text throughout — nothing is ever parsed
 * as HTML, so there is no injection surface. Anything that isn't one of
 * the patterns above renders as the characters typed.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g

/** Inline formatting only — returns an array of strings and elements. */
export function inline(text) {
  return String(text)
    .split(INLINE)
    .filter(Boolean)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={i}>{part.slice(1, -1)}</em>
      }
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
        return <em key={i}>{part.slice(1, -1)}</em>
      }
      return part
    })
}

/** Block-level rendering: paragraphs and "- " bullet groups. */
export default function RichText({ text }) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())

  const blocks = []
  let list = null
  for (const line of lines) {
    if (/^[-•]\s+/.test(line)) {
      ;(list ??= []).push(line.replace(/^[-•]\s+/, ''))
      continue
    }
    if (list) {
      blocks.push({ type: 'ul', items: list })
      list = null
    }
    if (line) blocks.push({ type: 'p', text: line })
  }
  if (list) blocks.push({ type: 'ul', items: list })

  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul className="rich-list" key={i}>
        {b.items.map((item, j) => (
          <li key={j}>{inline(item)}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{inline(b.text)}</p>
    ),
  )
}
