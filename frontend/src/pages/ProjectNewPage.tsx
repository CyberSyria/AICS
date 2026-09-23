import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { lookupsApi, projectsApi, teamApi, toolsApi, workflowsApi } from '@/api'
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/pages/_shared'
import { bilingualName, cn, formatDate } from '@/utils/cn'
import { phaseOrder } from '@/utils/apiNormalize'
import { PhaseWeightBar } from '@/components/PhaseWeightBar'
import {
  daysRemainingFromToday,
  equalWeights,
  setWeightIndependent,
  scheduleDateRanges,
} from '@/utils/phaseWeights'
import { useToast } from '@/contexts/ToastContext'
import { useApiError } from '@/hooks/useApiError'
import type { ProjectCreateWizard } from '@/types'

const WIZARD_KEY = 'samp_project_wizard'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  project_type_id: z.string().min(1),
  priority: z.string().optional(),
  client: z.string().optional(),
  environment: z.string().optional(),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  workflow_id: z.string().min(1),
  scope_in: z.string().optional(),
  scope_out: z.string().optional(),
  rules_of_engagement: z.string().optional(),
  member_ids: z.array(z.string()).optional(),
  assets: z
    .array(
      z.object({
        name: z.string().min(1),
        asset_type_id: z.string().min(1),
        value: z.string().min(1),
        environment: z.string().optional(),
      }),
    )
    .optional(),
  phase_assignments: z
    .array(
      z.object({
        workflow_phase_id: z.string().optional(),
        phase_order: z.number(),
        selected: z.boolean().optional(),
        weight_percent: z.number().min(0).max(100).optional(),
        assignee_id: z.string().optional(),
        tool_ids: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  tags: z.array(z.string()).optional(),
})

type FormValues = z.infer<typeof schema>
type PhaseAssignment = NonNullable<FormValues['phase_assignments']>[number]

const steps = [
  { key: 'step1', fields: ['name'] as const },
  { key: 'step2', fields: ['project_type_id'] as const },
  { key: 'step3', fields: ['workflow_id'] as const },
  { key: 'step4', fields: [] as const },
  { key: 'step5', fields: [] as const },
  { key: 'step6', fields: [] as const },
  { key: 'step7', fields: [] as const },
]

function assignmentKey(pa: PhaseAssignment): string {
  return pa.workflow_phase_id ? String(pa.workflow_phase_id) : `order-${pa.phase_order}`
}

export function ProjectNewPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const navigate = useNavigate()
  const toast = useToast()
  const getError = useApiError()
  const [step, setStep] = useState(0)
  const [activeWeightId, setActiveWeightId] = useState<string | null>(null)

  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(WIZARD_KEY) || 'null') as FormValues | null
    } catch {
      return null
    }
  }, [])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: saved || {
      name: '',
      description: '',
      project_type_id: '',
      priority: 'medium',
      workflow_id: '',
      assets: [],
      member_ids: [],
      phase_assignments: [],
    },
    mode: 'onChange',
  })

  const assetsFA = useFieldArray({ control: form.control, name: 'assets' })
  const values = form.watch()

  useEffect(() => {
    localStorage.setItem(WIZARD_KEY, JSON.stringify(values))
  }, [values])

  const { data: projectTypes } = useQuery({ queryKey: ['lookups', 'project-types'], queryFn: () => lookupsApi.get('project-types') })
  const { data: assetTypes } = useQuery({ queryKey: ['lookups', 'asset-types'], queryFn: () => lookupsApi.get('asset-types') })
  const { data: workflows } = useQuery({ queryKey: ['workflows', 'all'], queryFn: () => workflowsApi.list({ page_size: 100, is_active: true }) })
  const { data: users } = useQuery({ queryKey: ['users', 'all'], queryFn: () => teamApi.users({ page_size: 100 }) })
  // Backend defaults active_only=true, so this returns active tools only.
  const { data: tools } = useQuery({ queryKey: ['tools', 'active'], queryFn: () => toolsApi.list({ page_size: 200 }) })
  const workflowItems = workflows?.items || []
  const selectedWorkflow = workflowItems.find((w) => String(w.id) === String(values.workflow_id))
  const workflowPhases = selectedWorkflow?.phases || []
  const activeTools = useMemo(() => (tools?.items || []).filter((tool) => tool.is_active !== false), [tools])

  const assignments = useMemo(() => values.phase_assignments || [], [values.phase_assignments])

  const selectedEntries = useMemo(
    () =>
      assignments
        .map((pa, index) => ({ pa, index }))
        .filter(({ pa }) => pa.selected !== false),
    [assignments],
  )

  const weightSum = useMemo(
    () => selectedEntries.reduce((sum, { pa }) => sum + (Number(pa.weight_percent) || 0), 0),
    [selectedEntries],
  )

  const phaseFor = (pa: PhaseAssignment) =>
    workflowPhases.find(
      (p) => String(p.id) === String(pa.workflow_phase_id) || phaseOrder(p) === pa.phase_order,
    )

  const segments = useMemo(
    () =>
      selectedEntries.map(({ pa }) => {
        const phase = phaseFor(pa)
        return {
          id: assignmentKey(pa),
          label: phase ? bilingualName(phase, locale) : `#${pa.phase_order}`,
          weight: Number(pa.weight_percent) || 0,
        }
      }),
    [selectedEntries, workflowPhases, locale],
  )

  const dateRanges = useMemo(
    () => scheduleDateRanges(values.start_date, values.due_date, segments.map((s) => s.weight)),
    [values.start_date, values.due_date, segments],
  )

  const create = useMutation({
    mutationFn: (payload: ProjectCreateWizard) => projectsApi.create(payload),
    onSuccess: (project) => {
      localStorage.removeItem(WIZARD_KEY)
      toast.success(t('toast.created'))
      navigate(`/projects/${project.id}`)
    },
    onError: (err) => toast.error(getError(err)),
  })

  const next = async () => {
    const fields = steps[step].fields as unknown as (keyof FormValues)[]
    const ok = fields.length ? await form.trigger(fields) : true
    if (!ok) {
      toast.warning(t('common.validationError'))
      return
    }
    if (step === 2 && workflowPhases.length) {
      const weights = equalWeights(workflowPhases.length)
      form.setValue(
        'phase_assignments',
        workflowPhases.map((p, i) => ({
          workflow_phase_id: String(p.id),
          phase_order: phaseOrder(p),
          selected: true,
          weight_percent: weights[i],
          assignee_id: p.default_assignee_id ? String(p.default_assignee_id) : '',
          tool_ids: (
            p.tool_ids ||
            p.tools?.map((tool) => String(tool.id || (tool as { tool_id?: string }).tool_id)) ||
            []
          ).map(String),
        })),
      )
      setActiveWeightId(workflowPhases.length ? String(workflowPhases[0].id) : null)
    }
    if (step < steps.length - 1) setStep((s) => s + 1)
  }

  const back = () => setStep((s) => Math.max(0, s - 1))

  const finish = form.handleSubmit((data) => {
    const selected = (data.phase_assignments || []).filter((p) => p.selected !== false)
    create.mutate({
      ...data,
      member_ids: data.member_ids?.filter(Boolean),
      phase_assignments: selected.map((p) => ({
        workflow_phase_id: p.workflow_phase_id,
        phase_order: p.phase_order,
        selected: true,
        weight_percent: Math.max(0, Number(p.weight_percent) || 0),
        assignee_id: p.assignee_id || undefined,
        tool_ids: (p.tool_ids || []).filter(Boolean),
      })),
    })
  })

  const togglePhaseSelected = (index: number, checked: boolean) => {
    const list = [...(form.getValues('phase_assignments') || [])]
    list[index] = { ...list[index], selected: checked }
    const selectedIdx = list.map((p, i) => (p.selected !== false ? i : -1)).filter((i) => i >= 0)
    const weights = equalWeights(selectedIdx.length)
    selectedIdx.forEach((i, wi) => {
      list[i] = { ...list[i], weight_percent: weights[wi] }
    })
    form.setValue('phase_assignments', list)
    const stillActive = selectedIdx.some((i) => assignmentKey(list[i]) === activeWeightId)
    if (!stillActive) {
      setActiveWeightId(selectedIdx.length ? assignmentKey(list[selectedIdx[0]]) : null)
    }
  }

  const changeSegmentWeight = (id: string, weight: number) => {
    const list = [...(form.getValues('phase_assignments') || [])]
    const selectedIdx = list.map((p, i) => (p.selected !== false ? i : -1)).filter((i) => i >= 0)
    const pos = selectedIdx.findIndex((i) => assignmentKey(list[i]) === id)
    if (pos < 0) return
    const current = selectedIdx.map((i) => Number(list[i].weight_percent) || 0)
    const nextWeights = setWeightIndependent(current, pos, weight)
    selectedIdx.forEach((i, wi) => {
      list[i] = { ...list[i], weight_percent: nextWeights[wi] }
    })
    form.setValue('phase_assignments', list)
  }

  const togglePhaseTool = (index: number, toolId: string, checked: boolean) => {
    const list = [...(form.getValues('phase_assignments') || [])]
    const current = list[index]?.tool_ids || []
    const nextTools = checked
      ? Array.from(new Set([...current, toolId]))
      : current.filter((id) => id !== toolId)
    list[index] = { ...list[index], tool_ids: nextTools }
    form.setValue('phase_assignments', list)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <PageHeader
        title={t('projects.createTitle')}
        subtitle={t(`projects.wizard.${steps[step].key}Desc`)}
        backTo="/projects"
        backLabel={t('common.back')}
      />

      <div className="flex flex-wrap gap-1">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => i < step && setStep(i)}
            className={`rounded border px-2 py-1 text-[11px] ${i === step ? 'border-gold bg-ink-green text-gold-light' : i < step ? 'border-line text-text' : 'border-line/40 text-muted'}`}
          >
            {i + 1}. {t(`projects.wizard.${s.key}`)}
          </button>
        ))}
      </div>

      <Card>
        {step === 0 && (
          <div className="space-y-4">
            <Field label={t('common.name')} required>
              <Input {...form.register('name')} error={form.formState.errors.name && t('validation.required')} />
            </Field>
            <Field label={t('common.description')}>
              <Textarea {...form.register('description')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.client')}>
                <Input {...form.register('client')} />
              </Field>
              <Field label={t('common.environment')}>
                <Input {...form.register('environment')} />
              </Field>
              <Field label={t('common.startDate')}>
                <Input type="date" {...form.register('start_date')} />
              </Field>
              <Field label={t('common.dueDate')}>
                <Input type="date" {...form.register('due_date')} />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label={t('common.type')} required>
              <Select {...form.register('project_type_id')} error={form.formState.errors.project_type_id && t('validation.required')}>
                <option value="">{t('common.select')}</option>
                {(projectTypes || []).map((pt) => (
                  <option key={pt.id} value={pt.id}>{bilingualName(pt, locale)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.priority')}>
              <Select {...form.register('priority')}>
                {['low', 'medium', 'high', 'critical'].map((p) => (
                  <option key={p} value={p}>{t(`common.${p === 'critical' ? 'critical' : p}`, { defaultValue: p })}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label={t('common.workflow')} required>
              <Select {...form.register('workflow_id')} error={form.formState.errors.workflow_id && t('validation.required')}>
                <option value="">{t('common.select')}</option>
                {(workflowItems || []).map((w) => (
                  <option key={w.id} value={String(w.id)}>{bilingualName(w, locale)} (v{w.version})</option>
                ))}
              </Select>
            </Field>
            {workflowPhases.length > 0 && (
              <ul className="space-y-1 rounded border border-line bg-panel p-3 text-sm">
                {workflowPhases.map((p) => (
                  <li key={p.id} className="text-muted">{phaseOrder(p)}. {bilingualName(p, locale)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('nav.assets')}</h3>
              <Button type="button" variant="secondary" size="sm" onClick={() => assetsFA.append({ name: '', asset_type_id: '', value: '' })}>
                {t('projects.wizard.addAsset')}
              </Button>
            </div>
            {assetsFA.fields.map((field, index) => (
              <div key={field.id} className="grid gap-2 rounded border border-line p-3 sm:grid-cols-2">
                <Input placeholder={t('common.name')} {...form.register(`assets.${index}.name`)} />
                <Select {...form.register(`assets.${index}.asset_type_id`)}>
                  <option value="">{t('common.type')}</option>
                  {(assetTypes || []).map((at) => (
                    <option key={at.id} value={at.id}>{bilingualName(at, locale)}</option>
                  ))}
                </Select>
                <Input placeholder={t('common.value')} {...form.register(`assets.${index}.value`)} />
                <Input placeholder={t('common.environment')} {...form.register(`assets.${index}.environment`)} />
                <Button type="button" variant="ghost" size="sm" onClick={() => assetsFA.remove(index)}>{t('common.remove')}</Button>
              </div>
            ))}
            <Field label={t('common.scopeIn')}><Textarea {...form.register('scope_in')} /></Field>
            <Field label={t('common.scopeOut')}><Textarea {...form.register('scope_out')} /></Field>
            <Field label={t('common.roe')}><Textarea {...form.register('rules_of_engagement')} /></Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <Field label={t('common.members')}>
              <Select
                multiple
                className="!h-auto min-h-[120px] py-2"
                value={values.member_ids || []}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map((o) => o.value)
                  form.setValue('member_ids', opts)
                }}
              >
                {(users?.items || []).map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.full_name} ({u.username})</option>
                ))}
              </Select>
            </Field>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t('projects.wizard.selectPhases')}</h3>
              <p
                className={cn(
                  'text-xs',
                  weightSum === 100 ? 'text-muted' : 'text-warning',
                )}
              >
                {t('projects.wizard.weightSum', { sum: weightSum })}
                {weightSum !== 100 && (
                  <span className="ms-1">— {t('projects.wizard.weightSumHint')}</span>
                )}
              </p>

              {segments.length > 0 && (
                <div className="space-y-2 rounded border border-line bg-panel p-3">
                  <h4 className="text-xs font-medium text-muted">
                    {t('projects.wizard.weightBar', { defaultValue: 'Phase time distribution' })}
                  </h4>
                  <PhaseWeightBar
                    segments={segments}
                    activeId={activeWeightId}
                    onSelect={setActiveWeightId}
                    onChangeWeight={changeSegmentWeight}
                  />
                </div>
              )}

              {assignments.map((pa, index) => {
                const phase = phaseFor(pa)
                const isSelected = pa.selected !== false
                const key = assignmentKey(pa)
                const selectedPos = selectedEntries.findIndex((entry) => entry.index === index)
                const range = selectedPos >= 0 ? dateRanges[selectedPos] : undefined
                const remaining = range ? daysRemainingFromToday(range.start, range.end) : null
                const phaseToolIds = pa.tool_ids || []
                return (
                  <div
                    key={key}
                    className={cn(
                      'space-y-2 rounded border px-3 py-2',
                      isSelected && activeWeightId === key ? 'border-gold/60' : 'border-line/60',
                    )}
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-[var(--color-gold)]"
                        checked={isSelected}
                        onChange={(e) => togglePhaseSelected(index, e.target.checked)}
                      />
                      <span>
                        {phaseOrder(phase || { order: pa.phase_order })}.{' '}
                        {phase ? bilingualName(phase, locale) : `#${pa.phase_order}`}
                      </span>
                      {isSelected && (
                        <span className="ms-auto text-xs font-medium text-gold-light">
                          {pa.weight_percent ?? 0}%
                        </span>
                      )}
                    </label>

                    {isSelected && (
                      <div className="space-y-3">
                        {range && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                            <span>
                              {t('projects.wizard.dateRange', {
                                start: formatDate(range.start, locale),
                                end: formatDate(range.end, locale),
                                defaultValue: `from ${formatDate(range.start, locale)} to ${formatDate(range.end, locale)}`,
                              })}
                            </span>
                            <span>{t('timeline.daysAllocated', { count: range.days })}</span>
                            {remaining != null && (
                              <span className={cn(remaining < 0 && 'text-warning')}>
                                {remaining < 0
                                  ? t('timeline.daysOverdue', { count: Math.abs(remaining) })
                                  : t('timeline.daysRemaining', { count: remaining })}
                              </span>
                            )}
                          </div>
                        )}

                        <Field label={t('common.assignee')}>
                          <Select {...form.register(`phase_assignments.${index}.assignee_id`)}>
                            <option value="">{t('common.unassigned')}</option>
                            {(users?.items || []).map((u) => (
                              <option key={u.id} value={String(u.id)}>{u.full_name}</option>
                            ))}
                          </Select>
                        </Field>

                        <Field label={t('projects.wizard.phaseTools', { defaultValue: 'Phase tools' })}>
                          {activeTools.length === 0 ? (
                            <p className="text-xs text-muted">{t('common.empty')}</p>
                          ) : (
                            <div className="grid max-h-40 gap-1 overflow-y-auto rounded border border-line bg-panel p-2 sm:grid-cols-2">
                              {activeTools.map((tool) => {
                                const toolId = String(tool.id)
                                return (
                                  <label key={toolId} className="flex items-center gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      className="accent-[var(--color-gold)]"
                                      checked={phaseToolIds.includes(toolId)}
                                      onChange={(e) => togglePhaseTool(index, toolId, e.target.checked)}
                                    />
                                    <span className="truncate">{bilingualName(tool, locale)}</span>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </Field>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {(step === 5 || step === 6) && (
          <div className="space-y-3 text-sm">
            <ReviewRow label={t('common.name')} value={values.name} />
            <ReviewRow label={t('common.type')} value={bilingualName(projectTypes?.find((p) => String(p.id) === String(values.project_type_id)), locale)} />
            <ReviewRow label={t('common.workflow')} value={bilingualName(selectedWorkflow, locale)} />
            <ReviewRow label={t('nav.assets')} value={String(values.assets?.length || 0)} />
            <ReviewRow label={t('common.members')} value={String(values.member_ids?.length || 0)} />
            <ReviewRow
              label={t('projects.phases')}
              value={String(selectedEntries.length)}
            />
            <ReviewRow label={t('projects.wizard.weightPercent')} value={`${weightSum}%`} />
            <ReviewRow
              label={t('projects.wizard.phaseTools', { defaultValue: 'Phase tools' })}
              value={String(
                selectedEntries.reduce((sum, { pa }) => sum + (pa.tool_ids?.length || 0), 0),
              )}
            />
            {step === 6 && (
              <p className="rounded border border-line bg-panel p-3 text-xs text-muted">
                {t('projects.progressComputed')}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-between border-t border-line pt-4">
          <Button type="button" variant="secondary" disabled={step === 0} onClick={back}>
            {t('common.back')}
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={() => void next()}>{t('common.next')}</Button>
          ) : (
            <Button type="button" loading={create.isPending} onClick={() => void finish()}>
              {create.isPending ? t('projects.wizard.creating') : t('common.create')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/40 py-2">
      <span className="text-muted">{label}</span>
      <span className="text-end text-text">{value || '—'}</span>
    </div>
  )
}
