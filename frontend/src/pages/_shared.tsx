import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils/cn'

/** Re-exports and tiny shared page helpers */
export {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Label,
  Badge,
  EmptyState,
  Skeleton,
  SkeletonCards,
  ErrorState,
  Spinner,
  ProgressBar,
  StatusBadge,
  SeverityBadge,
  Modal,
  Pagination,
  PageHeader,
  Panel,
} from '@/components/ui'

export function LanguageToggleInline() {
  const { i18n } = useTranslation()
  const { setLanguage } = useAuth()
  const lng = i18n.language.startsWith('ar') ? 'ar' : 'en'
  return (
    <div className="inline-flex rounded border border-line p-0.5 text-xs">
      <button
        type="button"
        className={cn('rounded px-2 py-1', lng === 'en' ? 'bg-ink-green text-gold-light' : 'text-muted')}
        onClick={() => void setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={cn('rounded px-2 py-1', lng === 'ar' ? 'bg-ink-green text-gold-light' : 'text-muted')}
        onClick={() => void setLanguage('ar')}
      >
        العربية
      </button>
    </div>
  )
}
