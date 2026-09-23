import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Copy } from 'lucide-react'
import { workflowsApi } from '@/api'
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Badge } from '@/pages/_shared'
import { bilingualName } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'

export function WorkflowsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()
  const { canAny } = useAuth()
  const canManage = canAny('workflow.manage', 'admin.all')
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list({ page_size: 50 }),
  })

  const duplicate = useMutation({
    mutationFn: (id: string) => workflowsApi.duplicate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] })
      toast.success(t('toast.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('workflows.title')}
        subtitle={t('workflows.subtitle')}
        actions={
          canManage ? (
            <Link to="/workflows/new">
              <Button>
                <Plus className="h-4 w-4" />
                {t('workflows.new')}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState
          title={t('workflows.empty')}
          action={
            canManage ? (
              <Link to="/workflows/new">
                <Button>{t('workflows.new')}</Button>
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((w) => (
          <Card key={w.id} className="!p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <Link to={`/workflows/${w.id}`} className="font-medium hover:text-gold">
                {bilingualName(w, locale)}
              </Link>
              <Badge tone={w.is_active ? 'success' : 'default'}>
                {w.is_active ? t('common.active') : t('common.inactive')}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted">
              {locale === 'ar' ? w.description_ar || w.description : w.description}
            </p>
            <p className="mt-2 text-xs text-muted">
              {t('workflows.version', { n: w.version })} · {(w.phases || []).length} {t('workflows.phases')}
            </p>
            <div className="mt-3 flex gap-2">
              <Link to={`/workflows/${w.id}`}>
                <Button size="sm" variant="secondary">
                  {t('common.view')}
                </Button>
              </Link>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => duplicate.mutate(String(w.id))}
                  loading={duplicate.isPending}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t('common.duplicate')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
