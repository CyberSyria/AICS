import type { ApiErrorBody } from '@/types'

const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')

let csrfToken: string | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export function getCsrfToken() {
  return csrfToken
}

export class ApiError extends Error {
  status: number
  code?: string
  requestId?: string
  body?: ApiErrorBody

  constructor(status: number, body?: ApiErrorBody, fallback = 'Request failed') {
    super(body?.detail || fallback)
    this.name = 'ApiError'
    this.status = status
    this.code = body?.code
    this.requestId = body?.request_id
    this.body = body
  }
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  params?: Record<string, string | number | boolean | undefined | null>
  skipJson?: boolean
}

function buildUrl(path: string, params?: RequestOptions['params']) {
  const base = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!params) return base
  const url = new URL(base, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  // If API_BASE is absolute, URL constructor keeps it; return href or pathname+search
  if (base.startsWith('http')) return url.toString()
  return `${url.pathname}${url.search}`
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, skipJson, headers: customHeaders, ...rest } = options
  const method = (rest.method || 'GET').toUpperCase()
  const headers = new Headers(customHeaders)

  if (!skipJson && body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const csrf = csrfToken || getCookie('samp_csrf') || getCookie('csrf_token') || getCookie('XSRF-TOKEN')
  if (csrf && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers.set('X-CSRF-Token', csrf)
  }

  const response = await fetch(buildUrl(path, params), {
    ...rest,
    method,
    credentials: 'include',
    headers,
    body: body instanceof FormData || skipJson ? (body as BodyInit) : body !== undefined ? JSON.stringify(body) : undefined,
  })

  const csrfHeader = response.headers.get('X-CSRF-Token')
  if (csrfHeader) setCsrfToken(csrfHeader)

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const data = isJson ? await response.json().catch(() => undefined) : await response.blob().catch(() => undefined)

  if (isJson && data && typeof data === 'object' && 'csrf_token' in data && (data as { csrf_token?: string }).csrf_token) {
    setCsrfToken((data as { csrf_token: string }).csrf_token)
  }

  if (!response.ok) {
    throw new ApiError(response.status, isJson ? (data as ApiErrorBody) : undefined, response.statusText)
  }

  return data as T
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) => apiRequest<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown, params?: RequestOptions['params']) =>
    apiRequest<T>(path, { method: 'POST', body, params }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    apiRequest<T>(path, { method: 'POST', body: formData, skipJson: true }),
}

export { API_BASE }
