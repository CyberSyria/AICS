import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'
import { evidenceApi } from '@/api'
import { Button, Modal } from '@/pages/_shared'
import { cn } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'

type Props = {
  projectId: string | number
  phaseId?: string | number | null
  taskId?: string | number | null
  label?: string
  compact?: boolean
  className?: string
  onUploaded?: () => void
}

export function EvidenceUploadButton({
  projectId,
  phaseId,
  taskId,
  label,
  compact,
  className,
  onUploaded,
}: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const getError = useApiError()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0]
      if (!file) throw new Error(t('validation.required'))
      const fd = new FormData()
      fd.append('file', file)
      fd.append('project_id', String(projectId))
      if (phaseId) fd.append('phase_id', String(phaseId))
      if (taskId) fd.append('task_id', String(taskId))
      return evidenceApi.upload(fd)
    },
    onSuccess: () => {
      setOpen(false)
      if (fileRef.current) fileRef.current.value = ''
      void qc.invalidateQueries({ queryKey: ['evidence'] })
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['my-work'] })
      toast.success(t('toast.uploaded'))
      onUploaded?.()
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={cn(compact ? '!h-8 !px-2 text-xs' : undefined, className)}
        onClick={() => setOpen(true)}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {label || t('evidence.attach')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('evidence.upload')}>
        <div className="space-y-4">
          <p className="text-xs text-muted">{t('evidence.allowedTypes')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,.txt,.json,.xml,.csv,.log,.nmap,.zip,image/*,application/pdf"
            className="block w-full text-sm text-muted file:me-3 file:rounded file:border-0 file:bg-ink-green file:px-3 file:py-1.5 file:text-gold-light"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={upload.isPending} onClick={() => upload.mutate()}>
              {t('common.upload')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
