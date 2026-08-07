import { useRef, useState } from 'react'
import { api } from './api.js'

/**
 * Drag-and-drop (or click) PDF upload, same pattern as ImageDrop. The
 * server stores the file outside the public uploads directory; what comes
 * back is a private filename, not a URL.
 */
export default function PdfDrop({ value, onUploaded, notify, hint }) {
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)

  async function upload(file) {
    if (!file || busy) return
    if (file.type !== 'application/pdf') {
      notify('PDF files only.', 'error')
      return
    }
    setBusy(true)
    try {
      const { filename, name } = await api.uploadPdf(file)
      onUploaded(filename, name)
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
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
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
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <p>
        {busy
          ? 'Uploading…'
          : value
            ? `Uploaded: ${value} — drop a new PDF to replace it.`
            : 'Drag a PDF here, or click to choose one.'}
      </p>
      {hint && <p className="adm-muted">{hint}</p>}
    </div>
  )
}
