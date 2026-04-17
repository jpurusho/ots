import { getBackendUrl } from '@/lib/backend'

interface PdfRequest {
  title: string
  subtitle: string
  headers: string[]
  rows: string[][]
  footer_row?: string[]
  filename: string
  upload_to_drive?: boolean
  accent_color?: string
}

interface PdfResponse {
  success: boolean
  pdf_base64: string
  filename: string
  drive?: { file_id: string; name: string; link: string }
  drive_error?: string
}

/**
 * Generate PDF via backend and download it.
 * Optionally uploads to Drive at the same time.
 */
export async function generateAndDownloadPdf(req: PdfRequest): Promise<PdfResponse> {
  const resp = await fetch((await getBackendUrl()) + '/api/pdf/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  const data = await resp.json() as PdfResponse
  if (!data.success) throw new Error((data as any).detail || 'PDF generation failed')

  // Trigger browser download
  const blob = new Blob([Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = data.filename
  a.click()
  URL.revokeObjectURL(url)

  return data
}

/**
 * Generate PDF and upload to Drive only (no download).
 */
export async function generateAndUploadPdf(req: PdfRequest): Promise<PdfResponse> {
  const resp = await fetch((await getBackendUrl()) + '/api/pdf/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, upload_to_drive: true }),
  })
  const data = await resp.json() as PdfResponse
  if (!data.success) throw new Error((data as any).detail || 'PDF generation failed')
  return data
}
