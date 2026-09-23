import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { lookupsApi, projectsApi, teamApi, toolsApi } from '@/api'
import { EvidenceUploadButton } from '@/components/EvidenceUploadButton'
import { PhaseWeightBar } from '@/components/PhaseWeightBar'
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
  StatusBadge,
  Textarea,
} from '@/pages/_shared'
import { bilingualName, cn, formatDate } from '@/utils/cn'
import { phaseOrder } from '@/utils/apiNormalize'
import { phaseStatusPayload } from '@/utils/phaseStatus'
import {
  daysRemainingFromToday,
  equalWeights,
  normalizeWeights,
  setWeightIndependent,
  scheduleDateRanges,
} from '@/utils/phaseWeights'
import { useApiError } from '@/hooks/useApiError'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { Locale, PhaseTool, Project, ProjectPhase } from '@/types'

const PROJECT_STATUSES = ['planned', 'active', 'on_hold', 'completed', 'cancelled']
const PHASE_STATUSES = ['pending', 'in_progress', 'blocked', 'completed', 'skipped']
const TOOL_USAGE = ['unused', 'in_use', 'used'] as const

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { can, user } = useAuth()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({})

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  })

  const canEdit =
    can('admin.all') || can('project.manage') || String(data?.owner_id) === String(user?.id)
  const canDeleteProject = can('admin.all') || can('project.delete')
  const canManagePhases = can('admin.all') || can('phase.manage')

  const updateProject = useMutation({
    mutationFn: (payload: Record<string, unknown>) => projectsApi.update(id, payload as Partial<Project>),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', id] })
      setEditOpen(false)
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const updatePhase = useMutation({
    mutationFn: ({
      phaseId,
      status,
      status_reason,
    }: {
      phaseId: string
      status: string
      status_reason?: string
    }) => projectsApi.updatePhase(id, phaseId, { status, status_reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', id] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const updateTool = useMutation({
    mutationFn: ({
      phaseId,
      toolLinkId,
      usage_status,
    }: {
      phaseId: string
      toolLinkId: string
      usage_status: string
    }) => projectsApi.updatePhaseTool(id, phaseId, toolLinkId, { usage_status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', id] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const deletePhase = useMutation({
    mutationFn: (phaseId: string) => projectsApi.deletePhase(id, phaseId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', id] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const deleteProject = useMutation({
    mutationFn: () => projectsApi.remove(id),
    onSuccess: () => {
      toast.success(t('toast.deleted'))
      navigate('/projects')
    },
    onError: (err) => toast.error(getError(err)),
  })

  if (isLoading) return <Skeleton className="h-64" />
  if (isError || !data) return <ErrorState message={getError(error)} onRetry={() => void refetch()} />

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={data.name}
        subtitle={data.description || t('projects.detail')}
        backTo="/projects"
        backLabel={t('common.back')}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                {t('common.edit')}
              </Button>
            )}
            <Link to={`/projects/${data.id}/timeline`}>
              <Button variant="secondary">{t('projects.viewTimeline')}</Button>
            </Link>
            {canDeleteProject && (
              <Button
                variant="danger"
                loading={deleteProject.isPending}
                onClick={() => {
                  if (window.confirm(t('projects.confirmDelete'))) {
                    deleteProject.mutate()
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
        <Card className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={data.status} />
            {data.priority && <StatusBadge status={data.priority} />}
            {data.project_type && (
              <span className="text-xs text-muted">{bilingualName(data.project_type, locale)}</span>
            )}
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>{t('common.progress')}</span>
              <span>{Math.round(data.progress ?? 0)}%</span>
            </div>
            <ProgressBar value={data.progress ?? 0} />
            <p className="mt-1 text-[11px] text-muted">{t('projects.progressComputed')}</p>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Meta label={t('common.owner')} value={data.owner?.full_name} />
            <Meta label={t('common.client')} value={data.client || (data as { client_name?: string }).client_name} />
            <Meta label={t('common.environment')} value={data.environment} />
            <Meta label={t('common.dueDate')} value={formatDate(data.due_date, locale)} />
            <Meta label={t('common.workflow')} value={bilingualName(data.workflow, locale)} />
            <Meta label={t('common.startDate')} value={formatDate(data.start_date, locale)} />
          </dl>
          {(data.scope_in || data.scope_out || data.rules_of_engagement) && (
            <div className="space-y-2 border-t border-line pt-3 text-sm">
              {data.scope_in && (
                <div>
                  <p className="text-xs text-muted">{t('common.scopeIn')}</p>
                  <p className="whitespace-pre-wrap">{data.scope_in}</p>
                </div>
              )}
              {data.scope_out && (
                <div>
                  <p className="text-xs text-muted">{t('common.scopeOut')}</p>
                  <p className="whitespace-pre-wrap">{data.scope_out}</p>
                </div>
              )}
              {data.rules_of_engagement && (
                <div>
                  <p className="text-xs text-muted">{t('common.roe')}</p>
                  <p className="whitespace-pre-wrap">{data.rules_of_engagement}</p>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t('projects.members')}</h2>
          <ul className="space-y-2 text-sm">
            {(data.members || []).map((m) => {
              const roleLabel =
                bilingualName(
                  {
                    name_en: m.user?.role_name_en || m.user?.role?.name_en,
                    name_ar: m.user?.role_name_ar || m.user?.role?.name_ar,
                  },
                  locale,
                ) ||
                m.user?.role_code ||
                m.role ||
                null
              return (
                <li key={m.id} className="rounded border border-line/50 px-2 py-1.5">
                  <p className="font-medium">{m.user?.full_name || m.user_id}</p>
                  {roleLabel && <p className="text-xs text-muted">{roleLabel}</p>}
                </li>
              )
            })}
            {!(data.members || []).length && <EmptyState title={t('common.empty')} />}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t('projects.phases')}</h2>
        {!(data.phases || []).length ? (
          <EmptyState title={t('projects.noPhases')} />
        ) : (
          <div className="space-y-2">
            {data.phases!.map((phase) => {
              const canUpdatePhase = canManagePhases
              const canAttachEvidence =
                can('admin.all') ||
                can('project.manage') ||
                String(phase.assignee_id) === String(user?.id)
              const phaseId = String(phase.id)
              const expanded = !!expandedPhases[phaseId]
              const tools = phase.tools || []
              return (
                <div key={phase.id} className="rounded border border-line bg-panel">
                  <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => togglePhase(phaseId)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-start"
                    >
                      <span className="mt-0.5 text-muted">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {phaseOrder(phase)}. {bilingualName(phase, locale)}
                        </p>
                        <p className="text-xs text-muted">
                          {phase.assignee?.full_name || t('common.unassigned')} ·{' '}
                          {formatDateRange(phase.planned_start, phase.planned_end, locale)}
                        </p>
                        <PhaseMetaRow phase={phase} t={t} />
                        <p className="mt-1 text-xs text-muted">
                          {t('timeline.findingsCount', { count: phase.findings_count ?? 0 })}
                        </p>
                      </div>
                    </button>
                    <div className="flex w-full flex-col items-stretch gap-2 self-stretch sm:w-auto sm:min-w-[9.5rem] sm:self-center sm:ms-auto">
                      {canUpdatePhase ? (
                        <Select
                          className="!h-8 !w-full"
                          value={phase.status || 'pending'}
                          onChange={(e) => {
                            const payload = phaseStatusPayload(e.target.value, t)
                            if (!payload) return
                            updatePhase.mutate({ phaseId, ...payload })
                          }}
                        >
                          {PHASE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`status.${s}`)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <StatusBadge status={phase.status} />
                      )}
                      {canAttachEvidence && (
                        <EvidenceUploadButton
                          projectId={data.id}
                          phaseId={phase.id}
                          compact
                          className="!w-full justify-center"
                          label={t('evidence.attach')}
                        />
                      )}
                      {canManagePhases && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          className="!w-full justify-center"
                          loading={deletePhase.isPending}
                          onClick={() => {
                            if (window.confirm(t('projects.confirmDeletePhase'))) {
                              deletePhase.mutate(phaseId)
                            }
                          }}
                        >
                          {t('common.delete')}
                        </Button>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-line/60 bg-panel-2/40 px-3 py-3">
                      {!tools.length ? (
                        <p className="text-xs text-muted">{t('tools.empty')}</p>
                      ) : (
                        <ul className="space-y-2">
                          {tools.map((tool) => (
                            <ToolUsageRow
                              key={String(tool.id)}
                              tool={tool}
                              locale={locale}
                              t={t}
                              canUpdate={canUpdatePhase}
                              pending={updateTool.isPending}
                              onChange={(usage_status) =>
                                updateTool.mutate({
                                  phaseId,
                                  toolLinkId: String(tool.id),
                                  usage_status,
                                })
                              }
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {editOpen && (
        <EditProjectModal
          project={data}
          saving={updateProject.isPending}
          onClose={() => setEditOpen(false)}
          onSave={(payload) => updateProject.mutate(payload)}
        />
      )}
    </div>
  )
}

/** `YYYY-MM-DD` slice suitable for <input type="date"> and the phaseWeights helpers. */
function toDateInput(value?: string | null): string {
  return value ? String(value).slice(0, 10) : ''
}

/** Inclusive day count between two ISO dates. */
function daysBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null
  const from = new Date(`${toDateInput(start)}T00:00:00`).getTime()
  const to = new Date(`${toDateInput(end)}T00:00:00`).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.max(0, Math.round((to - from) / 86400000) + 1)
}

function formatDateRange(start?: string | null, end?: string | null, locale: Locale = 'en'): string {
  if (!start && !end) return '—'
  if (!start || !end) return formatDate(start || end, locale)
  return `${formatDate(start, locale)} → ${formatDate(end, locale)}`
}

function remainingLabel(
  days: number | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (days == null) return null
  return days < 0
    ? t('timeline.daysOverdue', { count: Math.abs(days) })
    : t('timeline.daysRemaining', { count: days })
}

function PhaseMetaRow({
  phase,
  t,
}: {
  phase: ProjectPhase
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const allocated = phase.days_allocated ?? daysBetween(phase.planned_start, phase.planned_end)
  const remaining =
    phase.days_remaining ??
    daysRemainingFromToday(
      toDateInput(phase.planned_start) || null,
      toDateInput(phase.planned_end) || null,
      phase.status,
    )

  const parts: string[] = []
  if (phase.weight_percent != null) parts.push(t('timeline.weight', { percent: phase.weight_percent }))
  if (allocated != null) parts.push(t('timeline.daysAllocated', { count: allocated }))
  const remainingText = remainingLabel(remaining, t)
  if (remainingText) parts.push(remainingText)
  if (!parts.length) return null
  return <p className="mt-0.5 text-[11px] text-muted">{parts.join(' · ')}</p>
}

function ToolUsageRow({
  tool,
  locale,
  t,
  canUpdate,
  pending,
  onChange,
}: {
  tool: PhaseTool
  locale: 'en' | 'ar'
  t: (key: string) => string
  canUpdate: boolean
  pending: boolean
  onChange: (status: string) => void
}) {
  const current = (tool.usage_status || 'unused').toLowerCase()
  return (
    <li className="flex flex-col gap-2 rounded border border-line/50 bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{bilingualName(tool, locale)}</p>
        {tool.category && <p className="text-[11px] text-muted">{tool.category}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TOOL_USAGE.map((status) => {
          const active = current === status
          return (
            <button
              key={status}
              type="button"
              disabled={!canUpdate || pending || active}
              onClick={() => onChange(status)}
              className={cn(
                'rounded border px-2.5 py-1 text-[11px] font-medium transition-colors',
                status === 'unused' &&
                  (active
                    ? 'border-muted bg-muted/30 text-muted'
                    : 'border-line text-muted hover:border-muted'),
                status === 'in_use' &&
                  (active
                    ? 'border-gold bg-gold/20 text-gold-light'
                    : 'border-line text-muted hover:border-gold hover:text-gold-light'),
                status === 'used' &&
                  (active
                    ? 'border-success/50 bg-success/15 text-success'
                    : 'border-line text-muted hover:border-success/50 hover:text-success'),
                (!canUpdate || pending) && 'cursor-default opacity-80',
              )}
            >
              {t(`tools.usage.${status}`)}
            </button>
          )
        })}
      </div>
    </li>
  )
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

type PhaseDraft = {
  phase_id: string
  weight: number
  assignee_id: string
  tool_ids: string[]
}

/** Active catalog tool, or a tool already linked to a phase (possibly deactivated since). */
type ToolOption = {
  id: string
  name_en?: string | null
  name_ar?: string | null
  name?: string
  category_id?: string | null
  inactive?: boolean
}

function initialForm(project: Project) {
  return {
    name: project.name || '',
    description: project.description || '',
    status: project.status || 'planned',
    priority: project.priority || 'medium',
    client_name: project.client || (project as { client_name?: string }).client_name || '',
    environment: project.environment || '',
    start_date: toDateInput(project.start_date),
    due_date: toDateInput(project.due_date),
    scope_in: project.scope_in || '',
    scope_out: project.scope_out || '',
    rules_of_engagement: project.rules_of_engagement || '',
  }
}

function initialMemberIds(project: Project): string[] {
  return (project.members || []).map((m) => String(m.user_id ?? m.user?.id ?? '')).filter(Boolean)
}

function initialPhaseDrafts(phases: ProjectPhase[]): PhaseDraft[] {
  const weights = phases.some((p) => Number(p.weight_percent) > 0)
    ? normalizeWeights(phases.map((p) => ({ weight_percent: Number(p.weight_percent) || 0 })))
    : equalWeights(phases.length)
  return phases.map((phase, index) => ({
    phase_id: String(phase.id),
    weight: weights[index] ?? 0,
    assignee_id: phase.assignee_id != null ? String(phase.assignee_id) : '',
    tool_ids: (phase.tools || []).map((link) => String(link.tool_id)),
  }))
}

function EditProjectModal({
  project,
  saving,
  onClose,
  onSave,
}: {
  project: Project
  saving: boolean
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => void
}) {
  const { t, i18n } = useTranslation()
  const locale: Locale = i18n.language.startsWith('ar') ? 'ar' : 'en'

  const phases = useMemo(
    () => [...(project.phases || [])].sort((a, b) => phaseOrder(a) - phaseOrder(b)),
    [project.phases],
  )

  const [form, setForm] = useState(() => initialForm(project))
  const [memberIds, setMemberIds] = useState<string[]>(() => initialMemberIds(project))
  const [drafts, setDrafts] = useState<PhaseDraft[]>(() => initialPhaseDrafts(phases))
  const [activePhaseId, setActivePhaseId] = useState<string | null>(
    phases.length ? String(phases[0].id) : null,
  )
  // Once weights or project dates are touched, phase dates come from the live preview
  // instead of the planned dates currently stored on the phase.
  const [scheduleDirty, setScheduleDirty] = useState(false)
  const [toolQuery, setToolQuery] = useState('')
  const [toolCategory, setToolCategory] = useState('')

  const { data: usersPage } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => teamApi.users({ page_size: 100 }),
  })
  const { data: toolsPage } = useQuery({
    queryKey: ['tools', 'active'],
    queryFn: () => toolsApi.list({ page_size: 200, active_only: true }),
  })
  const { data: toolCategories } = useQuery({
    queryKey: ['lookups', 'tool-categories'],
    queryFn: () => lookupsApi.get('tool-categories'),
  })

  const users = usersPage?.items || []
  const toolItems = toolsPage?.items

  const phaseMap = useMemo(() => {
    const map = new Map<string, ProjectPhase>()
    for (const phase of phases) map.set(String(phase.id), phase)
    return map
  }, [phases])

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const category of toolCategories || []) {
      map.set(String(category.id), bilingualName(category, locale))
    }
    return map
  }, [toolCategories, locale])

  const toolOptions = useMemo<ToolOption[]>(() => {
    const map = new Map<string, ToolOption>()
    for (const tool of toolItems || []) {
      if (tool.is_active === false) continue
      map.set(String(tool.id), {
        id: String(tool.id),
        name_en: tool.name_en,
        name_ar: tool.name_ar,
        name: tool.name,
        category_id: tool.category_id ? String(tool.category_id) : null,
      })
    }
    // Keep already-linked tools selectable even if they are no longer active.
    for (const phase of phases) {
      for (const link of phase.tools || []) {
        const key = String(link.tool_id)
        if (map.has(key)) continue
        map.set(key, { id: key, name_en: link.name_en, name_ar: link.name_ar, inactive: true })
      }
    }
    return [...map.values()].sort((a, b) =>
      (a.name_en || a.name || '').localeCompare(b.name_en || b.name || ''),
    )
  }, [toolItems, phases])

  const filteredTools = useMemo(() => {
    const query = toolQuery.trim().toLowerCase()
    return toolOptions.filter((tool) => {
      if (toolCategory && String(tool.category_id || '') !== toolCategory) return false
      if (!query) return true
      return `${tool.name_en || ''} ${tool.name_ar || ''} ${tool.name || ''}`
        .toLowerCase()
        .includes(query)
    })
  }, [toolOptions, toolQuery, toolCategory])

  const previewRanges = useMemo(
    () =>
      scheduleDateRanges(
        form.start_date || undefined,
        form.due_date || undefined,
        drafts.map((d) => d.weight),
      ),
    [form.start_date, form.due_date, drafts],
  )

  const segments = useMemo(
    () =>
      drafts.map((draft) => {
        const phase = phaseMap.get(draft.phase_id)
        return {
          id: draft.phase_id,
          label: `${phaseOrder(phase)}. ${bilingualName(phase, locale)}`,
          weight: draft.weight,
        }
      }),
    [drafts, phaseMap, locale],
  )

  const weightSum = drafts.reduce((sum, draft) => sum + draft.weight, 0)

  const setStartDate = (value: string) => {
    setForm((f) => ({ ...f, start_date: value }))
    setScheduleDirty(true)
  }

  const setDueDate = (value: string) => {
    setForm((f) => ({ ...f, due_date: value }))
    setScheduleDirty(true)
  }

  const changeWeight = (phaseId: string, weight: number) => {
    setDrafts((prev) => {
      const index = prev.findIndex((draft) => draft.phase_id === phaseId)
      if (index < 0) return prev
      const next = setWeightIndependent(
        prev.map((draft) => draft.weight),
        index,
        weight,
      )
      return prev.map((draft, i) => ({ ...draft, weight: next[i] ?? draft.weight }))
    })
    setScheduleDirty(true)
  }

  const setDraft = (phaseId: string, patch: Partial<PhaseDraft>) =>
    setDrafts((prev) =>
      prev.map((draft) => (draft.phase_id === phaseId ? { ...draft, ...patch } : draft)),
    )

  const toggleTool = (phaseId: string, toolId: string) =>
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.phase_id === phaseId
          ? {
              ...draft,
              tool_ids: draft.tool_ids.includes(toolId)
                ? draft.tool_ids.filter((id) => id !== toolId)
                : [...draft.tool_ids, toolId],
            }
          : draft,
      ),
    )

  const toNumbers = (values: string[]) =>
    values.map((value) => Number(value)).filter((value) => Number.isFinite(value))

  const submit = () =>
    onSave({
      name: form.name.trim(),
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      client_name: form.client_name || null,
      environment: form.environment || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      scope_in: form.scope_in || null,
      scope_out: form.scope_out || null,
      rules_of_engagement: form.rules_of_engagement || null,
      member_ids: toNumbers(memberIds),
      // planned_start/planned_end are omitted so the backend reschedules every
      // phase from the submitted weights and the project start/due dates.
      phase_updates: drafts.map((draft) => ({
        phase_id: Number(draft.phase_id),
        weight_percent: draft.weight,
        assignee_id: draft.assignee_id ? Number(draft.assignee_id) : null,
        tool_ids: toNumbers(draft.tool_ids),
      })),
    })

  return (
    <Modal
      open
      onClose={onClose}
      title={t('projects.editTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={saving} disabled={!form.name.trim()} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="max-h-[62vh] space-y-4 overflow-y-auto pe-1">
        <Field label={t('common.name')} required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label={t('common.description')}>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.status')}>
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`, { defaultValue: s })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.priority')}>
            <Select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {['low', 'medium', 'high', 'critical'].map((s) => (
                <option key={s} value={s}>
                  {t(`common.${s}`, { defaultValue: s })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.client')}>
            <Input
              value={form.client_name}
              onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
            />
          </Field>
          <Field label={t('common.environment')}>
            <Input
              value={form.environment}
              onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
            />
          </Field>
          <Field label={t('common.startDate')}>
            <Input type="date" value={form.start_date} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label={t('common.dueDate')}>
            <Input type="date" value={form.due_date} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <Field label={t('common.scopeIn')}>
          <Textarea
            value={form.scope_in}
            onChange={(e) => setForm((f) => ({ ...f, scope_in: e.target.value }))}
          />
        </Field>
        <Field label={t('common.scopeOut')}>
          <Textarea
            value={form.scope_out}
            onChange={(e) => setForm((f) => ({ ...f, scope_out: e.target.value }))}
          />
        </Field>
        <Field label={t('common.roe')}>
          <Textarea
            value={form.rules_of_engagement}
            onChange={(e) => setForm((f) => ({ ...f, rules_of_engagement: e.target.value }))}
          />
        </Field>

        <Field label={t('common.members')}>
          <Select
            multiple
            className="!h-auto min-h-[130px] py-2"
            value={memberIds}
            onChange={(e) =>
              setMemberIds(Array.from(e.target.selectedOptions).map((option) => option.value))
            }
          >
            {users.map((u) => (
              <option key={String(u.id)} value={String(u.id)}>
                {u.full_name} ({u.username})
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('projects.phases')}</h3>
            <span className={cn('text-[11px]', weightSum === 100 ? 'text-muted' : 'text-warning')}>
              {t('projects.wizard.weightSum', { sum: weightSum })}
            </span>
          </div>

          {!drafts.length ? (
            <p className="text-xs text-muted">{t('projects.noPhases')}</p>
          ) : (
            <>
              <p className="text-[11px] text-muted">
                {t('projects.wizard.weightIndependent', {
                  defaultValue:
                    'Each phase weight is independent. Max for a phase is what remains after the others (100 − others).',
                })}
              </p>

              <PhaseWeightBar
                segments={segments}
                activeId={activePhaseId}
                onSelect={setActivePhaseId}
                onChangeWeight={changeWeight}
              />

              <div className="space-y-2">
                {drafts.map((draft, index) => {
                  const phase = phaseMap.get(draft.phase_id)
                  if (!phase) return null
                  const expanded = activePhaseId === draft.phase_id
                  const preview = previewRanges[index]
                  const plannedStart = toDateInput(phase.planned_start)
                  const plannedEnd = toDateInput(phase.planned_end)
                  const keepPlanned = !scheduleDirty && !!plannedStart && !!plannedEnd
                  const rangeStart = keepPlanned ? plannedStart : preview?.start || ''
                  const rangeEnd = keepPlanned ? plannedEnd : preview?.end || ''
                  const allocated = keepPlanned
                    ? daysBetween(rangeStart, rangeEnd)
                    : preview?.days ?? null
                  const meta = [
                    t('timeline.weight', { percent: draft.weight }),
                    allocated != null ? t('timeline.daysAllocated', { count: allocated }) : null,
                    remainingLabel(
                      daysRemainingFromToday(rangeStart || null, rangeEnd || null, phase.status),
                      t,
                    ),
                  ].filter((part): part is string => !!part)

                  return (
                    <div
                      key={draft.phase_id}
                      className={cn(
                        'rounded border',
                        expanded ? 'border-gold/50 bg-panel' : 'border-line/60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setActivePhaseId(draft.phase_id)}
                        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-start"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {phaseOrder(phase)}. {bilingualName(phase, locale)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {t('projects.wizard.dateRange', { defaultValue: 'Date range' })}:{' '}
                            {formatDateRange(rangeStart, rangeEnd, locale)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">{meta.join(' · ')}</p>
                        </div>
                        <span className="mt-0.5 shrink-0 text-muted">
                          {expanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </span>
                      </button>

                      {expanded && (
                        <div className="space-y-3 border-t border-line/60 px-3 py-3">
                          <Field label={t('common.assignee')}>
                            <Select
                              value={draft.assignee_id}
                              onChange={(e) =>
                                setDraft(draft.phase_id, { assignee_id: e.target.value })
                              }
                            >
                              <option value="">{t('common.unassigned')}</option>
                              {users.map((u) => (
                                <option key={String(u.id)} value={String(u.id)}>
                                  {u.full_name}
                                </option>
                              ))}
                            </Select>
                          </Field>

                          <div className="space-y-2">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-xs font-medium text-muted">
                                {t('projects.wizard.phaseTools', { defaultValue: 'Phase tools' })}
                              </p>
                              <span className="text-[11px] text-muted">
                                {draft.tool_ids.length} {t('common.of')} {toolOptions.length}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                className="!h-8 text-xs"
                                placeholder={t('common.search')}
                                value={toolQuery}
                                onChange={(e) => setToolQuery(e.target.value)}
                              />
                              <Select
                                className="!h-8 text-xs"
                                value={toolCategory}
                                onChange={(e) => setToolCategory(e.target.value)}
                              >
                                <option value="">{t('common.all')}</option>
                                {(toolCategories || []).map((category) => (
                                  <option key={String(category.id)} value={String(category.id)}>
                                    {bilingualName(category, locale)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <PhaseToolPicker
                              options={toolOptions}
                              filtered={filteredTools}
                              selected={draft.tool_ids}
                              categoryNames={categoryNames}
                              locale={locale}
                              t={t}
                              onToggle={(toolId) => toggleTool(draft.phase_id, toolId)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function PhaseToolPicker({
  options,
  filtered,
  selected,
  categoryNames,
  locale,
  t,
  onToggle,
}: {
  options: ToolOption[]
  filtered: ToolOption[]
  selected: string[]
  categoryNames: Map<string, string>
  locale: Locale
  t: (key: string, opts?: Record<string, unknown>) => string
  onToggle: (toolId: string) => void
}) {
  const listed = new Set(filtered.map((tool) => tool.id))
  // Selected tools hidden by the current filter still need to be unselectable.
  const extras = options.filter((tool) => selected.includes(tool.id) && !listed.has(tool.id))
  const visible = [...filtered, ...extras]

  if (!visible.length) return <p className="text-xs text-muted">{t('tools.empty')}</p>

  return (
    <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-line/60 bg-panel-2/40 p-2">
      {visible.map((tool) => (
        <label key={tool.id} className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-[var(--color-gold)]"
            checked={selected.includes(tool.id)}
            onChange={() => onToggle(tool.id)}
          />
          <span className="truncate">{bilingualName(tool, locale)}</span>
          <span className="ms-auto shrink-0 text-[10px] text-muted">
            {tool.inactive
              ? t('common.inactive')
              : categoryNames.get(String(tool.category_id || '')) || ''}
          </span>
        </label>
      ))}
    </div>
  )
}
