import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { collections, audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const shopRouter = Router()

const itemSchema = z.object({
  kind: z.enum(['product', 'link']).default('product'),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  price: z.string().max(40).optional().nullable(),
  oldPrice: z.string().max(40).optional().nullable(),
  /**
   * What Stripe actually charges, in cents. The `price` string above is
   * display only — this is the number the checkout uses, and it is read
   * from the database rather than the request so a customer can't send
   * their own amount. Leave null and the card links out instead.
   */
  priceCents: z.number().int().min(50).max(99999999).optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  cta: z.string().min(1).max(60).default('Get it'),
  href: z.string().max(500).default('#'),
  accent: z.enum(['navy', 'umber', 'olive', 'amber']).default('navy'),
  tag: z.string().max(40).optional().nullable(),
  rating: z.string().max(10).optional().nullable(),
  order: z.number().int().default(0),
  visible: z.boolean().default(true),
})

const toClient = (doc) => ({ ...doc, id: doc._id.toString(), _id: undefined })

function parseId(id, res) {
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return null
  }
  return new ObjectId(id)
}

/** Public — visible items only, in display order. */
shopRouter.get('/', async (_req, res, next) => {
  try {
    const items = await collections
      .shopItems()
      .find({ visible: { $ne: false } })
      .sort({ order: 1 })
      .toArray()
    res.json(items.map(toClient))
  } catch (err) {
    next(err)
  }
})

/** Admin — everything, including hidden items. */
shopRouter.get('/all', requireAdmin, async (_req, res, next) => {
  try {
    const items = await collections.shopItems().find({}).sort({ order: 1 }).toArray()
    res.json(items.map(toClient))
  } catch (err) {
    next(err)
  }
})

shopRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const parsed = itemSchema.safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid item', details: parsed.error.flatten() })
    }
    const doc = { ...parsed.data, createdAt: new Date(), updatedAt: new Date() }
    const { insertedId } = await collections.shopItems().insertOne(doc)
    await audit(req.admin.email, 'shop.create', { id: insertedId, title: doc.title })
    res.status(201).json(toClient({ ...doc, _id: insertedId }))
  } catch (err) {
    next(err)
  }
})

shopRouter.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const _id = parseId(req.params.id, res)
    if (!_id) return

    const parsed = itemSchema.partial().safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid item', details: parsed.error.flatten() })
    }

    const result = await collections
      .shopItems()
      .findOneAndUpdate(
        { _id },
        { $set: { ...parsed.data, updatedAt: new Date() } },
        { returnDocument: 'after' },
      )
    if (!result) return res.status(404).json({ error: 'Not found' })

    await audit(req.admin.email, 'shop.update', { id: req.params.id })
    res.json(toClient(result))
  } catch (err) {
    next(err)
  }
})

shopRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const _id = parseId(req.params.id, res)
    if (!_id) return
    const { deletedCount } = await collections.shopItems().deleteOne({ _id })
    if (!deletedCount) return res.status(404).json({ error: 'Not found' })
    await audit(req.admin.email, 'shop.delete', { id: req.params.id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
