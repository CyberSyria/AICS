import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'

export function useApiError() {
  const { t } = useTranslation()
  return (err: unknown, fallback?: string) => {
    if (err instanceof ApiError) {
      if (err.code && t(`errors.${err.code}`, { defaultValue: '' })) {
        return t(`errors.${err.code}`)
      }
      return err.message || fallback || t('common.error')
    }
    if (err instanceof TypeError) return t('common.networkError')
    if (err instanceof Error) return err.message
    return fallback || t('common.error')
  }
}
