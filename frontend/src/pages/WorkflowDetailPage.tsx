import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import { workflowsApi } from '@/api'
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Skeleton, Textarea, Badge } from '@/pages/_shared'
import { bilingualName } from '@/utils/cn'
import { phaseOrder } from '@/utils/apiNormalize'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import type { WorkflowPhase } from '@/types'

function SortablePhase({ phase, locale }: { phase: WorkflowPhase; locale: 'en' | 'ar' }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded border border-line bg-card p-3 ${isDragging ? 'opacity-80 shadow-glow' : ''}`}
    >
      <button type="button" className="mt-0.5 cursor-grab text-muted active:cursor-grabbing" {...attributes} {...listeners} aria-label="Drag">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">#{phaseOrder(phase)}</span>
          <p className="font-medium text-sm">{bilingualName(phase, locale)}</p>
          {!phase.enabled && <Badge>{'disabled'}</Badge>}
        </div>
        {phase.description && <p className="mt-1 text-xs text-muted line-clamp-2">{phase.description}</p>}
        <p className="mt-1 text-[11px] text-muted">
          {(phase.checklist_items || []).length} checklist · {(phase.tools || []).length} tools
          {phase.estimated_duration_hours != null && ` · ${phase.estimated_duration_hours}h`}
        </p>
      </div>
    </div>
  )
}

export function WorkflowDetailPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const [phases, setPhases] = useState<WorkflowPhase[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newPhase, setNewPhase] = useState({ name_en: '', name_ar: '', description: '' })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workflows', id],
    queryFn: () => workflowsApi.get(id),
    enabled: !!id,
  })

  useEffect(() => {
    if (data?.phases) setPhases([...data.phases].sort((a, b) => a.order - b.order))
  }, [data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorder = useMutation({
    mutationFn: (ids: string[]) => workflowsApi.reorderPhases(id, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows', id] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const addPhase = useMutation({
    mutationFn: () =>
      workflowsApi.addPhase(id, {
        ...newPhase,
        order: phases.length + 1,
        enabled: true,
      }),
    onSuccess: () => {
      setShowAdd(false)
      setNewPhase({ name_en: '', name_ar: '', description: '' })
      void qc.invalidateQueries({ queryKey: ['workflows', id] })
      toast.success(t('toast.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = phases.findIndex((p) => p.id === active.id)
    const newIndex = phases.findIndex((p) => p.id === over.id)
    const next = arrayMove(phases, oldIndex, newIndex).map((p, i) => ({ ...p, order: i + 1 }))
    setPhases(next)
    reorder.mutate(next.map((p) => p.id))
  }

  if (isLoading) return <Skeleton className="h-64" />
  if (isError || !data) return <ErrorState message={getError(error)} onRetry={() => void refetch()} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={bilingualName(data, locale)}
        subtitle={t('workflows.reorderHint')}
        backTo="/workflows"
        backLabel={t('common.back')}
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            {t('workflows.addPhase')}
          </Button>
        }
      />

      <Card className="!p-4">
        <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted">
          <span>{t('workflows.version', { n: data.version })}</span>
          <Badge tone={data.is_active ? 'success' : 'default'}>{data.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </div>
        <p className="text-sm text-muted">{locale === 'ar' ? data.description_ar || data.description : data.description}</p>
      </Card>

      {showAdd && (
        <Card className="space-y-3">
          <Input placeholder={`${t('common.name')} EN`} value={newPhase.name_en} onChange={(e) => setNewPhase((s) => ({ ...s, name_en: e.target.value }))} />
          <Input placeholder={`${t('common.name')} AR`} dir="rtl" value={newPhase.name_ar} onChange={(e) => setNewPhase((s) => ({ ...s, name_ar: e.target.value }))} />
          <Textarea placeholder={t('common.description')} value={newPhase.description} onChange={(e) => setNewPhase((s) => ({ ...s, description: e.target.value }))} />
          <div className="flex gap-2">
            <Button onClick={() => addPhase.mutate()} loading={addPhase.isPending} disabled={!newPhase.name_en}>{t('common.add')}</Button>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
          </div>
        </Card>
      )}

      {!phases.length ? (
        <EmptyState title={t('common.empty')} action={<Button onClick={() => setShowAdd(true)}>{t('workflows.addPhase')}</Button>} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {phases.map((phase) => (
                <SortablePhase key={phase.id} phase={phase} locale={locale} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
