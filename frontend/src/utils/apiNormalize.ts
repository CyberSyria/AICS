/** Normalize backend list OR paginated responses into a stable page shape. */

export type Page<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
}

export function asItems<T>(data: unknown): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data as T[]
  if (typeof data === 'object' && data !== null && Array.isArray((data as Page<T>).items)) {
    return (data as Page<T>).items
  }
  return []
}

export function asPage<T>(data: unknown): Page<T> {
  if (!data) return { items: [], total: 0, page: 1, page_size: 20 }
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length, page: 1, page_size: data.length || 20 }
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Partial<Page<T>> & Record<string, unknown>
    const items = Array.isArray(obj.items) ? (obj.items as T[]) : []
    return {
      items,
      total: typeof obj.total === 'number' ? obj.total : items.length,
      page: typeof obj.page === 'number' ? obj.page : 1,
      page_size: typeof obj.page_size === 'number' ? obj.page_size : items.length || 20,
    }
  }
  return { items: [], total: 0, page: 1, page_size: 20 }
}

/** Map workflow/project phase order field (backend: sort_order). */
export function phaseOrder(phase: { order?: number; sort_order?: number } | null | undefined): number {
  if (!phase) return 0
  return phase.order ?? phase.sort_order ?? 0
}
