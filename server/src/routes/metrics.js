import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { collections } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const metricsRouter = Router()

/**
 * First-party, cookie-less traffic counting.
 *
 * The beacon carries a path and whether this is a new browser session —
 * nothing else. No cookies, no IP stored, no device identifiers, no
 * third party. That keeps the privacy policy's "no tracking" promise
 * true while still answering "how much action is the site getting":
 * views per day per path, and sessions as the unique-ish visitor count.
 */

const beaconLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

const day = () => new Date().toISOString().slice(0, 10)

metricsRouter.post('/view', beaconLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({ path: z.string().min(1).max(200), visit: z.boolean().optional() })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Bad beacon' })

    let path = parsed.data.path.split('?')[0].split('#')[0].slice(0, 100)
    if (!path.startsWith('/')) path = '/'
    // Don't count ourselves working in the dashboard.
    if (path.startsWith('/admin')) return res.json({ ok: true })

    await collections.pageViews().updateOne(
      { day: day(), path },
      { $inc: { views: 1, ...(parsed.data.visit ? { visits: 1 } : {}) } },
      { upsert: true },
    )
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** Everything the Analytics tab shows, in one round trip. */
metricsRouter.get('/summary', requireAdmin, async (req, res, next) => {
  try {
    const daysBack = Math.min(Math.max(Number(req.query.days) || 30, 1), 90)
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    const sinceDay = since.toISOString().slice(0, 10)

    const dayOf = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }

    const [byDay, byPath, orders, recentOrders, chat, bookings, ordersByDay, msgsByDay, membersByDay] = await Promise.all([
      collections
        .pageViews()
        .aggregate([
          { $match: { day: { $gte: sinceDay } } },
          {
            $group: {
              _id: '$day',
              views: { $sum: '$views' },
              visits: { $sum: { $ifNull: ['$visits', 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      collections
        .pageViews()
        .aggregate([
          { $match: { day: { $gte: sinceDay } } },
          { $group: { _id: '$path', views: { $sum: '$views' } } },
          { $sort: { views: -1 } },
          { $limit: 10 },
        ])
        .toArray(),
      collections
        .orders()
        .aggregate([
          { $match: { createdAt: { $gte: since }, status: 'paid' } },
          {
            $group: {
              _id: { title: '$title', currency: '$currency' },
              count: { $sum: 1 },
              // Net of refunds: a fully refunded order leaves 'paid'
              // entirely, and a partial refund shouldn't be counted as
              // money Nate kept.
              amount: { $sum: { $subtract: ['$amount', { $ifNull: ['$amountRefunded', 0] }] } },
            },
          },
          { $sort: { amount: -1 } },
        ])
        .toArray(),
      collections
        .orders()
        .find({}, { projection: { sessionId: 0, paymentIntent: 0 } })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      Promise.all([
        collections.chatMembers().countDocuments(),
        collections.chatSessions().countDocuments(),
        collections.chatMessages().countDocuments({ deleted: { $ne: true } }),
        // Both scoped to the selected window, so every stat on the
        // Analytics tab answers for the same date range.
        collections
          .chatMessages()
          .countDocuments({ createdAt: { $gte: since }, deleted: { $ne: true } }),
        collections.chatMembers().countDocuments({ joinedAt: { $gte: since } }),
      ]),
      collections
        .bookings()
        .aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ])
        .toArray(),
      // Per-day series for the chart's metric filter. UTC day strings, the
      // same convention the beacon uses for pageViews.
      collections
        .orders()
        .aggregate([
          { $match: { createdAt: { $gte: since }, status: 'paid' } },
          {
            $group: {
              _id: dayOf,
              orders: { $sum: 1 },
              revenue: { $sum: { $subtract: ['$amount', { $ifNull: ['$amountRefunded', 0] }] } },
            },
          },
        ])
        .toArray(),
      collections
        .chatMessages()
        .aggregate([
          { $match: { createdAt: { $gte: since }, deleted: { $ne: true } } },
          { $group: { _id: dayOf, n: { $sum: 1 } } },
        ])
        .toArray(),
      collections
        .chatMembers()
        .aggregate([
          { $match: { joinedAt: { $gte: since } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$joinedAt' } },
              n: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ])

    // One merged row per day, zero where a metric had nothing.
    const activityMap = new Map()
    const rowFor = (day) => {
      if (!activityMap.has(day)) {
        activityMap.set(day, {
          day,
          views: 0,
          visits: 0,
          revenue: 0,
          orders: 0,
          messages: 0,
          newMembers: 0,
        })
      }
      return activityMap.get(day)
    }
    byDay.forEach((d) => Object.assign(rowFor(d._id), { views: d.views, visits: d.visits }))
    ordersByDay.forEach((d) =>
      Object.assign(rowFor(d._id), { orders: d.orders, revenue: d.revenue }),
    )
    msgsByDay.forEach((d) => Object.assign(rowFor(d._id), { messages: d.n }))
    membersByDay.forEach((d) => Object.assign(rowFor(d._id), { newMembers: d.n }))
    const activity = [...activityMap.values()].sort((a, b) => a.day.localeCompare(b.day))

    res.json({
      windowDays: daysBack,
      activity,
      traffic: {
        totalViews: byDay.reduce((s, d) => s + d.views, 0),
        totalVisits: byDay.reduce((s, d) => s + d.visits, 0),
        byDay: byDay.map((d) => ({ day: d._id, views: d.views, visits: d.visits })),
        topPages: byPath.map((p) => ({ path: p._id, views: p.views })),
      },
      sales: {
        // Only exists once the Stripe webhook is configured — the orders
        // collection is what the webhook fills.
        totalOrders: orders.reduce((s, o) => s + o.count, 0),
        totalAmount: orders.reduce((s, o) => s + o.amount, 0),
        currency: orders[0]?._id.currency || 'cad',
        byItem: orders.map((o) => ({
          title: o._id.title || '(untitled)',
          count: o.count,
          amount: o.amount,
          currency: o._id.currency,
        })),
        recent: recentOrders.map((o) => ({
          id: o._id.toString(),
          title: o.title,
          name: o.name,
          email: o.email,
          amount: o.amount,
          currency: o.currency,
          createdAt: o.createdAt,
        })),
      },
      chat: {
        members: chat[0],
        activeSessions: chat[1],
        messagesTotal: chat[2],
        messagesWindow: chat[3],
        newMembers: chat[4],
      },
      bookings: Object.fromEntries(bookings.map((b) => [b._id, b.n])),
    })
  } catch (err) {
    next(err)
  }
})
