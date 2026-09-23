import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reportsApi } from '@/api'
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
  Skeleton,
  Textarea,
} from '@/pages/_shared'
import { bilingualName, cn } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import type { ReportSection, ReportTemplate } from '@/types'

type SectionDraft = {
  section_type: string
  title_en: string
  title_ar: string
  content_md: string
  enabled: boolean
  sort_order: number
}

const FALLBACK_TYPES = [
  { code: 'cover', title_en: 'Cover Page', title_ar: 'صفحة الغلاف' },
  { code: 'executive_summary', title_en: 'Executive Summary', title_ar: 'الملخص التنفيذي' },
  { code: 'scope', title_en: 'Scope', title_ar: 'النطاق' },
  { code: 'methodology', title_en: 'Methodology', title_ar: 'المنهجية' },
  { code: 'assets', title_en: 'Assets', title_ar: 'الأصول' },
  { code: 'tools_used', title_en: 'Tools Used', title_ar: 'الأدوات المستخدمة' },
  { code: 'timeline', title_en: 'Assessment Timeline', title_ar: 'الجدول الزمني' },
  { code: 'findings_summary', title_en: 'Findings Summary', title_ar: 'ملخص النتائج' },
  { code: 'detailed_findings', title_en: 'Detailed Findings', title_ar: 'النتائج التفصيلية' },
  { code: 'assigned_tasks', title_en: 'Assigned Tasks', title_ar: 'المهام المسندة' },
  { code: 'recommendations', title_en: 'Recommendations', title_ar: 'التوصيات' },
  { code: 'conclusion', title_en: 'Conclusion', title_ar: 'الخاتمة' },
  { code: 'appendix', title_en: 'Appendix / Evidence', title_ar: 'الملحق / الأدلة' },
  { code: 'custom', title_en: 'Custom text', title_ar: 'نص مخصص' },
]

function sectionsToPayload(sections: SectionDraft[]) {
  return sections.length
    ? sections.map((s, i) => ({
        section_type: s.section_type,
        title_en: s.title_en,
        title_ar: s.title_ar,
        content_md: s.content_md || null,
        sort_order: i,
        enabled: s.enabled,
      }))
    : undefined
}

function templateToSectionDrafts(template: ReportTemplate): SectionDraft[] {
  return (template.sections || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? a.order ?? 0) - (b.sort_order ?? b.order ?? 0))
    .map((s, i) => ({
      section_type: s.section_type || s.type || 'custom',
      title_en: s.title_en,
      title_ar: s.title_ar || '',
      content_md: s.content_md || s.content || '',
      enabled: s.enabled,
      sort_order: i,
    }))
}

