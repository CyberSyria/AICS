import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/** Export an HTML element (A4 report sheet) to a multi-page PDF. */
export async function exportElementToPdf(el: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: el.scrollWidth,
  })

  const imgWidthMm = 210
  const pageHeightMm = 297
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageCanvasHeight = (canvas.width * pageHeightMm) / imgWidthMm

  let rendered = 0
  let page = 0
  while (rendered < canvas.height) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - rendered)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    const ctx = pageCanvas.getContext('2d')
    if (!ctx) break
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, rendered, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
    const imgData = pageCanvas.toDataURL('image/jpeg', 0.95)
    const sliceMm = (sliceHeight * imgWidthMm) / canvas.width
    if (page > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidthMm, sliceMm)
    rendered += sliceHeight
    page += 1
    if (page > 40) break
  }

  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadText(text: string, fileName: string, mime = 'text/html;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), fileName)
}
