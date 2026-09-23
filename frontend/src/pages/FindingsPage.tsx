import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { evidenceApi, findingsApi, lookupsApi, projectsApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  SeverityBadge,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@/pages/_shared'
import { bilingualName, formatDate } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/contexts/AuthContext'

type FormValues = {
  title: string
  description: string
  project_id: string
  phase_id: string
  severity_id: string
  status_id: string
}

function toIntOrNull(v: string): number | null {
  if (!v || !String(v).trim()) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function FindingsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { can, canAny, user } = useAuth()
  const canCreate = canAny('finding.create', 'finding.update', 'admin.all')
  const canDelete = can('finding.delete') || can('admin.all')
  const remove = useMutation({
    mutationFn: (id: string) => findingsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['findings'] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })
  const unrestricted =
    can('admin.all') || can('project.manage') || can('finding.update')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const debounced = useDebouncedValue(q)
  const form = useForm<FormValues>({
    defaultValues: {
      title: '',
      description: '',
      project_id: '',
      phase_id: '',
      severity_id: '',
      status_id: '',
    },
  })
  const projectId = form.watch('project_id')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['findings', page, debounced],
    queryFn: () => findingsApi.list({ page, page_size: 20, q: debounced || undefined }),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectsApi.list({ page_size: 100 }),
  })
  const { data: projectDetail } = useQuery({
    queryKey: ['projects', projectId, 'phases'],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  })
  const { data: severities } = useQuery({
    queryKey: ['lookups', 'severities'],
    queryFn: () => lookupsApi.get('severities'),
  })
  const { data: statuses } = useQuery({
    queryKey: ['lookups', 'finding-statuses'],
    queryFn: () => lookupsApi.get('finding-statuses'),
  })

  const phases = useMemo(() => {
    const list = projectDetail?.phases || []
    if (unrestricted) return list
    return list.filter((p) => String(p.assignee_id) === String(user?.id))
  }, [projectDetail?.phases, unrestricted, user?.id])

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const projectIdNum = toIntOrNull(values.project_id)
      const phaseIdNum = toIntOrNull(values.phase_id)
      if (!values.title.trim() || !projectIdNum) throw new Error(t('validation.required'))
      if (!unrestricted && !phaseIdNum) throw new Error(t('validation.required'))
      const payload: Record<string, unknown> = {
        title: values.title.trim(),
        description: values.description || null,
        project_id: projectIdNum,
        phase_id: phaseIdNum,
        severity_id: toIntOrNull(values.severity_id),
        status_id: toIntOrNull(values.status_id),
      }
      const finding = await findingsApi.create(payload as never)
      const file = fileRef.current?.files?.[0]
      if (file && canAny('evidence.upload', 'admin.all')) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('project_id', String(projectIdNum))
        fd.append('finding_id', String(finding.id))
        if (phaseIdNum) fd.append('phase_id', String(phaseIdNum))
        await evidenceApi.upload(fd)
      }
      return finding
    },
    onSuccess: (f) => {
      setOpen(false)
      form.reset()
      if (fileRef.current) fileRef.current.value = ''
      void qc.invalidateQueries({ queryKey: ['findings'] })
      void qc.invalidateQueries({ queryKey: ['evidence'] })
      toast.success(t('toast.created'))
      window.location.assign(`/findings/${f.id}`)
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('findings.title')}
        subtitle={t('findings.subtitle')}
        actions={canCreate ? <Button onClick={() => setOpen(true)}>{t('findings.new')}</Button> : undefined}
      />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder={t('common.search')}
        className="max-w-xs"
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState
          title={t('findings.empty')}
          action={canCreate ? <Button onClick={() => setOpen(true)}>{t('findings.new')}</Button> : undefined}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded border border-line md:block">
            <table className="w-full text-sm">
              <thead className="bg-panel text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-start">ID</th>
                  <th className="px-3 py-2 text-start">{t('common.title')}</th>
                  <th className="px-3 py-2 text-start">{t('common.severity')}</th>
                  <th className="px-3 py-2 text-start">{t('common.status')}</th>
                  <th className="px-3 py-2 text-start">{t('findings.reporter')}</th>
                  <th className="px-3 py-2 text-start">{t('common.project')}</th>
                  <th className="px-3 py-2 text-start">{t('common.updated')}</th>
                  {canDelete && <th className="px-3 py-2 text-start">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id} className="border-t border-line/50 hover:bg-panel/50">
                    <td className="px-3 py-2">
                      <Link className="text-gold hover:underline" to={`/findings/${f.id}`}>
                        {f.human_id || f.public_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/findings/${f.id}`} className="hover:text-gold">
                        {f.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <SeverityBadge
                        name={bilingualName(f.severity, locale)}
                        colorToken={f.severity?.color_token}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        status={bilingualName(f.status, locale) || f.status_id}
                        code={f.status?.code}
                      />
                    </td>
                    <td className="px-3 py-2 text-muted">{f.reporter?.full_name || '—'}</td>
                    <td className="px-3 py-2 text-muted">{f.project?.name || '—'}</td>
                    <td className="px-3 py-2 text-muted">{formatDate(f.updated_at, locale)}</td>
                    {canDelete && (
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="danger"
                          loading={remove.isPending}
                          onClick={() => {
                            if (window.confirm(t('findings.confirmDelete'))) {
                              remove.mutate(String(f.id))
                            }
                          }}
                        >
                          {t('common.delete')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {data.items.map((f) => (
              <Link key={f.id} to={`/findings/${f.id}`}>
                <Card className="!p-3">
                  <div className="flex justify-between gap-2">
                    <span className="text-xs text-gold">{f.human_id || f.public_id}</span>
                    <SeverityBadge
                      name={bilingualName(f.severity, locale)}
                      colorToken={f.severity?.color_token}
                    />
                  </div>
                  <p className="mt-1 font-medium">{f.title}</p>
                  {f.reporter?.full_name && (
                    <p className="mt-1 text-xs text-muted">
                      {t('findings.reporter')}: {f.reporter.full_name}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('findings.new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={create.isPending} onClick={form.handleSubmit((v) => create.mutate(v))}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('common.project')} required>
            <Select
              {...form.register('project_id', { required: true })}
              onChange={(e) => {
                form.setValue('project_id', e.target.value)
                form.setValue('phase_id', '')
              }}
            >
              <option value="">{t('common.select')}</option>
              {projects?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.phase')} required={!unrestricted}>
            <Select {...form.register('phase_id', { required: !unrestricted })}>
              <option value="">{t('common.select')}</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {bilingualName(p, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.title')} required>
            <Input {...form.register('title', { required: true })} />
          </Field>
          <Field label={t('common.description')}>
            <Textarea {...form.register('description')} rows={3} />
          </Field>
          <Field label={t('common.severity')}>
            <Select {...form.register('severity_id')}>
              <option value="">{t('common.select')}</option>
              {severities?.map((s) => (
                <option key={s.id} value={s.id}>
                  {bilingualName(s, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.status')}>
            <Select {...form.register('status_id')}>
              <option value="">{t('common.select')}</option>
              {statuses?.map((s) => (
                <option key={s.id} value={s.id}>
                  {bilingualName(s, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('evidence.attach')}>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,.txt,.json,.xml,.csv,.log,.nmap,.zip,image/*,application/pdf"
              className="block w-full text-sm text-muted file:me-3 file:rounded file:border-0 file:bg-ink-green file:px-3 file:py-1.5 file:text-gold-light"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
