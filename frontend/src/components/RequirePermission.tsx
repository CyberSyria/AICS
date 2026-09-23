import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { ErrorState } from '@/pages/_shared'

/** Block the page if the user lacks any of the required permissions. */
export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[]
  children: React.ReactNode
}) {
  const { can, loading } = useAuth()
  const { t } = useTranslation()
  if (loading) return null
  if (!anyOf.some((p) => can(p))) {
    return (
      <div className="space-y-4 animate-fade-in">
        <ErrorState message={t('errors.forbidden')} />
        <Navigate to="/dashboard" replace />
      </div>
    )
  }
  return <>{children}</>
}
