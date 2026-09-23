import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { projectsApi } from '@/api'
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '@/pages/_shared'
import { bilingualName, formatDate, cn } from '@/utils/cn'
import { phaseOrder } from '@/utils/apiNormalize'
import { useApiError } from '@/hooks/useApiError'
import type { ProjectPhase } from '@/types'

type Tab = 'vertical' | 'gantt' | 'kanban' | 'flow'

const STATUSES = ['pending', 'in_progress', 'blocked', 'completed', 'skipped']

export function ProjectTimelinePage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const [tab, setTab] = useState<Tab>('vertical')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projects', id, 'timeline'],
    queryFn: () => projectsApi.timeline(id).catch(() => projectsApi.get(id)),
    enabled: !!id,
  })

  const phases = data?.phases || []

  const ganttRange = useMemo(() => {
    const dates = phases
      .flatMap((p) => [p.planned_start, p.planned_end, p.actual_start, p.actual_end])
      .filter(Boolean) as string[]
    if (!dates.length) return null
    const min = new Date(Math.min(...dates.map((d) => new Date(d).getTime())))
    const max = new Date(Math.max(...dates.map((d) => new Date(d).getTime())))
    if (max.getTime() === min.getTime()) max.setDate(max.getDate() + 7)
    return { min, max, span: max.getTime() - min.getTime() }
  }, [phases])

  if (isLoading) return <Skeleton className="h-64" />
  if (isError || !data) return <ErrorState message={getError(error)} onRetry={() => void refetch()} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`${t('timeline.title')} — ${data.name}`}
        subtitle={t('timeline.subtitle')}
        backTo={`/projects/${id}`}
        backLabel={t('common.back')}
      />

      <div className="inline-flex rounded border border-line p-0.5">
        {(['vertical', 'gantt', 'kanban', 'flow'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded px-3 py-1.5 text-xs',
              tab === key ? 'bg-ink-green text-gold-light' : 'text-muted hover:text-text',
            )}
          >
            {t(`timeline.${key}`)}
          </button>
        ))}
      </div>

      {!phases.length && <EmptyState title={t('timeline.noPhases')} />}

      {tab === 'vertical' && !!phases.length && (
        <div className="relative ms-3 ps-6">
          {phases.map((phase, index) => {
            const completed = (phase.status || '').toLowerCase() === 'completed'
            const nextCompleted =
              index < phases.length - 1 &&
              (phases[index + 1].status || '').toLowerCase() === 'completed'
            return (
              <div key={phase.id} className="relative mb-6 last:mb-0">
                {index < phases.length - 1 && (
                  <span
                    className={cn(
                      'absolute -start-[1.15rem] top-4 bottom-[-1.5rem] w-0.5',
                      completed && nextCompleted
                        ? 'bg-gradient-to-b from-gold to-success/70'
                        : completed
                          ? 'bg-gradient-to-b from-gold to-line'
                          : 'bg-line',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'absolute -start-[1.9rem] top-1 h-3 w-3 rounded-full border-2 bg-card',
                    completed ? 'border-gold bg-gold/30' : 'border-gold',
                  )}
                />
                <Card className={cn('!p-3', completed && 'border-gold/40')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {phaseOrder(phase)}. {bilingualName(phase, locale)}
                      </p>
                      <p className="text-xs text-muted">
                        {phase.assignee?.full_name || t('common.unassigned')} ·{' '}
                        {formatDate(phase.planned_start, locale)} → {formatDate(phase.planned_end, locale)}
                      </p>
                      <PhaseMetrics phase={phase} t={t} />
                    </div>
                    <StatusBadge status={phase.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span>{t('timeline.findingsCount', { count: phase.findings_count ?? 0 })}</span>
                    <span>{t('timeline.evidenceCount', { count: phase.evidence_count ?? 0 })}</span>
                  </div>
                </Card>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'gantt' && !!phases.length && (
        <Card className="overflow-hidden">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-line/60 pb-3">
            <p className="text-xs text-muted">{t('timeline.plannedVsActual')}</p>
            <div className="flex gap-3 text-[10px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm bg-gold/50" />
                {t('timeline.planned')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm bg-success/70" />
                {t('timeline.actual')}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            {phases.map((phase) => (
              <GanttRow key={phase.id} phase={phase} range={ganttRange} locale={locale} t={t} />
            ))}
          </div>
        </Card>
      )}

      {tab === 'kanban' && !!phases.length && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {STATUSES.map((status) => (
            <div key={status} className="rounded border border-line bg-panel p-2">
              <p className="mb-2 px-1 text-xs font-semibold text-gold-light">{t(`status.${status}`)}</p>
              <div className="space-y-2">
                {phases
                  .filter((p) => (p.status || 'pending').toLowerCase().replace(/\s+/g, '_') === status)
                  .map((phase) => (
                    <Card key={phase.id} className="!p-2 !shadow-none">
                      <p className="text-sm">{bilingualName(phase, locale)}</p>
                      <p className="text-[11px] text-muted">
                        {phase.assignee?.full_name || t('common.unassigned')}
                      </p>
                      <PhaseMetrics phase={phase} t={t} compact />
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'flow' && !!phases.length && <FlowChart phases={phases} locale={locale} t={t} />}
    </div>
  )
}

function PhaseMetrics({
  phase,
  t,
  compact,
}: {
  phase: ProjectPhase
  t: (key: string, opts?: Record<string, unknown>) => string
  compact?: boolean
}) {
  const parts: string[] = []
  if (phase.weight_percent != null) parts.push(t('timeline.weight', { percent: phase.weight_percent }))
  if (phase.days_allocated != null) parts.push(t('timeline.daysAllocated', { count: phase.days_allocated }))
  if (phase.days_remaining != null) {
    if (phase.days_remaining < 0) {
      parts.push(t('timeline.daysOverdue', { count: Math.abs(phase.days_remaining) }))
    } else {
      parts.push(t('timeline.daysRemaining', { count: phase.days_remaining }))
    }
  }
  if (!parts.length) return null
  return (
    <p className={cn('text-muted', compact ? 'mt-1 text-[10px]' : 'mt-1 text-[11px]')}>
      {parts.join(' · ')}
    </p>
  )
}

function FlowChart({
  phases,
  locale,
  t,
}: {
  phases: ProjectPhase[]
  locale: 'en' | 'ar'
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const weights = phases.map((p) => Math.max(Number(p.weight_percent) || Number(p.days_allocated) || 1, 1))
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1

  return (
    <Card className="overflow-x-auto !p-5">
      <p className="mb-4 text-xs text-muted">{t('timeline.flowHint')}</p>
      <div className="flex min-w-max items-stretch gap-0">
        {phases.map((phase, index) => {
          const status = (phase.status || 'pending').toLowerCase()
          const done = status === 'completed'
          const active = status === 'in_progress'
          const overdue = !done && status !== 'skipped' && (phase.days_remaining ?? 1) < 0
          const share = weights[index] / weightSum
          const widthPx = Math.max(140, Math.round(share * 520))
          return (
            <div key={phase.id} className="flex items-center">
              <div
                className={cn(
                  'relative rounded-lg border px-3 py-3 transition-colors',
                  done && 'border-gold/60 bg-gradient-to-br from-ink-green/80 to-ink-green text-gold-light',
                  active && !overdue && 'border-gold bg-gold/10',
                  overdue && 'border-error/50 bg-error/5',
                  !done && !active && !overdue && 'border-line bg-panel',
                )}
                style={{ width: widthPx }}
              >
                <div className="mb-2 flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                      done ? 'bg-gold text-ink-green' : 'bg-panel-2 text-muted',
                    )}
                  >
                    {phaseOrder(phase)}
                  </span>
                  <StatusBadge status={phase.status} />
                </div>
                <p className="text-sm font-medium leading-snug">{bilingualName(phase, locale)}</p>
                <p className="mt-1.5 text-[10px] text-muted">
                  {formatDate(phase.planned_start, locale)}
                  {phase.planned_end ? ` → ${formatDate(phase.planned_end, locale)}` : ''}
                </p>
                <PhaseMetrics phase={phase} t={t} compact />
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      done ? 'w-full bg-gold' : active ? 'w-1/2 bg-gold/70' : overdue ? 'w-full bg-error/60' : 'w-[8%] bg-line',
                    )}
                  />
                </div>
              </div>
              {index < phases.length - 1 && (
                <div className="relative mx-1 flex w-10 shrink-0 items-center">
                  <span
                    className={cn(
                      'h-0.5 w-full rounded-full',
                      done ? 'bg-gradient-to-r from-gold to-gold/40' : 'bg-line',
                    )}
                  />
                  <span
                    className={cn(
                      'absolute end-0 h-2 w-2 rotate-45 border-e-2 border-t-2',
                      done ? 'border-gold' : 'border-line',
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function GanttRow({
  phase,
  range,
  locale,
  t,
}: {
  phase: ProjectPhase
  range: { min: Date; max: Date; span: number } | null
  locale: 'en' | 'ar'
  t: (k: string, opts?: Record<string, unknown>) => string
}) {
  if (!range) {
    return (
      <div className="text-sm">
        <span className="text-muted">{bilingualName(phase, locale)}</span>
      </div>
    )
  }
  const bar = (start?: string | null, end?: string | null, color = 'bg-gold/70', top = 'top-1.5') => {
    if (!start || !end) return null
    const s = new Date(start).getTime()
    const e = new Date(end).getTime()
    const left = ((s - range.min.getTime()) / range.span) * 100
    const width = Math.max(((e - s) / range.span) * 100, 1.5)
    return (
      <div
        className={cn('absolute h-3 rounded-full shadow-sm', color, top)}
        style={{ insetInlineStart: `${left}%`, width: `${width}%` }}
        title={`${formatDate(start, locale)} → ${formatDate(end, locale)}`}
      />
    )
  }
  const completed = (phase.status || '').toLowerCase() === 'completed'
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-3 text-xs">
      <div className="min-w-0">
        <span className={cn('block truncate font-medium', completed && 'text-gold-light')}>
          {bilingualName(phase, locale)}
        </span>
        <PhaseMetrics phase={phase} t={t} compact />
      </div>
      <div className="relative h-10 overflow-hidden rounded-md border border-line/40 bg-gradient-to-b from-panel-2 to-panel">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 24px, var(--color-line, #2a3f3a) 24px, var(--color-line, #2a3f3a) 25px)',
          }}
        />
        {bar(phase.planned_start, phase.planned_end, 'bg-gold/45 ring-1 ring-gold/30')}
        {bar(
          phase.actual_start,
          phase.actual_end || phase.actual_start,
          'bg-success/70 ring-1 ring-success/40',
          'top-5',
        )}
        <span className="sr-only">{t('timeline.plannedVsActual')}</span>
      </div>
    </div>
  )
}
