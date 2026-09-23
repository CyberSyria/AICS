import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { notificationsApi } from '@/api'
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Badge } from '@/pages/_shared'
import { formatDateTime } from '@/utils/cn'
import { useApiError } from '@/hooks/useApiError'
import { useToast } from '@/contexts/ToastContext'

export function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const getError = useApiError()
  const toast = useToast()
  const qc = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ page_size: 50 }),
  })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actions={
          <Button variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending}>
            {t('common.markAllRead')}
          </Button>
        }
      />

      {isLoading && <Skeleton className="h-40" />}
      {isError && <ErrorState message={getError(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && <EmptyState title={t('notifications.empty')} />}

      <div className="space-y-2">
        {data?.items.map((n) => {
          const title = locale === 'ar' ? n.title_ar || n.title : n.title
          const body = locale === 'ar' ? n.body_ar || n.body : n.body
          const content = (
            <Card className={`!p-3 ${n.is_read ? 'opacity-70' : 'border-gold/40'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  {body && <p className="mt-1 text-xs text-muted">{body}</p>}
                  <p className="mt-1 text-[11px] text-muted">{formatDateTime(n.created_at, locale)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {!n.is_read && <Badge tone="gold">{t('common.unread')}</Badge>}
                  {!n.is_read && (
                    <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                      {t('common.markRead')}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )
          return n.link ? (
            <Link key={n.id} to={n.link} onClick={() => !n.is_read && markRead.mutate(n.id)}>
              {content}
            </Link>
          ) : (
            <div key={n.id}>{content}</div>
          )
        })}
      </div>
    </div>
  )
}
