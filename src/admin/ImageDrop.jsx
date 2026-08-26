import { useRef, useState } from 'react'
import { api } from './api.js'
import { safeImageSrc } from '../safeUrl.js'

/**
 * Drag-and-drop image upload. Drop a file on it or click to browse;
 * uploads through /api/media and hands the URL back via onUploaded.
 */
export default function ImageDrop({ slot, value, onUploaded, notify, hint }) {
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)

  async function upload(file) {
    if (!file || busy) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      notify('JPEG, PNG or WebP only.', 'error')
      return
    }
    setBusy(true)
    try {
      const { url } = await api.uploadImage(file, slot)
      onUploaded(url)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`adm-drop${over ? ' is-over' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Upload an image. Drop a file or press Enter to browse"
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        upload(e.dataTransfer.files?.[0])
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0])
          e.target.value = '' // same file again should re-trigger
        }}
      />
      {/* Same guard as the public site: a stored value that is not
          http(s) or site-relative (a file:/// path, a javascript: or
          data: URI) renders no thumbnail instead of a browser security
          error. */}
      {safeImageSrc(value) && (
        <img className="adm-drop__thumb" src={safeImageSrc(value)} alt="" />
      )}
      <p className="adm-drop__text">
        {busy
          ? 'Uploading…'
          : value
            ? 'Drop a new image to replace, or click to browse'
            : 'Drag an image here, or click to browse'}
      </p>
      {hint && <p className="adm-drop__hint">{hint}</p>}
    </div>
  )
}
