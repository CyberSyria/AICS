import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { assetsApi, lookupsApi, projectsApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@/pages/_shared'
import { bilingualName } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/contexts/AuthContext'

export function AssetsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { canAny } = useAuth()
  const canManage = canAny('asset.manage', 'project.manage', 'admin.all')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebouncedValue(q)
  const form = useForm({
    defaultValues: { name: '', value: '', project_id: '', asset_type_id: '', environment: '', description: '' },
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['assets', page, debounced],
    queryFn: () => assetsApi.list({ page, page_size: 20, q: debounced || undefined }),
  })
  const { data: projects } = useQuery({ queryKey: ['projects', 'select'], queryFn: () => projectsApi.list({ page_size: 100 }) })
  const { data: types } = useQuery({ queryKey: ['lookups', 'asset-types'], queryFn: () => lookupsApi.get('asset-types') })

  const create = useMutation({
    mutationFn: (values: Record<string, string>) => assetsApi.create(values),
    onSuccess: () => {
      setOpen(false)
      form.reset()
      void qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success(t('toast.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const importCsv = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return assetsApi.importCsv(fd)
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success(t('toast.uploaded'), String(res.imported))
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('assets.title')}
        subtitle={t('assets.subtitle')}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <label className="inline-flex cursor-pointer">
                <span className="inline-flex h-9 items-center justify-center gap-2 rounded border border-line bg-panel px-4 text-sm font-medium text-text hover:border-gold">
                  {t('assets.importCsv')}
                </span>
                <input
                  id="csv-import"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) importCsv.mutate(f)
                  }}
                />
              </label>
              <Button onClick={() => setOpen(true)}>{t('assets.new')}</Button>
            </div>
          ) : undefined
        }
      />

      <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder={t('common.search')} className="max-w-xs" />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState
          title={t('assets.empty')}
          action={canManage ? <Button onClick={() => setOpen(true)}>{t('assets.new')}</Button> : undefined}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded border border-line md:block">
            <table className="w-full text-sm">
              <thead className="bg-panel text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-start">{t('common.name')}</th>
                  <th className="px-3 py-2 text-start">{t('common.type')}</th>
                  <th className="px-3 py-2 text-start">{t('common.value')}</th>
                  <th className="px-3 py-2 text-start">{t('common.project')}</th>
                  <th className="px-3 py-2 text-start">{t('common.environment')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-t border-line/50">
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 text-muted">{bilingualName(a.asset_type, locale)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.value}</td>
                    <td className="px-3 py-2">{a.project?.name || a.project_id}</td>
                    <td className="px-3 py-2 text-muted">{a.environment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {data.items.map((a) => (
              <Card key={a.id} className="!p-3">
                <p className="font-medium">{a.name}</p>
                <p className="font-mono text-xs text-gold">{a.value}</p>
                <p className="text-xs text-muted">{bilingualName(a.asset_type, locale)} · {a.project?.name}</p>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('assets.new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button loading={create.isPending} onClick={form.handleSubmit((v) => create.mutate(v))}>{t('common.create')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('common.project')} required>
            <Select {...form.register('project_id', { required: true })}>
              <option value="">{t('common.select')}</option>
              {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.name')} required><Input {...form.register('name', { required: true })} /></Field>
          <Field label={t('common.type')} required>
            <Select {...form.register('asset_type_id', { required: true })}>
              <option value="">{t('common.select')}</option>
              {(types || []).map((at) => <option key={at.id} value={at.id}>{bilingualName(at, locale)}</option>)}
            </Select>
          </Field>
          <Field label={t('common.value')} required><Input {...form.register('value', { required: true })} /></Field>
          <Field label={t('common.environment')}><Input {...form.register('environment')} /></Field>
        </div>
      </Modal>
    </div>
  )
}
