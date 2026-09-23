import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { projectsApi, tasksApi, teamApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@/pages/_shared'
import { formatDate } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'

const TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'completed']

export function TasksPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { canAny } = useAuth()
  const canManage = canAny('task.manage', 'admin.all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    project_id: '',
    assignee_id: '',
    due_date: '',
    priority: 'medium',
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => tasksApi.list({ page_size: 100 }),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectsApi.list({ page_size: 100 }),
    enabled: canManage,
  })
  const { data: usersPage } = useQuery({
    queryKey: ['users', 'select'],
    queryFn: () => teamApi.users({ page: 1, page_size: 100 }),
    enabled: canManage,
  })
  const users = usersPage?.items || []

  const create = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: form.title.trim(),
        description: form.description || null,
        project_id: Number(form.project_id),
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        due_date: form.due_date || null,
        priority: form.priority,
        status: 'pending',
      } as never),
    onSuccess: () => {
      setOpen(false)
      setForm({
        title: '',
        description: '',
        project_id: '',
        assignee_id: '',
        due_date: '',
        priority: 'medium',
      })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['my-work'] })
      toast.success(t('toast.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      tasksApi.update(id, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['my-work'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['my-work'] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('tasks.title')}
        subtitle={t('tasks.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setOpen(true)}>{t('tasks.assign')}</Button>
          ) : undefined
        }
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && <EmptyState title={t('tasks.empty')} />}

      {data && data.items.length > 0 && (
        <div className="space-y-2">
          {data.items.map((task) => (
            <Card key={task.id} className="!p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted">
                    {task.project?.name || task.project_id} ·{' '}
                    {task.assignee?.full_name || t('common.unassigned')} ·{' '}
                    {formatDate(task.due_date, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManage ? (
                    <Select
                      className="!h-8 !w-auto"
                      value={task.status || 'pending'}
                      onChange={(e) =>
                        update.mutate({ id: String(task.id), status: e.target.value })
                      }
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <StatusBadge status={task.status} />
                  )}
                  {task.project_id && (
                    <Link
                      to={`/projects/${task.project_id}`}
                      className="text-xs text-gold hover:underline"
                    >
                      {t('common.project')}
                    </Link>
                  )}
                  {canManage && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(t('tasks.confirmDelete'))) {
                          remove.mutate(String(task.id))
                        }
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={t('tasks.assign')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={create.isPending}
                disabled={!form.title.trim() || !form.project_id || !form.assignee_id}
                onClick={() => create.mutate()}
              >
                {t('common.create')}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label={t('common.title')} required>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </Field>
            <Field label={t('common.description')}>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label={t('common.project')} required>
              <Select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
              >
                <option value="">{t('common.select')}</option>
                {projects?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.assignee')} required>
              <Select
                value={form.assignee_id}
                onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}
              >
                <option value="">{t('common.select')}</option>
                {(users || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('common.dueDate')}>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </Field>
              <Field label={t('common.priority')}>
                <Select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  {['low', 'medium', 'high', 'critical'].map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}`, { defaultValue: p })}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
