/**
 * One-off dashboard cleanup (2026-08-08): the shop was tested end-to-end
 * with real 50¢ purchases — "Test" and "Boiled Egg Salad Sando" — before
 * launch. The payments exist in Stripe forever (money actually moved),
 * but they're noise on the dashboard, so Payments and Analytics both
 * leave them out. Titles are matched trimmed and case-insensitive so a
 * stray space can't resurrect one.
 *
 * Nothing else should ever be added here: a real mistaken sale gets a
 * refund (which the dashboard shows honestly), not a hiding place.
 */
const HIDDEN_TEST_TITLES = ['test', 'boiled egg salad sando']

export const isHiddenTestTitle = (title) =>
  HIDDEN_TEST_TITLES.includes(String(title || '').trim().toLowerCase())

/** The same test as an aggregation $match fragment: keeps orders whose
 *  normalised title is NOT on the list. */
export const notHiddenTestOrder = {
  $expr: {
    $not: {
      $in: [
        { $trim: { input: { $toLower: { $ifNull: ['$title', ''] } } } },
        HIDDEN_TEST_TITLES,
      ],
    },
  },
}
