import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { myWorkApi, tasksApi, projectsApi } from '@/api'
import { EvidenceUploadButton } from '@/components/EvidenceUploadButton'
import { Card, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatusBadge } from '@/pages/_shared'
import { bilingualName, formatDate } from '@/utils/cn'
import { phaseStatusPayload } from '@/utils/phaseStatus'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'

const PHASE_STATUSES = ['pending', 'in_progress', 'blocked', 'completed', 'skipped']
const TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'completed']

export function MyWorkPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-work'],
    queryFn: () => myWorkApi.get(),
  })

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => tasksApi.update(id, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-work'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const updatePhase = useMutation({
    mutationFn: ({
      projectId,
      phaseId,
      status,
      status_reason,
    }: {
      projectId: string
      phaseId: string
      status: string
      status_reason?: string
    }) => projectsApi.updatePhase(projectId, phaseId, { status, status_reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-work'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  if (isLoading) {
    return (
      <div>
        <PageHeader title={t('myWork.title')} subtitle={t('myWork.subtitle')} />
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div>
        <PageHeader title={t('myWork.title')} />
        <ErrorState message={getError(error)} onRetry={() => void refetch()} />
      </div>
    )
  }

  const empty = !data.phases?.length && !data.tasks?.length && !data.findings?.length

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={t('myWork.title')} subtitle={t('myWork.subtitle')} />
      {empty && <EmptyState title={t('myWork.empty')} />}

      {!!data.phases?.length && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gold-light">{t('myWork.assignedPhases')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.phases.map((p) => (
              <Card key={p.id} className="!p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/projects/${p.project_id}`} className="font-medium text-text hover:text-gold">
                      {bilingualName(p, locale)}
                    </Link>
                    <p className="text-xs text-muted">{formatDate(p.planned_end, locale)}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Select
                    aria-label={t('myWork.updateStatus')}
                    value={p.status || 'pending'}
                    onChange={(e) => {
                      const payload = phaseStatusPayload(e.target.value, t)
                      if (!payload) return
                      updatePhase.mutate({
                        projectId: String(p.project_id),
                        phaseId: String(p.id),
                        ...payload,
                      })
                    }}
                  >
                    {PHASE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </Select>
                  <EvidenceUploadButton
                    projectId={p.project_id}
                    phaseId={p.id}
                    compact
                    label={t('evidence.attach')}
                  />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!!data.tasks?.length && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gold-light">{t('myWork.assignedTasks')}</h2>
          <div className="overflow-hidden rounded border border-line">
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-panel text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-start">{t('common.title')}</th>
                  <th className="px-3 py-2 text-start">{t('common.project')}</th>
                  <th className="px-3 py-2 text-start">{t('common.dueDate')}</th>
                  <th className="px-3 py-2 text-start">{t('common.status')}</th>
                  <th className="px-3 py-2 text-start">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks.map((task) => (
                  <tr key={task.id} className="border-t border-line/60">
                    <td className="px-3 py-2">{task.title}</td>
                    <td className="px-3 py-2">
                      <Link to={`/projects/${task.project_id}`} className="text-gold hover:underline">
                        {task.project?.name || task.project_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{formatDate(task.due_date, locale)}</td>
                    <td className="px-3 py-2">
                      <Select
                        className="!h-8"
                        value={task.status}
                        onChange={(e) => updateTask.mutate({ id: String(task.id), status: e.target.value })}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t(`status.${s}`)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <EvidenceUploadButton
                        projectId={task.project_id}
                        phaseId={task.phase_id}
                        taskId={task.id}
                        compact
                        label={t('evidence.attach')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-2 p-2 md:hidden">
              {data.tasks.map((task) => (
                <Card key={task.id} className="!p-3">
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted">{formatDate(task.due_date, locale)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Select
                      value={task.status}
                      onChange={(e) => updateTask.mutate({ id: String(task.id), status: e.target.value })}
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </Select>
                    <EvidenceUploadButton
                      projectId={task.project_id}
                      phaseId={task.phase_id}
                      taskId={task.id}
                      compact
                      label={t('evidence.attach')}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {!!data.findings?.length && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gold-light">{t('myWork.assignedFindings')}</h2>
          <div className="grid gap-2">
            {data.findings.map((f) => (
              <Link
                key={f.id}
                to={`/findings/${f.id}`}
                className="rounded border border-line bg-card px-3 py-2 text-sm hover:border-gold"
              >
                <span className="text-gold">{f.human_id || f.public_id}</span> — {f.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
