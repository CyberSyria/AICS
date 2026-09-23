import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { findingsApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  SeverityBadge,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@/pages/_shared'
import { bilingualName, formatDateTime } from '@/utils/cn'
import { calculateCvss31, CVSS_OPTIONS, DEFAULT_CVSS, parseCvssVector, type CvssMetric, type CvssValues } from '@/utils/cvss'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'

export function FindingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { can } = useAuth()
  const canDelete = can('finding.delete') || can('admin.all')
  const canConfirm = can('admin.all')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['findings', id],
    queryFn: () => findingsApi.get(id),
    enabled: !!id,
  })

  const form = useForm({
    values: data
      ? {
          title: data.title,
          description: data.description || '',
          impact: data.impact || '',
          recommendation: data.recommendation || '',
          reproduction_steps: data.reproduction_steps || '',
          references: data.references || '',
          cve: data.cve || '',
          cwe: data.cwe || '',
          owasp: data.owasp || '',
          affected_component: data.affected_component || '',
          notes: data.notes || '',
        }
      : undefined,
  })

  const [cvss, setCvss] = useState<CvssValues>(DEFAULT_CVSS)
  useEffect(() => {
    if (data?.cvss_vector) {
      const parsed = parseCvssVector(data.cvss_vector)
      if (parsed) setCvss(parsed)
    }
  }, [data?.cvss_vector])

  const cvssResult = useMemo(() => calculateCvss31(cvss), [cvss])

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => findingsApi.update(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['findings', id] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const confirmFinding = useMutation({
    mutationFn: () => findingsApi.confirm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['findings', id] })
      void qc.invalidateQueries({ queryKey: ['findings'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const remove = useMutation({
    mutationFn: () => findingsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['findings'] })
      toast.success(t('toast.deleted'))
      navigate('/findings')
    },
    onError: (err) => toast.error(getError(err)),
  })

  if (isLoading) return <Skeleton className="h-64" />
  if (isError || !data) return <ErrorState message={getError(error)} onRetry={() => void refetch()} />

  const statusCode = (data.status?.code || '').toLowerCase()
  const showConfirm = canConfirm && statusCode === 'in_review'

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`${data.human_id} — ${data.title}`}
        subtitle={t('findings.detail')}
        backTo="/findings"
        backLabel={t('common.back')}
        actions={
          <div className="flex flex-wrap gap-2">
            <SeverityBadge name={bilingualName(data.severity, locale)} colorToken={data.severity?.color_token} />
            <StatusBadge status={bilingualName(data.status, locale)} code={data.status?.code} />
            {showConfirm && (
              <Button
                loading={confirmFinding.isPending}
                onClick={() => confirmFinding.mutate()}
                title={t('findings.confirmHint')}
              >
                {t('findings.confirm')}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => {
                  if (window.confirm(t('findings.confirmDelete'))) {
                    remove.mutate()
                  }
                }}
              >
                {t('common.delete')}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-2">
          <form
            className="space-y-3"
            onSubmit={form.handleSubmit((values) =>
              save.mutate({
                ...values,
                cvss_score: cvssResult.score,
                cvss_vector: cvssResult.vector,
              }),
            )}
          >
            <Field label={t('common.title')}><Input {...form.register('title')} /></Field>
            <Field label={t('common.description')}><Textarea {...form.register('description')} rows={5} /></Field>
            <Field label={t('common.impact')}><Textarea {...form.register('impact')} /></Field>
            <Field label={t('common.reproduction')}><Textarea {...form.register('reproduction_steps')} /></Field>
            <Field label={t('common.recommendation')}><Textarea {...form.register('recommendation')} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('common.cve')}><Input {...form.register('cve')} /></Field>
              <Field label={t('common.cwe')}><Input {...form.register('cwe')} /></Field>
              <Field label={t('common.owasp')}><Input {...form.register('owasp')} /></Field>
              <Field label={t('common.affectedComponent')}><Input {...form.register('affected_component')} /></Field>
            </div>
            <Field label={t('common.references')}><Textarea {...form.register('references')} /></Field>
            <Field label={t('common.notes')}><Textarea {...form.register('notes')} /></Field>
            <Button type="submit" loading={save.isPending}>{t('common.saveChanges')}</Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-1 text-sm font-semibold">{t('findings.cvss')}</h2>
            <p className="mb-3 text-xs text-muted">{t('findings.cvssHint')}</p>
            <div className="mb-3 rounded border border-line bg-panel p-3 text-center">
              <p className="text-3xl font-semibold text-gold-light">{cvssResult.score.toFixed(1)}</p>
              <p className="text-xs text-muted">{cvssResult.severity}</p>
              <p className="mt-2 break-all font-mono text-[10px] text-muted">{cvssResult.vector}</p>
            </div>
            <div className="space-y-2">
              {(Object.keys(CVSS_OPTIONS) as CvssMetric[]).map((metric) => (
                <Field key={metric} label={metric}>
                  <Select
                    value={cvss[metric]}
                    onChange={(e) => setCvss((prev) => ({ ...prev, [metric]: e.target.value }))}
                  >
                    {CVSS_OPTIONS[metric].map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              onClick={() => save.mutate({ cvss_score: cvssResult.score, cvss_vector: cvssResult.vector })}
            >
              {t('common.save')} CVSS
            </Button>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold">{t('common.meta')}</h2>
            <dl className="space-y-2 text-sm">
              <Meta label={t('common.project')} value={data.project?.name} />
              <Meta label={t('common.phase')} value={bilingualName(data.phase, locale)} />
              <Meta label={t('common.tool')} value={data.tool?.name} />
              <Meta label={t('findings.reporter')} value={data.reporter?.full_name} />
              <Meta label={t('common.assignee')} value={data.assignee?.full_name} />
              <Meta label={t('common.dueDate')} value={data.due_date} />
            </dl>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('findings.evidence')}</h2>
          {(data.evidence || []).length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.evidence!.map((e) => (
                <li key={e.id} className="rounded border border-line/50 px-2 py-1.5">{e.filename}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('findings.history')}</h2>
          {(data.history || []).length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.history!.map((h) => (
                <li key={h.id} className="border-b border-line/40 pb-2">
                  <p>
                    <span className="text-gold">{h.field}</span>: {h.old_value || '—'} → {h.new_value || '—'}
                  </p>
                  <p className="text-xs text-muted">
                    {h.changed_by?.full_name} · {formatDateTime(h.created_at, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end">{value || '—'}</dd>
    </div>
  )
}
