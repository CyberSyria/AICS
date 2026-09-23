import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { evidenceApi, reportsApi } from '@/api'
import { Button, Modal, StatusBadge } from '@/pages/_shared'
import { downloadText, exportElementToPdf } from '@/utils/pdfExport'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import type { Evidence, GeneratedReport } from '@/types'

const IMG_CLASS = 'samp-report-img'
const BOX_CLASS = 'samp-img-box'

function isImageEvidence(e: Evidence) {
  const mime = (e.mime_type || '').toLowerCase()
  const name = (e.filename || '').toLowerCase()
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function ReportPreviewModal({
  report,
  onClose,
  onUpdated,
}: {
  report: GeneratedReport
  onClose: () => void
  onUpdated?: (r: GeneratedReport) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const getError = useApiError()
  const { canAny } = useAuth()
  const canEdit = canAny('admin.all', 'report.generate')
  const sheetRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState(report.content_html || '')
  const [editing, setEditing] = useState(false)
  const [loadingHtml, setLoadingHtml] = useState(!report.content_html)
  const [selectedBox, setSelectedBox] = useState<HTMLElement | null>(null)
  const [imgWidth, setImgWidth] = useState(40)
  const [insertingId, setInsertingId] = useState<string | null>(null)
  const locked = !!report.finalized_at || report.status === 'ready' || !canEdit

  const evidenceQ = useQuery({
    queryKey: ['evidence', 'report', report.project_id],
    queryFn: () =>
      evidenceApi.list({
        project_id: report.project_id,
        page_size: 100,
      }),
    enabled: editing && !locked && !!report.project_id,
  })

  const imageEvidence = (evidenceQ.data?.items || []).filter(isImageEvidence)

  useEffect(() => {
    let cancelled = false
    if (report.content_html) {
      setHtml(report.content_html)
      setLoadingHtml(false)
      return
    }
    setLoadingHtml(true)
    void reportsApi
      .getHtml(String(report.id))
      .then((text) => {
        if (!cancelled) setHtml(text)
      })
      .catch((err) => toast.error(getError(err)))
      .finally(() => {
        if (!cancelled) setLoadingHtml(false)
      })
    return () => {
      cancelled = true
    }
  }, [report.id, report.content_html, getError, toast])

  const clearSelectionStyles = useCallback(() => {
    const root = sheetRef.current
    if (!root) return
    root.querySelectorAll(`.${BOX_CLASS}`).forEach((el) => {
      ;(el as HTMLElement).style.outline = ''
      ;(el as HTMLElement).style.outlineOffset = ''
    })
  }, [])

  const ensureHandles = useCallback(() => {
    const root = sheetRef.current
    if (!root) return
    root.querySelectorAll(`.${BOX_CLASS}`).forEach((box) => {
      const el = box as HTMLElement
      if (el.querySelector('.samp-img-handle')) return
      const handle = document.createElement('span')
      handle.className = 'samp-img-handle'
      handle.style.cssText =
        'position:absolute;right:0;bottom:0;width:14px;height:14px;background:#c9a227;cursor:nwse-resize;border-radius:2px;'
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
      el.appendChild(handle)
    })
  }, [])

  const stripHandles = useCallback(() => {
    const root = sheetRef.current
    if (!root) return
    root.querySelectorAll('.samp-img-handle').forEach((h) => h.remove())
    clearSelectionStyles()
    setSelectedBox(null)
  }, [clearSelectionStyles])

  useEffect(() => {
    const node = sheetRef.current
    if (!node) return
    node.contentEditable = editing && !locked ? 'true' : 'false'
    if (editing && !locked) ensureHandles()
    else stripHandles()
  }, [editing, locked, html, loadingHtml, ensureHandles, stripHandles])

  const selectBox = useCallback(
    (box: HTMLElement | null) => {
      clearSelectionStyles()
      setSelectedBox(box)
      if (!box) return
      box.style.outline = '2px solid #c9a227'
      box.style.outlineOffset = '2px'
      const w = parseFloat(box.style.width || '40')
      setImgWidth(Number.isFinite(w) ? Math.round(w) : 40)
    },
    [clearSelectionStyles],
  )

  useEffect(() => {
    const root = sheetRef.current
    if (!root || !editing || locked) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const box = target.closest(`.${BOX_CLASS}`) as HTMLElement | null
      if (!box || !root.contains(box)) {
        if (!target.closest('.samp-img-toolbar')) selectBox(null)
        return
      }

      e.preventDefault()
      e.stopPropagation()
      selectBox(box)

      const sheetRect = root.getBoundingClientRect()
      const isHandle = target.classList.contains('samp-img-handle')
      const startX = e.clientX
      const startY = e.clientY

      if (getComputedStyle(box).position !== 'absolute') {
        const boxRect = box.getBoundingClientRect()
        box.style.position = 'absolute'
        box.style.left = `${((boxRect.left - sheetRect.left + root.scrollLeft) / sheetRect.width) * 100}%`
        box.style.top = `${boxRect.top - sheetRect.top + root.scrollTop}px`
        box.style.zIndex = '5'
      }

      const startLeft = parseFloat(box.style.left) || 0
      const startTop = parseFloat(box.style.top) || 0
      const startW = parseFloat(box.style.width) || 40

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (isHandle) {
          const next = Math.max(10, Math.min(100, startW + (dx / sheetRect.width) * 100))
          box.style.width = `${next}%`
          setImgWidth(Math.round(next))
          return
        }
        box.style.left = `${Math.max(0, Math.min(85, startLeft + (dx / sheetRect.width) * 100))}%`
        box.style.top = `${Math.max(0, startTop + dy)}px`
      }

      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    root.addEventListener('pointerdown', onPointerDown)
    return () => root.removeEventListener('pointerdown', onPointerDown)
  }, [editing, locked, selectBox])

  const applyWidth = (pct: number) => {
    const clamped = Math.max(10, Math.min(100, Math.round(pct)))
    setImgWidth(clamped)
    if (selectedBox) selectedBox.style.width = `${clamped}%`
  }

  const insertEvidence = async (ev: Evidence) => {
    const root = sheetRef.current
    if (!root) return
    setInsertingId(String(ev.id))
    try {
      const blob = await evidenceApi.downloadBlob(String(ev.id))
      const dataUrl = await blobToDataUrl(blob)
      const box = document.createElement('span')
      box.className = BOX_CLASS
      box.contentEditable = 'false'
      box.style.cssText =
        'display:inline-block;position:relative;width:40%;max-width:100%;margin:8px 0;vertical-align:top;cursor:move;'
      const img = document.createElement('img')
      img.className = IMG_CLASS
      img.src = dataUrl
      img.alt = ev.filename || 'evidence'
      img.dataset.evidenceId = String(ev.id)
      img.style.cssText = 'width:100%;height:auto;display:block;pointer-events:none;'
      const handle = document.createElement('span')
      handle.className = 'samp-img-handle'
      handle.style.cssText =
        'position:absolute;right:0;bottom:0;width:14px;height:14px;background:#c9a227;cursor:nwse-resize;border-radius:2px;'
      box.appendChild(img)
      box.appendChild(handle)

      root.focus()
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(box)
        range.setStartAfter(box)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      } else {
        root.appendChild(box)
      }
      selectBox(box)
      toast.success(t('reports.evidenceInsert'))
    } catch (err) {
      toast.error(getError(err))
    } finally {
      setInsertingId(null)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      stripHandles()
      const content = sheetRef.current?.innerHTML || html
      return reportsApi.update(String(report.id), { content_html: content })
    },
    onSuccess: (r) => {
      setHtml(r.content_html || sheetRef.current?.innerHTML || html)
      setEditing(false)
      onUpdated?.(r)
      toast.success(t('toast.saved'))
    },
    onError: (err) => {
      if (editing) ensureHandles()
      toast.error(getError(err))
    },
  })

  const finalize = useMutation({
    mutationFn: async () => {
      if (editing && sheetRef.current) {
        stripHandles()
        await reportsApi.update(String(report.id), { content_html: sheetRef.current.innerHTML })
      }
      return reportsApi.finalize(String(report.id))
    },
    onSuccess: (r) => {
      onUpdated?.(r)
      toast.success(t('reports.finalized'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const exportPdf = async () => {
    const el = sheetRef.current
    if (!el) return
    try {
      const wasEditing = editing
      stripHandles()
      setEditing(false)
      await new Promise((r) => setTimeout(r, 50))
      const name = (report.title || `report-${report.id}`).replace(/[^\w\u0600-\u06FF\- ]+/g, '_')
      await exportElementToPdf(el, name)
      if (wasEditing) setEditing(true)
      toast.success(t('reports.pdfExported'))
    } catch (err) {
      toast.error(getError(err))
    }
  }

  const downloadHtml = () => {
    stripHandles()
    const content = sheetRef.current?.innerHTML || html
    downloadText(content, `report-${report.id}.html`)
    if (editing) ensureHandles()
  }

  const downloadServerPdf = async () => {
    try {
      const blob = await reportsApi.downloadPdf(String(report.id))
      if (blob.type.includes('html')) {
        toast.warning(t('reports.pdfFallback'))
        downloadText(await blob.text(), `report-${report.id}.html`)
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${report.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(getError(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={report.title || t('reports.preview')}
      className="!max-w-6xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusBadge status={report.status} />
          {!locked && canEdit && (
            <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
              {editing ? t('reports.stopEdit') : t('reports.editContent')}
            </Button>
          )}
          {!locked && canEdit && (
            <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
              {t('common.save')}
            </Button>
          )}
          <Button variant="secondary" onClick={downloadHtml}>
            {t('reports.downloadHtml')}
          </Button>
          <Button variant="secondary" onClick={() => void downloadServerPdf()}>
            {t('reports.downloadPdf')}
          </Button>
          <Button onClick={() => void exportPdf()}>{t('reports.exportPdf')}</Button>
          {!locked && canEdit && (
            <Button loading={finalize.isPending} onClick={() => finalize.mutate()}>
              {t('reports.finalize')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className="mb-3 rounded border border-line/60 bg-panel px-3 py-2 text-xs text-muted">
        {editing && !locked ? t('reports.editHint') : t('reports.previewHint')}
      </div>

      <div className={`gap-3 ${editing && !locked ? 'grid md:grid-cols-[220px_1fr]' : ''}`}>
        {editing && !locked && (
          <aside className="samp-img-toolbar max-h-[65vh] space-y-2 overflow-auto rounded border border-line bg-panel p-2">
            <h4 className="text-xs font-semibold text-text">{t('reports.evidencePanel')}</h4>
            {selectedBox && (
              <div className="rounded border border-gold/40 bg-panel-2 px-2 py-2 text-[11px]">
                <p className="mb-1 text-muted">{t('reports.evidenceSelected')}</p>
                <label className="flex items-center gap-2">
                  <span>{t('reports.evidenceResize')}</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={imgWidth}
                    onChange={(e) => applyWidth(Number(e.target.value))}
                    className="flex-1 accent-[var(--color-gold)]"
                  />
                  <span className="w-8 text-end">{imgWidth}%</span>
                </label>
              </div>
            )}
            {evidenceQ.isLoading && <p className="text-xs text-muted">{t('common.loading')}</p>}
            {!evidenceQ.isLoading && imageEvidence.length === 0 && (
              <p className="text-xs text-muted">{t('reports.evidenceEmpty')}</p>
            )}
            <ul className="space-y-2">
              {imageEvidence.map((ev) => (
                <li key={ev.id} className="rounded border border-line/60 p-1.5">
                  <p className="mb-1 truncate text-[10px] text-muted" title={ev.filename}>
                    {ev.filename}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full !text-[11px]"
                    loading={insertingId === String(ev.id)}
                    onClick={() => void insertEvidence(ev)}
                  >
                    {t('reports.evidenceInsert')}
                  </Button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="max-h-[65vh] overflow-auto rounded border border-line bg-white p-2">
          {loadingHtml ? (
            <p className="p-6 text-sm text-muted">{t('common.loading')}</p>
          ) : (
            <div
              ref={sheetRef}
              id="samp-report-sheet"
              className="samp-report-sheet relative mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white text-black shadow-sm"
              style={{ padding: '12mm', direction: report.language === 'ar' ? 'rtl' : 'ltr' }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}
