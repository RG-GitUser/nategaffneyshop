/**
 * The reasons a refund can be asked for — the browser's copy.
 *
 * server/src/refundCategories.js is the authority: it validates every
 * submission against its own list, so an id invented here is rejected
 * rather than quietly stored. Keep the ids identical; the labels are the
 * customer-facing wording and only have to read well.
 *
 * `color` is a fixed slot from the admin's categorical palette, assigned
 * here rather than by array position so a category keeps its colour when
 * the list is reordered or one is retired. "Something else" takes the
 * neutral, because it is the absence of a reason rather than one more of
 * them — and it should never be the loudest band on the bar.
 */
export const REFUND_CATEGORIES = [
  { id: 'duplicate', label: 'Charged twice', color: 'var(--viz-1)' },
  { id: 'not-as-described', label: 'Not what I expected', color: 'var(--viz-2)' },
  { id: 'never-arrived', label: 'Never received it', color: 'var(--viz-3)' },
  { id: 'technical', label: 'A file or link didn’t work', color: 'var(--viz-4)' },
  { id: 'cant-attend', label: 'Can’t make the session', color: 'var(--viz-5)' },
  { id: 'other', label: 'Something else', color: 'var(--viz-other)' },
]

/**
 * The extra line under each option on the public form. Not on the admin
 * side, which wants the list scannable rather than explained — but on the
 * form these decide whether someone picks the category that matches what
 * actually happened, and the whole feature is worth nothing if they don't.
 */
export const REFUND_CATEGORY_HINTS = {
  duplicate: 'The same thing was charged more than once.',
  'not-as-described': 'It wasn’t what the page led you to expect.',
  'never-arrived': 'You paid and nothing came through.',
  technical: 'It arrived, but wouldn’t open, download or play.',
  'cant-attend': 'Something came up and the time no longer works.',
  other: 'Tell us below. Anything at all.',
}

export const refundCategory = (id) =>
  REFUND_CATEGORIES.find((c) => c.id === id) ?? {
    id: 'other',
    label: 'Something else',
    color: 'var(--viz-other)',
  }
