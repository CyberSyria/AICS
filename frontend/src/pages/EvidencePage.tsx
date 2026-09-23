import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { evidenceApi, projectsApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@/pages/_shared'
import { formatBytes, formatDateTime } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'

export function EvidencePage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { can } = useAuth()
  const canUpload = can('admin.all') || can('project.manage')
  const canDelete = can('admin.all') || can('evidence.delete')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['evidence', page],
    queryFn: () => evidenceApi.list({ page, page_size: 20 }),
  })
  const { data: projects } = useQuery({ queryKey: ['projects', 'select'], queryFn: () => projectsApi.list({ page_size: 100 }) })

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0]
      if (!file || !projectId) throw new Error(t('validation.required'))
      const fd = new FormData()
      fd.append('file', file)
      fd.append('project_id', projectId)
      return evidenceApi.upload(fd)
    },
    onSuccess: () => {
      setOpen(false)
      setProjectId('')
      if (fileRef.current) fileRef.current.value = ''
      void qc.invalidateQueries({ queryKey: ['evidence'] })
      toast.success(t('toast.uploaded'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => evidenceApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['evidence'] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('evidence.title')}
        subtitle={t('evidence.subtitle')}
        actions={canUpload ? <Button onClick={() => setOpen(true)}>{t('evidence.upload')}</Button> : undefined}
      />
      <p className="text-xs text-muted">{t('evidence.allowedTypes')}</p>

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState
          title={t('evidence.empty')}
          action={canUpload ? <Button onClick={() => setOpen(true)}>{t('evidence.upload')}</Button> : undefined}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded border border-line md:block">
            <table className="w-full text-sm">
              <thead className="bg-panel text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-start">{t('common.filename')}</th>
                  <th className="px-3 py-2 text-start">{t('common.project')}</th>
                  <th className="px-3 py-2 text-start">{t('common.size')}</th>
                  <th className="px-3 py-2 text-start">{t('common.uploadedBy')}</th>
                  <th className="px-3 py-2 text-start">{t('common.created')}</th>
                  <th className="px-3 py-2 text-start">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="border-t border-line/50">
                    <td className="px-3 py-2">{e.filename}</td>
                    <td className="px-3 py-2 text-muted">
                      {e.project_id ? (
                        <Link to={`/projects/${e.project_id}`} className="text-gold hover:underline">
                          {e.project?.name || e.project_id}
                        </Link>
                      ) : (
                        e.project?.name || '—'
                      )}
                    </td>
                    <td className="px-3 py-2">{formatBytes(e.size ?? e.size_bytes)}</td>
                    <td className="px-3 py-2">{e.uploaded_by?.full_name || '—'}</td>
                    <td className="px-3 py-2 text-muted">{formatDateTime(e.created_at, locale)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <a className="text-gold hover:underline" href={evidenceApi.downloadUrl(e.id)} target="_blank" rel="noreferrer">
                          {t('common.download')}
                        </a>
                        {canDelete && (
                          <button
                            type="button"
                            className="text-error hover:underline"
                            onClick={() => {
                              if (window.confirm(t('evidence.confirmDelete'))) {
                                remove.mutate(String(e.id))
                              }
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {data.items.map((e) => (
              <Card key={e.id} className="!p-3">
                <p className="font-medium">{e.filename}</p>
                <p className="text-xs text-muted">{formatBytes(e.size ?? e.size_bytes)} · {formatDateTime(e.created_at, locale)}</p>
                {e.project_id && (
                  <Link to={`/projects/${e.project_id}`} className="mt-1 block text-xs text-gold hover:underline">
                    {e.project?.name || e.project_id}
                  </Link>
                )}
                <a className="mt-2 inline-block text-xs text-gold" href={evidenceApi.downloadUrl(e.id)}>{t('common.download')}</a>
                {canDelete && (
                  <button
                    type="button"
                    className="mt-2 ms-3 inline-block text-xs text-error"
                    onClick={() => {
                      if (window.confirm(t('evidence.confirmDelete'))) {
                        remove.mutate(String(e.id))
                      }
                    }}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('evidence.upload')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button loading={upload.isPending} onClick={() => upload.mutate()}>{t('common.upload')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('common.project')} required>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t('common.select')}</option>
              {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.filename')} required>
            <input ref={fileRef} type="file" className="block w-full text-sm text-muted file:me-3 file:rounded file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-text" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
