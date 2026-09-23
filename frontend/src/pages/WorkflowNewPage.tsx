import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { lookupsApi, workflowsApi } from '@/api'
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/pages/_shared'
import { bilingualName } from '@/utils/cn'
import { useToast } from '@/contexts/ToastContext'
import { useApiError } from '@/hooks/useApiError'

const schema = z.object({
  name_en: z.string().min(1),
  name_ar: z.string().optional(),
  description: z.string().optional(),
  description_ar: z.string().optional(),
  project_type_id: z.string().optional(),
  is_active: z.boolean().optional(),
})

type FormValues = z.infer<typeof schema>

export function WorkflowNewPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const navigate = useNavigate()
  const toast = useToast()
  const getError = useApiError()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name_en: '', name_ar: '', is_active: true },
  })
  const { data: types } = useQuery({ queryKey: ['lookups', 'project-types'], queryFn: () => lookupsApi.get('project-types') })

  const create = useMutation({
    mutationFn: (data: FormValues) => workflowsApi.create({ ...data, version: 1 }),
    onSuccess: (w) => {
      toast.success(t('toast.created'))
      navigate(`/workflows/${w.id}`)
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <PageHeader title={t('workflows.new')} backTo="/workflows" backLabel={t('common.back')} />
      <Card>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <Field label={`${t('common.name')} (EN)`} required>
            <Input {...form.register('name_en')} error={form.formState.errors.name_en && t('validation.required')} />
          </Field>
          <Field label={`${t('common.name')} (AR)`}>
            <Input {...form.register('name_ar')} dir="rtl" />
          </Field>
          <Field label={`${t('common.description')} (EN)`}>
            <Textarea {...form.register('description')} />
          </Field>
          <Field label={`${t('common.description')} (AR)`}>
            <Textarea {...form.register('description_ar')} dir="rtl" />
          </Field>
          <Field label={t('workflows.applicableType')}>
            <Select {...form.register('project_type_id')}>
              <option value="">{t('common.all')}</option>
              {(types || []).map((pt) => (
                <option key={pt.id} value={pt.id}>{bilingualName(pt, locale)}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('common.create')}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
