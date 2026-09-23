import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { projectsApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '@/pages/_shared'
import { formatDate } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/contexts/AuthContext'

export function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const { canAny } = useAuth()
  const canCreate = canAny('project.create', 'admin.all')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projects', page, debounced],
    queryFn: () => projectsApi.list({ page, page_size: 12, q: debounced || undefined }),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        actions={
          canCreate ? (
            <Link to="/projects/new">
              <Button>
                <Plus className="h-4 w-4" />
                {t('projects.new')}
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder={t('common.search')}
        className="max-w-xs"
      />

      {isLoading && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      )}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}

      {!isLoading && !isError && data && data.items.length === 0 && (
        <EmptyState
          title={t('projects.empty')}
          action={
            canCreate ? (
              <Link to="/projects/new">
                <Button>{t('projects.new')}</Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((p) => (
              <Card key={p.id} className="flex flex-col !p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <Link to={`/projects/${p.id}`} className="font-medium text-text hover:text-gold">
                    {p.name}
                  </Link>
                  <StatusBadge status={p.status} />
                </div>
                <p className="line-clamp-2 text-xs text-muted">{p.description || '—'}</p>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px] text-muted">
                    <span>{t('common.progress')}</span>
                    <span>{Math.round(p.progress ?? 0)}%</span>
                  </div>
                  <ProgressBar value={p.progress ?? 0} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>{formatDate(p.due_date, locale)}</span>
                  <div className="flex gap-2">
                    <Link to={`/projects/${p.id}`} className="text-gold hover:underline">
                      {t('common.view')}
                    </Link>
                    <Link to={`/projects/${p.id}/timeline`} className="text-gold hover:underline">
                      {t('nav.timeline')}
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
