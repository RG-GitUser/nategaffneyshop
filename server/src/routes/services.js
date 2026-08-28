import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { collections, audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const servicesRouter = Router()

/**
 * Service cards on the landing page — same display shape as shop items.
 * A service with a `priceCents` opens Stripe Checkout when clicked, just
 * like a shop item; without one it links out (usually to #book, the
 * coaching calendar, or a contact address).
 */
/** Same rule as shop items: no javascript:/data: links from the dashboard. */
const safeHref = (s) => !/^[a-z][a-z0-9+.-]*:/i.test(s) || /^(https?|mailto|tel):/i.test(s)

/** Same rule as shop items: http(s) or site-relative only. */
const safeImage = (s) => !/^[a-z][a-z0-9+.-]*:/i.test(s) || /^https?:/i.test(s)

const serviceSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  /** Uploaded card image URL (from /api/media). Optional. */
  image: z
    .string()
    .max(500)
    .refine(safeImage, 'Image must be an http(s) or site-relative URL')
    .optional()
    .nullable(),
  price: z.string().max(40).optional().nullable(),
  /** What Stripe actually charges, in cents. Read from the database at
   *  checkout so the browser can never send its own amount. Null = the
   *  card is a link, not a purchase. */
  priceCents: z.number().int().min(50).max(99999999).optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  tag: z.string().max(40).optional().nullable(),
  cta: z.string().min(1).max(60).default('Get in touch'),
  href: z
    .string()
    .max(500)
    .refine(safeHref, 'Links must be http(s), mailto, tel, or site-relative')
    .default('#book'),
  accent: z.enum(['navy', 'red', 'umber', 'olive', 'amber']).default('navy'),
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

/** Public — visible services only, in display order. */
servicesRouter.get('/', async (_req, res, next) => {
  try {
    const items = await collections
      .services()
      .find({ visible: { $ne: false } })
      .sort({ order: 1 })
      .toArray()
    res.json(items.map(toClient))
  } catch (err) {
    next(err)
  }
})

/** Admin — everything, including hidden services. */
servicesRouter.get('/all', requireAdmin, async (_req, res, next) => {
  try {
    const items = await collections.services().find({}).sort({ order: 1 }).toArray()
    res.json(items.map(toClient))
  } catch (err) {
    next(err)
  }
})

servicesRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const parsed = serviceSchema.safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid service', details: parsed.error.flatten() })
    }
    const doc = { ...parsed.data, createdAt: new Date(), updatedAt: new Date() }
    const { insertedId } = await collections.services().insertOne(doc)
    await audit(req.admin.email, 'service.create', { id: insertedId, title: doc.title })
    res.status(201).json(toClient({ ...doc, _id: insertedId }))
  } catch (err) {
    next(err)
  }
})

servicesRouter.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const _id = parseId(req.params.id, res)
    if (!_id) return

    const parsed = serviceSchema.partial().safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid service', details: parsed.error.flatten() })
    }

    const result = await collections
      .services()
      .findOneAndUpdate(
        { _id },
        { $set: { ...parsed.data, updatedAt: new Date() } },
        { returnDocument: 'after' },
      )
    if (!result) return res.status(404).json({ error: 'Not found' })

    await audit(req.admin.email, 'service.update', { id: req.params.id })
    res.json(toClient(result))
  } catch (err) {
    next(err)
  }
})

servicesRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const _id = parseId(req.params.id, res)
    if (!_id) return
    const { deletedCount } = await collections.services().deleteOne({ _id })
    if (!deletedCount) return res.status(404).json({ error: 'Not found' })
    await audit(req.admin.email, 'service.delete', { id: req.params.id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
