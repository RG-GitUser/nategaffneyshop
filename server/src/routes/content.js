import { Router } from 'express'
import { z } from 'zod'
import { collections, audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const contentRouter = Router()

const DOC_ID = 'site'

/**
 * Free-form-ish: the shape mirrors src/content.js on the frontend. Rather
 * than pin every field and break whenever the site copy changes, we accept
 * a known set of top-level keys and let the frontend merge them over its
 * bundled defaults. Anything unrecognised is dropped.
 */
const ALLOWED_KEYS = [
  'sections',
  'archived',
  'custom',
  'profile',
  'socials',
  'featuredVideo',
  'offers',
  'booking',
  'newsletter',
  'about',
  'faqs',
  'footer',
  'stickyCta',
]

const contentSchema = z
  .object(Object.fromEntries(ALLOWED_KEYS.map((k) => [k, z.any().optional()])))
  .strip()

/** Public — the live site reads this on load. No auth. */
contentRouter.get('/', async (_req, res, next) => {
  try {
    const doc = await collections.content().findOne({ _id: DOC_ID })
    res.json(doc?.data ?? {})
  } catch (err) {
    next(err)
  }
})

/** Admin — overwrite the stored content. */
contentRouter.put('/', requireAdmin, async (req, res, next) => {
  try {
    const parsed = contentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid content payload' })
    }

    await collections.content().updateOne(
      { _id: DOC_ID },
      {
        $set: {
          data: parsed.data,
          updatedAt: new Date(),
          updatedBy: req.admin.email,
        },
      },
      { upsert: true },
    )

    await audit(req.admin.email, 'content.update', {
      keys: Object.keys(parsed.data),
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
