import { Router } from 'express'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'
import { audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const mediaRouter = Router()

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
})

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Checked again below against the real bytes — a client-supplied
    // mimetype is a hint, not proof.
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG and WebP images are allowed'))
    }
    cb(null, true)
  },
})

/** Magic-number sniff, so a renamed .exe can't be stored as an image. */
function sniffImageType(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) return 'image/png'
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp'
  return null
}

mediaRouter.post('/', requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const realType = sniffImageType(req.file.buffer)
    if (!realType) {
      return res.status(400).json({ error: 'That file is not a JPEG, PNG or WebP image' })
    }

    const ext = realType === 'image/jpeg' ? 'jpg' : realType.split('/')[1]
    const slot = (req.body.slot || 'upload').replace(/[^a-z0-9-]/gi, '')
    // Cache-busting name, so a replaced image shows up immediately.
    const path = `${slot}-${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from(config.supabaseBucket)
      .upload(path, req.file.buffer, { contentType: realType, upsert: true })

    if (error) return res.status(502).json({ error: `Upload failed: ${error.message}` })

    const { data } = supabase.storage.from(config.supabaseBucket).getPublicUrl(path)

    await audit(req.admin.email, 'media.upload', { path, slot, bytes: req.file.size })
    res.status(201).json({ url: data.publicUrl, path })
  } catch (err) {
    if (err instanceof multer.MulterError || err.message?.includes('allowed')) {
      return res.status(400).json({ error: err.message })
    }
    next(err)
  }
})
