import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '@/api'
import {
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
} from '@/pages/_shared'
import { formatDateTime } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

export function AuditLogPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit-logs', page, debounced],
    queryFn: () => auditApi.list({ page, page_size: 25, q: debounced || undefined }),
  })

  const entityLabel = (log: { entity?: string | null; entity_type?: string | null }) =>
    log.entity || log.entity_type || '—'

  const entityIdLabel = (id?: string | number | null) => {
    if (id === undefined || id === null || id === '') return ''
    const s = String(id)
    return ` #${s.length > 8 ? s.slice(0, 8) : s}`
  }

  const summaryOf = (log: {
    summary?: string | null
    after_summary?: string | null
    before_summary?: string | null
  }) => log.summary || log.after_summary || log.before_summary || '—'

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder={t('common.search')}
        className="max-w-xs"
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && <EmptyState title={t('audit.empty')} />}

      {data && data.items.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded border border-line md:block">
            <table className="w-full text-sm">
              <thead className="bg-panel text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-start">{t('common.date')}</th>
                  <th className="px-3 py-2 text-start">{t('common.user')}</th>
                  <th className="px-3 py-2 text-start">{t('common.action')}</th>
                  <th className="px-3 py-2 text-start">{t('common.entity')}</th>
                  <th className="px-3 py-2 text-start">{t('common.summary')}</th>
                  <th className="px-3 py-2 text-start">{t('common.ip')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => (
                  <tr key={log.id} className="border-t border-line/50">
                    <td className="px-3 py-2 whitespace-nowrap text-muted">
                      {formatDateTime(log.created_at, locale)}
                    </td>
                    <td className="px-3 py-2">{log.user?.full_name || '—'}</td>
                    <td className="px-3 py-2 text-gold">{log.action}</td>
                    <td className="px-3 py-2">
                      {entityLabel(log)}
                      {entityIdLabel(log.entity_id)}
                    </td>
                    <td className="px-3 py-2 text-muted">{summaryOf(log)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {data.items.map((log) => (
              <Card key={log.id} className="!p-3">
                <p className="text-sm text-gold">{log.action}</p>
                <p className="text-xs text-muted">
                  {entityLabel(log)} · {log.user?.full_name || '—'}
                </p>
                <p className="text-[11px] text-muted">{formatDateTime(log.created_at, locale)}</p>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
