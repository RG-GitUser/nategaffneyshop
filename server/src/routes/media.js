import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import multer from 'multer'
import { config } from '../config.js'
import { audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const mediaRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
})

/**
 * Magic-number sniff. A client-supplied mimetype or file extension is a
 * hint, not proof — this checks the actual leading bytes so a renamed
 * script can't be written into a publicly served directory.
 */
function sniffImageType(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return 'png'
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp'
  return null
}

mediaRouter.post('/', requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const ext = sniffImageType(req.file.buffer)
    if (!ext) {
      return res
        .status(400)
        .json({ error: 'That file is not a JPEG, PNG or WebP image' })
    }

    // Slot is sanitised hard because it becomes part of a filesystem path.
    const slot = String(req.body.slot || 'upload').replace(/[^a-z0-9-]/gi, '') || 'upload'
    // Random suffix rather than a predictable name: stops one upload
    // silently overwriting another, and makes URLs unguessable.
    const filename = `${slot}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`

    await mkdir(config.uploadDir, { recursive: true })
    await writeFile(join(config.uploadDir, filename), req.file.buffer)

    const url = `${config.uploadPublicUrl}/${filename}`
    await audit(req.admin.email, 'media.upload', {
      filename,
      slot,
      bytes: req.file.size,
    })

    res.status(201).json({ url, filename })
  } catch (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error:
          err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 8MB' : err.message,
      })
    }
    next(err)
  }
})