export function ReportTemplatesPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { can } = useAuth()
  const canEdit = can('admin.all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ReportTemplate | null>(null)
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [description, setDescription] = useState('')
  const [sections, setSections] = useState<SectionDraft[]>([])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => reportsApi.templates(),
  })
  const { data: sectionTypes } = useQuery({
    queryKey: ['report-section-types'],
    queryFn: () => reportsApi.sectionTypes(),
  })

  const types = useMemo(() => {
    const list = sectionTypes?.length ? sectionTypes : FALLBACK_TYPES
    return [...list, { code: 'custom', title_en: 'Custom text', title_ar: 'نص مخصص' }]
  }, [sectionTypes])

  const buildPayload = () => ({
    name_en: nameEn.trim(),
    name_ar: nameAr.trim() || nameEn.trim(),
    description_en: description || null,
    is_active: editing?.is_active ?? true,
    sections: sectionsToPayload(sections),
  })

  const resetForm = () => {
    setNameEn('')
    setNameAr('')
    setDescription('')
    setSections([])
  }

  const closeModal = () => {
    setOpen(false)
    setEditing(null)
    resetForm()
  }

  const openCreate = () => {
    setEditing(null)
    resetForm()
    setOpen(true)
  }

  const openEdit = (tmpl: ReportTemplate) => {
    setEditing(tmpl)
    setNameEn(tmpl.name_en)
    setNameAr(tmpl.name_ar || '')
    setDescription(tmpl.description || tmpl.description_en || '')
    setSections(templateToSectionDrafts(tmpl))
    setOpen(true)
  }

  const create = useMutation({
    mutationFn: () => reportsApi.createTemplate(buildPayload()),
    onSuccess: () => {
      closeModal()
      void qc.invalidateQueries({ queryKey: ['report-templates'] })
      toast.success(t('toast.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const update = useMutation({
    mutationFn: ({ id }: { id: string }) => reportsApi.updateTemplate(id, buildPayload()),
    onSuccess: () => {
      closeModal()
      void qc.invalidateQueries({ queryKey: ['report-templates'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => reportsApi.deleteTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['report-templates'] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const toggleType = (code: string, title_en: string, title_ar: string) => {
    setSections((prev) => {
      const exists = prev.find((s) => s.section_type === code && code !== 'custom')
      if (exists && code !== 'custom') {
        return prev.filter((s) => s.section_type !== code)
      }
      return [
        ...prev,
        {
          section_type: code,
          title_en,
          title_ar,
          content_md: '',
          enabled: true,
          sort_order: prev.length,
        },
      ]
    })
  }

  const handleSave = () => {
    if (editing) {
      update.mutate({ id: editing.id })
    } else {
      create.mutate()
    }
  }

  const selectedCodes = new Set(sections.map((s) => s.section_type))
  const isSaving = create.isPending || update.isPending

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('reports.templatesTitle')}
        subtitle={t('reports.templatesSubtitle')}
        backTo="/reports"
        backLabel={t('common.back')}
        actions={canEdit ? <Button onClick={openCreate}>{t('common.create')}</Button> : undefined}
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.length === 0 && <EmptyState title={t('reports.emptyTemplates')} />}

      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((tmpl) => (
          <Card key={tmpl.id} className="!p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-medium">{bilingualName(tmpl, locale)}</h3>
              <Badge tone={tmpl.is_active ? 'success' : 'default'}>
                {tmpl.is_active ? t('common.active') : t('common.inactive')}
              </Badge>
            </div>
            <p className="text-sm text-muted">{tmpl.description || tmpl.description_en}</p>
            <p className="mt-2 text-xs text-muted">
              {t('common.sections')}: {(tmpl.sections || []).length}
            </p>
            {(tmpl.sections || []).length > 0 && (
              <ol className="mt-2 list-decimal space-y-1 ps-4 text-xs text-muted">
                {tmpl.sections!.map((s: ReportSection, idx) => (
                  <li key={s.id || idx}>
                    {bilingualName({ name_en: s.title_en, name_ar: s.title_ar }, locale)} (
                    {s.section_type || s.type})
                  </li>
                ))}
              </ol>
            )}
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
                <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(tmpl)}>
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => {
                    if (window.confirm(t('reports.confirmDeleteTemplate'))) {
                      remove.mutate(String(tmpl.id))
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

      {canEdit && (
        <Modal
          open={open}
          onClose={closeModal}
          title={editing ? t('common.edit') : t('common.create')}
          className="!max-w-2xl"
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>
                {t('common.cancel')}
              </Button>
              <Button loading={isSaving} disabled={!nameEn.trim()} onClick={handleSave}>
                {editing ? t('common.save') : t('common.create')}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label={`${t('common.name')} EN`} required>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </Field>
            <Field label={`${t('common.name')} AR`}>
              <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </Field>
            <Field label={t('common.description')}>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            <div>
              <p className="mb-2 text-xs font-medium text-muted">{t('reports.pickSections')}</p>
              <p className="mb-2 text-[11px] text-muted">{t('reports.pickSectionsHint')}</p>
              <div className="flex flex-wrap gap-2">
                {types.map((tp) => {
                  const active = selectedCodes.has(tp.code) && tp.code !== 'custom'
                  return (
                    <button
                      key={tp.code}
                      type="button"
                      onClick={() => toggleType(tp.code, tp.title_en, tp.title_ar)}
                      className={cn(
                        'rounded border px-2.5 py-1 text-xs',
                        active ? 'border-gold bg-gold/15 text-gold-light' : 'border-line text-muted',
                      )}
                    >
                      {locale === 'ar' ? tp.title_ar : tp.title_en}
                    </button>
                  )
                })}
              </div>
            </div>

            {sections.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted">{t('reports.sectionOrder')}</p>
                {sections.map((sec, index) => (
                  <div key={`${sec.section_type}-${index}`} className="rounded border border-line/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {index + 1}. {locale === 'ar' ? sec.title_ar : sec.title_en}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSections((prev) => prev.filter((_, i) => i !== index))}
                      >
                        {t('common.remove')}
                      </Button>
                    </div>
                    {(sec.section_type === 'custom' ||
                      sec.section_type === 'executive_summary' ||
                      sec.section_type === 'conclusion' ||
                      sec.section_type === 'methodology') && (
                      <Field label={t('reports.customContent')}>
                        <Textarea
                          value={sec.content_md}
                          onChange={(e) =>
                            setSections((prev) =>
                              prev.map((s, i) =>
                                i === index ? { ...s, content_md: e.target.value } : s,
                              ),
                            )
                          }
                          placeholder="{{project.name}} · {{stats.critical_count}}"
                        />
                      </Field>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!sections.length && (
              <p className="text-xs text-muted">{t('reports.defaultSectionsNote')}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
