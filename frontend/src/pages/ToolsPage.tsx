import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toolsApi, lookupsApi } from '@/api'
import {
  Badge,
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
  Textarea,
} from '@/pages/_shared'
import { bilingualName } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import type { Tool } from '@/types'

type ToolForm = {
  name_en: string
  name_ar: string
  description_en: string
  category_id: string
  version: string
  website: string
  command_reference: string
  notes: string
  is_active: boolean
}

const emptyForm: ToolForm = {
  name_en: '',
  name_ar: '',
  description_en: '',
  category_id: '',
  version: '',
  website: '',
  command_reference: '',
  notes: '',
  is_active: true,
}

function toolLabel(tool: Tool, locale: 'en' | 'ar') {
  if (locale === 'ar') return tool.name_ar || tool.name_en || tool.name
  return tool.name_en || tool.name
}

function toPayload(v: ToolForm) {
  return {
    name_en: v.name_en.trim(),
    name_ar: (v.name_ar || v.name_en).trim(),
    description_en: v.description_en || null,
    category_id: v.category_id || null,
    version: v.version || null,
    website: v.website || null,
    command_reference: v.command_reference || null,
    notes: v.notes || null,
    is_active: !!v.is_active,
  }
}

export function ToolsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { canAny } = useAuth()
  const canManage = canAny('tool.manage', 'admin.all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Tool | null>(null)
  const form = useForm<ToolForm>({ defaultValues: emptyForm })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tools', 'all'],
    queryFn: () => toolsApi.list({ page_size: 200, active_only: false }),
  })
  const { data: categories } = useQuery({
    queryKey: ['lookups', 'tool-categories'],
    queryFn: () => lookupsApi.get('tool-categories'),
  })

  const create = useMutation({
    mutationFn: (values: ToolForm) => toolsApi.create(toPayload(values)),
    onSuccess: () => {
      setOpen(false)
      form.reset(emptyForm)
      void qc.invalidateQueries({ queryKey: ['tools'] })
      toast.success(t('toast.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<ReturnType<typeof toPayload>> }) =>
      toolsApi.update(id, values),
    onSuccess: () => {
      setOpen(false)
      setEditing(null)
      form.reset(emptyForm)
      void qc.invalidateQueries({ queryKey: ['tools'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => toolsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tools'] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  useEffect(() => {
    if (!editing) return
    form.reset({
      name_en: editing.name_en || editing.name || '',
      name_ar: editing.name_ar || '',
      description_en: editing.description_en || editing.description || '',
      category_id: editing.category_id ? String(editing.category_id) : '',
      version: editing.version || '',
      website: editing.website || '',
      command_reference: editing.command_reference || '',
      notes: editing.notes || '',
      is_active: editing.is_active !== false,
    })
  }, [editing, form])

  const openCreate = () => {
    setEditing(null)
    form.reset(emptyForm)
    setOpen(true)
  }

  const openEdit = (tool: Tool) => {
    setEditing(tool)
    setOpen(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('tools.title')}
        subtitle={t('tools.subtitle')}
        actions={
          canManage ? <Button onClick={openCreate}>{t('tools.new')}</Button> : undefined
        }
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState
          title={t('tools.empty')}
          action={canManage ? <Button onClick={openCreate}>{t('tools.new')}</Button> : undefined}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((tool) => (
          <Card key={tool.id} className="!p-4">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="font-medium">{toolLabel(tool, locale)}</h3>
              <Badge tone={tool.is_active ? 'success' : 'default'}>
                {tool.is_active ? t('common.active') : t('common.inactive')}
              </Badge>
            </div>
            <p className="text-xs text-muted">{bilingualName(tool.category, locale)}</p>
            <p className="mt-2 line-clamp-2 text-sm text-muted">
              {tool.description_en || tool.description}
            </p>
            {tool.version && <p className="mt-2 text-[11px] text-gold">v{tool.version}</p>}
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
                <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(tool)}>
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    update.mutate({
                      id: String(tool.id),
                      values: { is_active: !tool.is_active },
                    })
                  }
                >
                  {tool.is_active ? t('tools.deactivate') : t('tools.activate')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(t('tools.confirmDelete'))) {
                      remove.mutate(String(tool.id))
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? t('tools.edit') : t('tools.new')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false)
                setEditing(null)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              loading={create.isPending || update.isPending}
              onClick={form.handleSubmit((v) => {
                if (editing) update.mutate({ id: String(editing.id), values: toPayload(v) })
                else create.mutate(v)
              })}
            >
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={`${t('common.name')} EN`} required>
            <Input {...form.register('name_en', { required: true })} />
          </Field>
          <Field label={`${t('common.name')} AR`}>
            <Input dir="rtl" {...form.register('name_ar')} />
          </Field>
          <Field label={t('common.category')}>
            <Select {...form.register('category_id')}>
              <option value="">{t('common.select')}</option>
              {(categories || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {bilingualName(c, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.description')}>
            <Textarea {...form.register('description_en')} />
          </Field>
          <Field label={t('common.version')}>
            <Input {...form.register('version')} />
          </Field>
          <Field label={t('common.website')}>
            <Input {...form.register('website')} />
          </Field>
          <Field label={t('common.command')}>
            <Textarea {...form.register('command_reference')} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[var(--color-gold)]" {...form.register('is_active')} />
            {t('common.active')}
          </label>
        </div>
      </Modal>
    </div>
  )
}
