import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Locale } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function bilingualName(
  item: { name_en?: string | null; name_ar?: string | null; name?: string; full_name?: string; full_name_ar?: string | null } | null | undefined,
  locale: Locale,
): string {
  if (!item) return '—'
  if (locale === 'ar') {
    return item.name_ar || item.full_name_ar || item.name_en || item.name || item.full_name || '—'
  }
  return item.name_en || item.name || item.full_name || item.name_ar || '—'
}

export function formatDate(value?: string | null, locale: Locale = 'en') {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function formatDateTime(value?: string | null, locale: Locale = 'en') {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function formatBytes(bytes?: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function severityColor(token?: string | null, name?: string | null) {
  const key = (token || name || '').toLowerCase()
  if (key.includes('critical')) return 'var(--severity-critical)'
  if (key.includes('high')) return 'var(--severity-high)'
  if (key.includes('medium')) return 'var(--severity-medium)'
  if (key.includes('low')) return 'var(--severity-low)'
  if (key.includes('info')) return 'var(--severity-info)'
  return 'var(--color-gold)'
}

export function hasPermission(permissions: string[] | undefined, code: string) {
  if (!permissions?.length) return false
  if (permissions.includes('admin.all') || permissions.includes('*')) return true
  return permissions.includes(code)
}
