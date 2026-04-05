async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  return window.pdfjsLib
}

export async function extractTextFromPDF(file) {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ').trim()
    if (pageText) fullText += `\n--- Page ${i} ---\n${pageText}`
  }
  return fullText.trim()
}

export async function isScannedPDF(file) {
  const text = await extractTextFromPDF(file)
  const approxPages = Math.max(1, file.size / 50000)
  return text.length / approxPages < 100
}

// Render pages as small grayscale-ish images — max 800px wide, 50% JPEG quality
// Keeps each page image under ~80KB so 2 pages per batch stays well under 200KB
export async function extractImagesFromPDF(file, onProgress) {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images = []
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress && onProgress(i, pdf.numPages)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    // Max 800px wide — good enough for AI to read text, keeps file small
    const scale = Math.min(800 / viewport.width, 1.2)
    const scaled = page.getViewport({ scale })
    canvas.width = Math.round(scaled.width)
    canvas.height = Math.round(scaled.height)
    // White background first
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: scaled }).promise
    // 50% JPEG quality — text is still perfectly readable, file is tiny
    const b64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1]
    // Log size for debugging
    const kb = Math.round(b64.length * 0.75 / 1024)
    console.log(`Page ${i}: ${kb}KB`)
    images.push({ pageNum: i, b64, totalPages: pdf.numPages })
  }
  canvas.remove()
  return images
}
