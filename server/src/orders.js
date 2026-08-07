import { collections, audit } from './db.js'

/**
 * Records a refund against the order a Stripe charge belongs to.
 *
 * Called from two places — the admin refund button (immediately, so a
 * refunded PDF stops downloading straight away) and the charge.refunded
 * webhook (which also catches refunds issued from the Stripe dashboard).
 *
 * Both pass the Stripe charge, and every figure is taken from it rather
 * than added to what we had stored. The write is therefore absolute and
 * idempotent: running it twice for the same refund, in either order,
 * leaves the same result instead of counting a partial refund twice and
 * mistaking it for a full one.
 */
export async function markOrderRefunded(charge) {
  if (!charge?.payment_intent) return null

  const amountRefunded = charge.amount_refunded || 0
  // charge.amount is what Stripe actually captured, so a missing or zero
  // amount on our own order row can't mislabel a refund as "full".
  const fully = charge.amount > 0 && amountRefunded >= charge.amount

  const result = await collections.orders().findOneAndUpdate(
    { paymentIntent: charge.payment_intent },
    {
      $set: {
        amountRefunded,
        refunded: fully,
        ...(fully ? { status: 'refunded' } : {}),
      },
    },
    { returnDocument: 'after' },
  )

  if (result) {
    await audit('stripe', 'order.refunded', {
      paymentIntent: charge.payment_intent,
      amountRefunded,
      fully,
    })
  }
  return result
}
