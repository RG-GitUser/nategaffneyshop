/**
 * Renders page 1 of a PDF to a JPEG blob, in the browser — used to make
 * a product's cover image straight from the uploaded book, so the card
 * and the checkout popup show the real first page.
 *
 * pdf.js is heavy, so it loads on demand and only ever in the admin.
 */
export async function pdfCoverBlob(arrayBuffer, targetWidth = 900) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: targetWidth / base.width })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    // White ground: PDF pages are transparent where nothing is drawn.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport }).promise

    // toDataURL rather than toBlob: synchronous, so it cannot stall in
    // throttled/background tabs the way toBlob's callback can.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.87)
    const bytes = atob(dataUrl.split(',')[1])
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: 'image/jpeg' })
  } finally {
    doc.destroy()
  }
}
