import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { teamApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
} from '@/pages/_shared'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'

export function TeamPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const form = useForm({
    defaultValues: { username: '', full_name: '', password: '', role_id: '' },
  })

  const { data: workload, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['team', 'workload'],
    queryFn: () => teamApi.workload(),
  })
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => teamApi.roles() })
  const users = workload?.users || []

  const create = useMutation({
    mutationFn: (values: { username: string; full_name: string; password: string; role_id: string }) =>
      teamApi.createUser({
        username: values.username.trim().toLowerCase(),
        full_name: values.full_name,
        password: values.password,
        role_id: Number(values.role_id),
      }),
    onSuccess: () => {
      setOpen(false)
      form.reset()
      void qc.invalidateQueries({ queryKey: ['team'] })
      toast.success(t('toast.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('team.title')}
        subtitle={t('team.subtitle')}
        actions={<Button onClick={() => setOpen(true)}>{t('team.invite')}</Button>}
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {!isLoading && !isError && users.length === 0 && <EmptyState title={t('team.empty')} />}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((row) => {
          const load = row.estimated_hours ? Math.min(100, (row.logged_hours / row.estimated_hours) * 100) : 0
          const roleLabel =
            locale === 'ar'
              ? row.user.role?.name_ar || row.user.role?.name_en || row.user.role?.name
              : row.user.role?.name_en || row.user.role?.name
          return (
            <Card key={row.user.id} className="!p-4">
              <div className="mb-2">
                <p className="font-medium">{row.user.full_name}</p>
                <p className="text-xs text-muted">
                  {row.user.username}
                  {roleLabel ? ` · ${roleLabel}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label={t('team.openTasks')} value={row.open_tasks} />
                <Stat label={t('team.openPhases')} value={row.open_phases} />
                <Stat label={t('team.openFindings')} value={row.open_findings} />
                <Stat label={t('common.overdue')} value={row.overdue} danger />
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>{t('common.capacity')}</span>
                  <span className="font-numeric">
                    {row.logged_hours}/{row.estimated_hours}h
                  </span>
                </div>
                <ProgressBar value={load} />
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('team.invite')}
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
          <Field label={t('auth.fullName')} required>
            <Input {...form.register('full_name', { required: true })} />
          </Field>
          <Field label={t('auth.username')} required>
            <Input {...form.register('username', { required: true, minLength: 2 })} autoComplete="off" />
          </Field>
          <Field label={t('auth.password')} required>
            <Input type="password" {...form.register('password', { required: true, minLength: 4 })} />
          </Field>
          <Field label={t('common.role')}>
            <Select {...form.register('role_id')}>
              <option value="">{t('common.select')}</option>
              {(roles || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {locale === 'ar' ? r.name_ar || r.name_en || r.name : r.name_en || r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded border border-line/40 bg-panel px-2 py-1.5">
      <p className="text-muted">{label}</p>
      <p className={`font-numeric ${danger ? 'text-error' : 'text-text'}`}>{value}</p>
    </div>
  )
}
