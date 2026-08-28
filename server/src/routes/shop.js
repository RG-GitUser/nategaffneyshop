import { Router } from 'express'
import { join, basename } from 'node:path'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { config } from '../config.js'
import { collections, audit } from '../db.js'
import { requireAdmin, verifyDownloadToken } from '../middleware/auth.js'

export const shopRouter = Router()

/**
 * Mirrors src/safeUrl.js on the frontend: link fields are free text in
 * the dashboard, and a stored javascript: URL would run in every
 * visitor's browser. Allowed: http(s), mailto, tel, or site-relative.
 */
const safeHref = (s) => !/^[a-z][a-z0-9+.-]*:/i.test(s) || /^(https?|mailto|tel):/i.test(s)
const safeImage = (s) => !/^[a-z][a-z0-9+.-]*:/i.test(s) || /^https?:/i.test(s)

const itemSchema = z.object({
  /** 'pdf' sells a paywalled download: pay through checkout like a
   *  product, then the webhook emails a time-limited download link. */
  kind: z.enum(['product', 'link', 'pdf']).default('product'),
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
  href: z
    .string()
    .max(500)
    .refine(safeHref, 'Links must be http(s), mailto, tel, or site-relative')
    .default('#'),
  accent: z.enum(['navy', 'red', 'umber', 'olive', 'amber']).default('navy'),
  tag: z.string().max(40).optional().nullable(),
  rating: z.string().max(10).optional().nullable(),
  /** Uploaded card image URL (from /api/media). Optional. */
  image: z
    .string()
    .max(500)
    .refine(safeImage, 'Image must be an http(s) or site-relative URL')
    .optional()
    .nullable(),
  order: z.number().int().default(0),
  visible: z.boolean().default(true),
  /** Filename in config.pdfDir (from /api/media/pdf) — never a public URL. */
  pdfFile: z.string().max(300).optional().nullable(),
  /** The original filename, shown in the dashboard only. */
  pdfName: z.string().max(200).optional().nullable(),
})

const toClient = (doc) => ({ ...doc, id: doc._id.toString(), _id: undefined })

function parseId(id, res) {
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return null
  }
  return new ObjectId(id)
}

/** Public — visible items only, in display order. The stored PDF filename
 *  stays server-side; the public card only needs to know the kind. */
shopRouter.get('/', async (_req, res, next) => {
  try {
    const items = await collections
      .shopItems()
      .find({ visible: { $ne: false } })
      .sort({ order: 1 })
      .toArray()
    res.json(
      items.map((doc) => {
        const item = toClient(doc)
        delete item.pdfFile
        delete item.pdfName
        return item
      }),
    )
  } catch (err) {
    next(err)
  }
})

/**
 * Paywalled PDF download. The token is a short-lived JWT minted by the
 * Stripe webhook after payment and emailed to the buyer — possession of
 * a valid token IS the proof of purchase, and the order it points at is
 * re-checked on every request, so a refunded order stops downloading
 * even though the token itself is still unexpired.
 *
 * The token is signed with a key derived from JWT_SECRET rather than the
 * secret itself (see middleware/auth.js): a customer's link must never
 * be usable as an admin session.
 */
shopRouter.get('/download', async (req, res) => {
  const denied = () =>
    res.status(403).json({
      error:
        'This download link is invalid or has expired. Reply to your purchase email and we will send a fresh one.',
    })

  try {
    const sessionId = verifyDownloadToken(req.query.token)
    if (!sessionId) return denied()

    const order = await collections.orders().findOne({ sessionId })
    if (!order || order.status !== 'paid' || order.refunded) return denied()
    if (!order.itemId || !ObjectId.isValid(order.itemId)) return denied()

    const item = await collections
      .shopItems()
      .findOne({ _id: new ObjectId(order.itemId) })
    if (!item || item.kind !== 'pdf' || !item.pdfFile) return denied()

    // basename() so a stored value can never walk out of pdfDir.
    const file = join(config.pdfDir, basename(item.pdfFile))
    const niceName = `${(item.title || 'download').replace(/[^\w\- ]+/g, '').trim() || 'download'}.pdf`
    res.download(file, niceName, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'The file is missing. Reply to your purchase email.' })
      }
    })
  } catch {
    return denied()
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
