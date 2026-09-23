import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
  backLabel,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** When set, shows a back control that navigates to this path. */
  backTo?: string
  backLabel?: string
}) {
  return (
    <div className="mb-6 space-y-3">
      {backTo && (
        <div>
          <Link
            to={backTo}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-line bg-panel px-3 text-xs font-medium text-muted transition hover:border-gold hover:text-gold-light"
          >
            <span aria-hidden className="inline-block rtl:rotate-180">←</span>
            {backLabel || 'Back'}
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Card({
  children,
  className,
  padding = true,
}: {
  children: ReactNode
  className?: string
  padding?: boolean
}) {
  return (
    <div className={cn('rounded border border-line bg-card shadow-gold', padding && 'p-4', className)}>
      {children}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded border border-line bg-panel', className)}>{children}</div>
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-ink-green text-gold-light border-gold hover:bg-ink-green-2 hover:border-gold-accent',
      secondary: 'bg-panel text-text border-line hover:border-gold hover:text-gold-light',
      ghost: 'bg-transparent text-muted border-transparent hover:text-text hover:bg-panel',
      danger: 'bg-error/10 text-error border-error/40 hover:bg-error/20',
    }
    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-9 px-4 text-sm',
      lg: 'h-11 px-5 text-sm',
    }
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded border font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded border border-line bg-panel px-3 text-sm text-text placeholder:text-muted/70 focus:border-gold-accent focus:outline-none',
          error && 'border-error',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <textarea
        ref={ref}
        className={cn(
          'min-h-[88px] w-full rounded border border-line bg-panel px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-gold-accent focus:outline-none',
          error && 'border-error',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  ),
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: string }>(
  ({ className, error, children, ...props }, ref) => (
    <div className="w-full">
      <select
        ref={ref}
        className={cn(
          'h-9 w-full rounded border border-line bg-panel px-3 text-sm text-text focus:border-gold-accent focus:outline-none',
          error && 'border-error',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  ),
)
Select.displayName = 'Select'

export function Label({ children, htmlFor, required }: { children: ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
      {children}
      {required && <span className="ms-1 text-error">*</span>}
    </label>
  )
}

export function Field({ label, required, children, htmlFor }: { label: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-0">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
    </div>
  )
}

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: 'default' | 'success' | 'error' | 'warning' | 'gold'
  className?: string
}) {
  const tones = {
    default: 'border-line text-muted bg-panel',
    success: 'border-success/40 text-success bg-success/10',
    error: 'border-error/40 text-error bg-error/10',
    warning: 'border-warning/40 text-warning bg-warning/10',
    gold: 'border-gold/50 text-gold-light bg-gold/10',
  }
  return (
    <span className={cn('inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-line bg-panel/50 px-6 py-16 text-center">
      <p className="text-base font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <Skeleton className="mb-3 h-3 w-1/2" />
          <Skeleton className="h-8 w-1/3" />
        </Card>
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-error/30 text-center">
      <p className="text-sm text-error">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Card>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent', className)}
      role="status"
      aria-label="Loading"
    />
  )
}

export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gold-accent transition-all" style={{ width: `${v}%` }} />
    </div>
  )
}

export function StatusBadge({ status, code }: { status?: string | null; code?: string | null }) {
  const s = (code || status || '').toLowerCase().replace(/\s+/g, '_')
  let tone: 'default' | 'success' | 'error' | 'warning' | 'gold' = 'default'
  if (['confirmed', 'completed', 'closed', 'remediated', 'active'].includes(s)) tone = 'success'
  else if (['blocked', 'critical', 'failed'].includes(s)) tone = 'error'
  else if (['in_review', 'in_progress', 'pending', 'open', 'warning'].includes(s)) tone = 'warning'
  else if (['skipped', 'draft'].includes(s)) tone = 'gold'
  return <Badge tone={tone}>{status || '—'}</Badge>
}

export function SeverityBadge({ name, colorToken }: { name?: string | null; colorToken?: string | null }) {
  const key = (colorToken || name || '').toLowerCase()
  let tone: 'default' | 'success' | 'error' | 'warning' | 'gold' = 'gold'
  if (key.includes('critical')) tone = 'error'
  else if (key.includes('high')) tone = 'error'
  else if (key.includes('medium')) tone = 'warning'
  else if (key.includes('low')) tone = 'gold'
  else if (key.includes('info')) tone = 'default'
  return <Badge tone={tone}>{name || '—'}</Badge>
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-void-pure/70" onClick={onClose} aria-label="Close overlay" />
      <div
        className={cn(
          'relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-t border border-line bg-card p-5 shadow-gold sm:rounded',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">{footer}</div>}
      </div>
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm text-muted">
      <span>
        {page} / {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          ›
        </Button>
      </div>
    </div>
  )
}
