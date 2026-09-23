import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { projectsApi } from '@/api'
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '@/pages/_shared'
import { formatDate } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'

/** Global timeline hub — pick a project to open its timeline view. */
export function TimelinePage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projects', 'timeline-hub'],
    queryFn: () => projectsApi.list({ page_size: 50 }),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={t('timeline.title')} subtitle={t('timeline.hubSubtitle')} />

      {isLoading && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {!isLoading && !isError && data && data.items.length === 0 && (
        <EmptyState title={t('projects.empty')} />
      )}

      {data && data.items.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((p) => (
            <Card key={p.id} className="flex flex-col !p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <Link to={`/projects/${p.id}/timeline`} className="font-medium text-text hover:text-gold">
                  {p.name}
                </Link>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-auto">
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>{t('common.progress')}</span>
                  <span>{Math.round(p.progress ?? 0)}%</span>
                </div>
                <ProgressBar value={p.progress ?? 0} />
                <div className="mt-3 flex justify-between text-xs text-muted">
                  <span>{formatDate(p.due_date, locale)}</span>
                  <Link to={`/projects/${p.id}/timeline`} className="text-gold hover:underline">
                    {t('projects.viewTimeline')}
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
