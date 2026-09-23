import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi, projectsApi } from '@/api'
import { ReportPreviewModal } from '@/components/ReportPreviewModal'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
} from '@/pages/_shared'
import { bilingualName, formatDateTime } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import type { GeneratedReport } from '@/types'

export function ReportsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { can } = useAuth()
  const canDelete = can('admin.all') || can('report.delete')
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<GeneratedReport | null>(null)
  const [form, setForm] = useState({
    project_id: '',
    template_id: '',
    language: 'en',
    include_evidence: true,
    classification: 'Confidential',
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports'],
    queryFn: () => reportsApi.list({ page_size: 50 }),
  })
  const { data: templates } = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => reportsApi.templates(),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectsApi.list({ page_size: 100 }),
  })

  const generate = useMutation({
    mutationFn: () =>
      reportsApi.generate({
        ...form,
        project_id: Number(form.project_id),
        template_id: form.template_id ? Number(form.template_id) : null,
      }),
    onSuccess: (report) => {
      setOpen(false)
      void qc.invalidateQueries({ queryKey: ['reports'] })
      toast.success(t('toast.created'))
      setPreview(report)
    },
    onError: (err) => toast.error(getError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => reportsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reports'] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <div className="flex gap-2">
            <Link to="/reports/templates">
              <Button variant="secondary">{t('reports.templates')}</Button>
            </Link>
            <Button onClick={() => setOpen(true)}>{t('reports.generate')}</Button>
          </div>
        }
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState
          title={t('reports.empty')}
          action={<Button onClick={() => setOpen(true)}>{t('reports.generate')}</Button>}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {data?.items.map((r) => (
          <Card key={r.id} className="!p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{r.title || r.project?.name || r.project_id}</p>
                <p className="text-xs text-muted">
                  {r.project?.name || r.project_id} · {bilingualName(r.template, locale)} · {r.language}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-2 text-xs text-muted">{formatDateTime(r.created_at, locale)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setPreview(r)}>
                {t('reports.preview')}
              </Button>
              {canDelete && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => {
                    if (window.confirm(t('reports.confirmDeleteReport'))) {
                      remove.mutate(String(r.id))
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('reports.generate')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={generate.isPending}
              disabled={!form.project_id}
              onClick={() => generate.mutate()}
            >
              {t('common.generate')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('common.project')} required>
            <Select
              value={form.project_id}
              onChange={(e) => setForm((s) => ({ ...s, project_id: e.target.value }))}
            >
              <option value="">{t('common.select')}</option>
              {projects?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.template')}>
            <Select
              value={form.template_id}
              onChange={(e) => setForm((s) => ({ ...s, template_id: e.target.value }))}
            >
              <option value="">{t('reports.defaultTemplate')}</option>
              {(templates || []).map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {bilingualName(tmpl, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('reports.language')}>
            <Select
              value={form.language}
              onChange={(e) => setForm((s) => ({ ...s, language: e.target.value }))}
            >
              <option value="en">{t('common.english')}</option>
              <option value="ar">{t('common.arabic')}</option>
              <option value="bilingual">{t('common.both')}</option>
            </Select>
          </Field>
          <Field label={t('reports.classification')}>
            <Select
              value={form.classification}
              onChange={(e) => setForm((s) => ({ ...s, classification: e.target.value }))}
            >
              <option value="Confidential">Confidential</option>
              <option value="Internal">Internal</option>
              <option value="Restricted">Restricted</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.include_evidence}
              onChange={(e) => setForm((s) => ({ ...s, include_evidence: e.target.checked }))}
            />
            {t('reports.includeEvidence')}
          </label>
          <p className="text-[11px] text-muted">{t('reports.generateHint')}</p>
        </div>
      </Modal>

      {preview && (
        <ReportPreviewModal
          report={preview}
          onClose={() => setPreview(null)}
          onUpdated={(r) => {
            setPreview(r)
            void qc.invalidateQueries({ queryKey: ['reports'] })
          }}
        />
      )}
    </div>
  )
}
