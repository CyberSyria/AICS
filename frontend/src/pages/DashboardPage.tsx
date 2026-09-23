import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dashboardApi } from '@/api'
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  SeverityBadge,
  SkeletonCards,
  StatusBadge,
} from '@/pages/_shared'
import { bilingualName, formatDate } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'

const GOLD = '#C1A576'
const GOLD2 = '#D4B56E'
const ERROR = '#FF6B6B'
const WARN = '#E6C27A'
const SUCCESS = '#7CFF6B'
const MUTED = '#8A9A8C'
const palette = [ERROR, '#FF8A6B', WARN, GOLD, MUTED, SUCCESS, GOLD2]

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
  })

  if (isLoading) {
    return (
      <div>
        <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
        <SkeletonCards count={4} />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div>
        <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
        <ErrorState message={getError(error, t('common.apiUnavailable'))} onRetry={() => void refetch()} />
      </div>
    )
  }

  const kpis = [
    { label: t('dashboard.totalProjects'), value: data.total_projects },
    { label: t('dashboard.activeProjects'), value: data.active_projects },
    { label: t('dashboard.completedProjects'), value: data.completed_projects },
    { label: t('dashboard.overdueFindings'), value: data.overdue_findings },
    { label: t('dashboard.overdueTasks'), value: data.overdue_tasks },
    { label: t('dashboard.overduePhases'), value: data.overdue_phases },
  ]

  const severityRaw = data.open_findings_by_severity
  const severityData = Array.isArray(severityRaw)
    ? severityRaw.map((s) => ({
        name: locale === 'ar' && s.name_ar ? s.name_ar : s.name,
        value: s.count,
      }))
    : Object.entries(severityRaw || {}).map(([name, count]) => ({
        name,
        value: Number(count) || 0,
      }))

  const statusData = Array.isArray(data.project_status_distribution)
    ? data.project_status_distribution.map((s) => ({
        name: t(`status.${s.status}`, { defaultValue: s.status }),
        value: s.count,
      }))
    : []

  const findingsByProject = (data.findings_by_project || []).map((p) => ({
    ...p,
    name: p.name,
    total: p.total,
    label: p.name.length > 18 ? `${p.name.slice(0, 16)}…` : p.name,
  }))

  const FindingsTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: { payload?: (typeof findingsByProject)[0] }[]
  }) => {
    if (!active || !payload?.[0]?.payload) return null
    const row = payload[0].payload
    return (
      <div className="max-w-xs rounded border border-gold/40 bg-[#071F1B] px-3 py-2 text-xs shadow-gold">
        <p className="mb-1 font-semibold text-gold-light">{row.name}</p>
        <p className="mb-2 text-muted">
          {t('dashboard.findingsCount', { count: row.total })}
        </p>
        {(row.by_severity || []).length === 0 ? (
          <p className="text-muted">—</p>
        ) : (
          <ul className="space-y-0.5">
            {row.by_severity.map((s) => (
              <li key={s.code} className="flex justify-between gap-4">
                <span>{locale === 'ar' && s.name_ar ? s.name_ar : s.name}</span>
                <span className="font-numeric text-gold-light">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="!p-3">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 font-numeric text-2xl font-semibold tabular-nums text-gold-light">
              {k.value ?? 0}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-text">{t('dashboard.severityDistribution')}</h2>
          {severityData.length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {severityData.map((_, i) => (
                      <Cell key={i} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#071F1B', border: '1px solid rgba(193,165,118,.45)', borderRadius: 4 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-text">{t('dashboard.findingsByProject')}</h2>
          {findingsByProject.length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={findingsByProject} margin={{ bottom: 8 }}>
                  <CartesianGrid stroke="rgba(193,165,118,.15)" vertical={false} />
                  <XAxis dataKey="label" stroke={MUTED} fontSize={10} interval={0} angle={-20} textAnchor="end" height={48} />
                  <YAxis stroke={MUTED} fontSize={11} allowDecimals={false} />
                  <Tooltip content={<FindingsTooltip />} cursor={{ fill: 'rgba(193,165,118,.08)' }} />
                  <Bar dataKey="total" name={t('dashboard.findings')} fill={GOLD} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-text">{t('dashboard.projectStatus')}</h2>
          {statusData.length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <CartesianGrid stroke="rgba(193,165,118,.15)" vertical={false} />
                  <XAxis dataKey="name" stroke={MUTED} fontSize={11} />
                  <YAxis stroke={MUTED} fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#071F1B', border: '1px solid rgba(193,165,118,.45)' }} />
                  <Bar dataKey="value" fill={GOLD2} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('dashboard.myWork')}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">{t('dashboard.openTasks')}</span><span>{data.my_work_summary?.open_tasks ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t('dashboard.openPhases')}</span><span>{data.my_work_summary?.open_phases ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t('common.overdue')}</span><span className="text-error">{data.my_work_summary?.overdue ?? 0}</span></div>
          </div>
          <Link to="/my-work" className="mt-3 inline-block text-xs text-gold hover:underline">{t('common.viewAll')}</Link>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">{t('dashboard.assessmentProgress')}</h2>
          <div className="space-y-3">
            {(data.assessment_progress || []).slice(0, 5).map((p) => (
              <div key={p.project_id}>
                <div className="mb-1 flex justify-between text-xs">
                  <Link to={`/projects/${p.project_id}`} className="text-text hover:text-gold">{p.name}</Link>
                  <span className="text-muted">{Math.round(p.progress)}%</span>
                </div>
                <ProgressBar value={p.progress} />
              </div>
            ))}
            {(data.assessment_progress || []).length === 0 && <EmptyState title={t('common.empty')} />}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('dashboard.teamWorkload')}</h2>
          <div className="space-y-2">
            {(data.team_workload || []).map((u) => (
              <div key={u.user_id} className="flex items-center justify-between rounded border border-line/60 bg-panel px-3 py-2 text-sm">
                <span>{u.name}</span>
                <span className="text-muted">{u.open_tasks} · <span className="text-error">{u.overdue}</span></span>
              </div>
            ))}
            {(data.team_workload || []).length === 0 && <EmptyState title={t('common.empty')} />}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('dashboard.upcomingDeadlines')}</h2>
          <div className="space-y-2">
            {(data.upcoming_deadlines || []).map((d) => (
              <div key={`${d.type}-${d.id}`} className="flex justify-between gap-2 border-b border-line/40 py-2 text-sm last:border-0">
                <span className="truncate">{d.title}</span>
                <span className="shrink-0 text-xs text-muted">{formatDate(d.due_date, locale)}</span>
              </div>
            ))}
            {(data.upcoming_deadlines || []).length === 0 && <EmptyState title={t('common.empty')} />}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('dashboard.recentFindings')}</h2>
          <div className="space-y-2">
            {(data.recent_findings || []).map((f) => (
              <Link key={f.id} to={`/findings/${f.id}`} className="flex items-center justify-between gap-2 rounded border border-line/50 px-3 py-2 hover:bg-panel">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{f.human_id} — {f.title}</p>
                </div>
                <SeverityBadge name={bilingualName(f.severity, locale)} colorToken={f.severity?.color_token} />
              </Link>
            ))}
            {(data.recent_findings || []).length === 0 && <EmptyState title={t('common.empty')} />}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('dashboard.recentActivity')}</h2>
          <div className="space-y-2">
            {(data.recent_activity || []).map((a) => (
              <div key={a.id} className="border-b border-line/40 py-2 text-sm last:border-0">
                <div className="flex justify-between gap-2">
                  <span className="text-text">{a.action}</span>
                  <StatusBadge status={a.entity} />
                </div>
                <p className="text-xs text-muted">{formatDate(a.created_at, locale)} · {a.user?.full_name || '—'}</p>
              </div>
            ))}
            {(data.recent_activity || []).length === 0 && <EmptyState title={t('common.empty')} />}
          </div>
        </Card>
      </div>
    </div>
  )
}
