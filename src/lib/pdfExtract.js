// PDF text + image extraction for both text-based and scanned PDFs

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

// Try to extract text — returns empty string if scanned
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

// Render PDF pages as compressed JPEG base64 images
// Returns array of { pageNum, b64, width, height }
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
    // Scale to max 1200px wide for good OCR without huge file size
    const viewport = page.getViewport({ scale: 1 })
    const scale = Math.min(1200 / viewport.width, 1.5)
    const scaled = page.getViewport({ scale })
    canvas.width = scaled.width
    canvas.height = scaled.height
    await page.render({ canvasContext: ctx, viewport: scaled }).promise
    // JPEG at 0.7 quality — good balance of readability vs size
    const b64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
    images.push({ pageNum: i, b64, totalPages: pdf.numPages })
  }
  canvas.remove()
  return images
}

// Detect if PDF is scanned (very little extractable text)
export async function isScannedPDF(file) {
  const text = await extractTextFromPDF(file)
  // Less than 100 chars per page on average = likely scanned
  const approxPages = Math.max(1, file.size / 50000)
  return text.length / approxPages < 100
}
