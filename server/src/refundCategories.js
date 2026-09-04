/**
 * The reasons a refund can be asked for.
 *
 * A fixed list rather than free text, because that is the whole point of
 * having a form at all: a mailbox full of prose cannot be grouped or
 * counted, and "their reason category" is exactly what the dashboard is
 * meant to show at a glance.
 *
 * `id` is what gets stored and must never change — the label is display
 * only, so the wording can be rewritten later without orphaning every
 * request already on record.
 *
 * Mirrored in src/refundCategories.js for the browser. THIS file is the
 * authority: the server validates against it and rejects anything else,
 * so a stale copy in the frontend fails loudly rather than quietly
 * writing a category nothing can read back.
 */
export const REFUND_CATEGORIES = [
  { id: 'duplicate', label: 'Charged twice' },
  { id: 'not-as-described', label: 'Not what I expected' },
  { id: 'never-arrived', label: 'Never received it' },
  { id: 'technical', label: 'A file or link didn’t work' },
  { id: 'cant-attend', label: 'Can’t make the session' },
  { id: 'other', label: 'Something else' },
]

export const REFUND_CATEGORY_IDS = REFUND_CATEGORIES.map((c) => c.id)

export const refundCategoryLabel = (id) =>
  REFUND_CATEGORIES.find((c) => c.id === id)?.label ?? 'Something else'
