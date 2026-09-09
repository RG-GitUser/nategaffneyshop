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
  { id: 'never-arrived', label: 'Never received it' },
  { id: 'technical', label: 'A file or link didn’t work' },
  { id: 'cant-attend', label: 'Can’t make the session' },
  { id: 'other', label: 'Something else' },
]

/**
 * Retired: no longer offered on the form, but still stored on requests
 * that were made while it was.
 *
 * Kept because an id that is stored must stay readable — dropping the
 * row outright would not delete those requests, it would silently
 * relabel them "Something else" in the dashboard, the tally and the
 * emails, turning a reason somebody actually gave into an absence of
 * one. Retired ids are excluded from REFUND_CATEGORY_IDS below, so the
 * form can no longer submit them.
 */
export const RETIRED_REFUND_CATEGORIES = [
  { id: 'not-as-described', label: 'Not what I expected' },
]

/** What a new request may be submitted with — selectable only. */
export const REFUND_CATEGORY_IDS = REFUND_CATEGORIES.map((c) => c.id)

/** Display, so it has to resolve the retired ones too. */
export const refundCategoryLabel = (id) =>
  [...REFUND_CATEGORIES, ...RETIRED_REFUND_CATEGORIES].find((c) => c.id === id)?.label ??
  'Something else'
