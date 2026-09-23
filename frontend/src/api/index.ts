import { api, API_BASE } from './client'
import { asItems, asPage } from '@/utils/apiNormalize'
import type {
  Asset,
  AuditLog,
  DashboardStats,
  Evidence,
  Finding,
  GeneratedReport,
  MyWorkResponse,
  Notification,
  PaginatedResponse,
  Project,
  ProjectCreateWizard,
  ProjectPhase,
  ReportTemplate,
  Role,
  Task,
  TeamWorkload,
  Tool,
  User,
  Workflow,
  WorkflowPhase,
  LookupItem,
  Permission,
} from '@/types'

async function getPage<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<PaginatedResponse<T>> {
  const data = await api.get<unknown>(path, params)
  return asPage<T>(data)
}

async function getList<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T[]> {
  const data = await api.get<unknown>(path, params)
  return asItems<T>(data)
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post<User>('/auth/login', { username, password }),
  logout: () => api.post<void>('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    api.post<void>('/auth/change-password', { current_password, new_password }),
}

export const dashboardApi = {
  get: () => api.get<DashboardStats>('/dashboard'),
}

export const myWorkApi = {
  get: async () => {
    const data = await api.get<Record<string, unknown>>('/my-work')
    const findings = asItems<Finding & { public_id?: string }>(data?.findings).map((f) => ({
      ...f,
      human_id: f.human_id || f.public_id,
    }))
    return {
      phases: asItems(data?.phases),
      tasks: asItems(data?.tasks),
      findings,
      overdue_tasks: Number(data?.overdue_tasks || 0),
    } as MyWorkResponse & { overdue_tasks?: number }
  },
}

export const projectsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Project>('/projects', params),
  get: (id: string) => api.get<Project>(`/projects/${id}`),
  create: (data: ProjectCreateWizard) => api.post<Project>('/projects', data),
  update: (id: string, data: Partial<Project>) => api.patch<Project>(`/projects/${id}`, data),
  remove: (id: string) => api.delete<void>(`/projects/${id}`),
  phases: async (id: string) => asItems<ProjectPhase>(await api.get(`/projects/${id}/phases`)),
  updatePhase: (projectId: string, phaseId: string, data: Partial<ProjectPhase>) =>
    api.patch<ProjectPhase>(`/projects/${projectId}/phases/${phaseId}`, data),
  deletePhase: (projectId: string, phaseId: string) =>
    api.delete<void>(`/projects/${projectId}/phases/${phaseId}`),
  updatePhaseTool: (
    projectId: string,
    phaseId: string,
    toolLinkId: string,
    data: { usage_status: string },
  ) =>
    api.patch(`/projects/${projectId}/phases/${phaseId}/tools/${toolLinkId}`, data),
  reorderPhases: (projectId: string, phase_ids: string[]) =>
    api.post<ProjectPhase[]>(`/projects/${projectId}/phases/reorder`, { phase_ids }),
  timeline: (id: string) => api.get<Project>(`/projects/${id}/timeline`),
}

export const workflowsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Workflow>('/workflows', params),
  get: (id: string) => api.get<Workflow>(`/workflows/${id}`),
  create: (data: Partial<Workflow>) => api.post<Workflow>('/workflows', data),
  update: (id: string, data: Partial<Workflow>) => api.patch<Workflow>(`/workflows/${id}`, data),
  remove: (id: string) => api.delete<void>(`/workflows/${id}`),
  duplicate: (id: string) => api.post<Workflow>(`/workflows/${id}/duplicate`),
  reorderPhases: (id: string, phase_ids: string[]) =>
    api.post<WorkflowPhase[]>(`/workflows/${id}/phases/reorder`, { phase_ids }),
  addPhase: (id: string, data: Partial<WorkflowPhase>) =>
    api.post<WorkflowPhase>(`/workflows/${id}/phases`, data),
  updatePhase: (workflowId: string, phaseId: string, data: Partial<WorkflowPhase>) =>
    api.patch<WorkflowPhase>(`/workflows/${workflowId}/phases/${phaseId}`, data),
  deletePhase: (workflowId: string, phaseId: string) =>
    api.delete<void>(`/workflows/${workflowId}/phases/${phaseId}`),
}

export const assetsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Asset>('/assets', params),
  get: (id: string) => api.get<Asset>(`/assets/${id}`),
  create: (data: Partial<Asset>) => api.post<Asset>('/assets', data),
  update: (id: string, data: Partial<Asset>) => api.patch<Asset>(`/assets/${id}`, data),
  remove: (id: string) => api.delete<void>(`/assets/${id}`),
  importCsv: (formData: FormData) => api.upload<{ imported: number }>('/assets/import', formData),
}

export const toolsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Tool>('/tools', params),
  get: (id: string) => api.get<Tool>(`/tools/${id}`),
  create: (data: Partial<Tool>) => api.post<Tool>('/tools', data),
  update: (id: string, data: Partial<Tool>) => api.patch<Tool>(`/tools/${id}`, data),
  remove: (id: string) => api.delete<void>(`/tools/${id}`),
}

export const findingsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Finding>('/findings', params),
  get: (id: string) => api.get<Finding>(`/findings/${id}`),
  create: (data: Partial<Finding>) => api.post<Finding>('/findings', data),
  update: (id: string, data: Partial<Finding>) => api.patch<Finding>(`/findings/${id}`, data),
  confirm: (id: string) => api.post<Finding>(`/findings/${id}/confirm`),
  remove: (id: string) => api.delete<void>(`/findings/${id}`),
}

export const evidenceApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Evidence>('/evidence', params),
  get: (id: string) => api.get<Evidence>(`/evidence/${id}`),
  upload: (formData: FormData) => api.upload<Evidence>('/evidence', formData),
  remove: (id: string) => api.delete<void>(`/evidence/${id}`),
  downloadUrl: (id: string) =>
    `${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/evidence/${id}/download`,
  downloadBlob: async (id: string) => {
    const res = await fetch(
      `${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/evidence/${id}/download`,
      { credentials: 'include' },
    )
    if (!res.ok) throw new Error('Failed to download evidence')
    return res.blob()
  },
}

export const teamApi = {
  workload: async (): Promise<TeamWorkload> => {
    const data = await api.get<unknown>('/team/workload')
    const rows = asItems<Record<string, unknown>>(data)
    return {
      users: rows.map((row) => {
        const user = (row.user as User) || {
          id: (row.user_id as string | number) ?? '',
          username: String(row.username || ''),
          full_name: String(row.full_name || row.name || ''),
          email: (row.email as string) || null,
          is_active: true,
          role: row.role as User['role'],
        }
        return {
          user,
          open_tasks: Number(row.open_tasks || 0),
          open_phases: Number(row.open_phases || 0),
          open_findings: Number(row.open_findings || 0),
          overdue: Number(row.overdue ?? row.overdue_tasks ?? 0),
          estimated_hours: Number(row.estimated_hours || 0),
          logged_hours: Number(row.logged_hours || 0),
        }
      }),
    }
  },
  users: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<User>('/users', params),
  createUser: (data: Record<string, unknown>) => api.post<User>('/users', data),
  updateUser: (id: string, data: Record<string, unknown>) => api.patch<User>(`/users/${id}`, data),
  removeUser: (id: string) => api.delete<void>(`/users/${id}`),
  resetPassword: (id: string, new_password: string, must_change = true) =>
    api.post<void>(`/users/${id}/reset-password`, { new_password, must_change }),
  roles: () => getList<Role>('/roles'),
  updateRole: (id: string, data: Record<string, unknown>) => api.patch<Role>(`/roles/${id}`, data),
  resetSystemRoles: () => api.post<{ roles_updated: number }>('/roles/reset-system'),
  resetRole: (id: string) => api.post<Role>(`/roles/${id}/reset`),
}

export const permissionsApi = {
  list: () => getList<Permission>('/permissions'),
}

export const tasksApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Task>('/tasks', params),
  update: (id: string, data: Partial<Task>) => api.patch<Task>(`/tasks/${id}`, data),
  create: (data: Partial<Task>) => api.post<Task>('/tasks', data),
  remove: (id: string) => api.delete<void>(`/tasks/${id}`),
}

export const reportsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<GeneratedReport>('/reports', params),
  get: (id: string) => api.get<GeneratedReport>(`/reports/${id}`),
  generate: (data: Record<string, unknown>) => {
    const language =
      data.language === 'both' || data.language === 'bi' ? 'bilingual' : data.language
    return api.post<GeneratedReport>('/reports/generate', { ...data, language })
  },
  update: (id: string, data: { content_html: string }) =>
    api.patch<GeneratedReport>(`/reports/${id}`, data),
  finalize: (id: string) => api.post<GeneratedReport>(`/reports/${id}/finalize`),
  remove: (id: string) => api.delete<void>(`/reports/${id}`),
  getHtml: async (id: string) => {
    const res = await fetch(`${API_BASE}/reports/${id}/html`, { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to load report HTML')
    return res.text()
  },
  downloadPdf: async (id: string) => {
    const res = await fetch(`${API_BASE}/reports/${id}/pdf`, { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to download PDF')
    return res.blob()
  },
  templates: () => getList<ReportTemplate>('/reports/templates'),
  sectionTypes: () =>
    getList<{ code: string; title_en: string; title_ar: string }>('/reports/section-types'),
  getTemplate: (id: string) => api.get<ReportTemplate>(`/reports/templates/${id}`),
  createTemplate: (data: Partial<ReportTemplate> & Record<string, unknown>) =>
    api.post<ReportTemplate>('/reports/templates', data),
  updateTemplate: (id: string, data: Partial<ReportTemplate> & Record<string, unknown>) =>
    api.patch<ReportTemplate>(`/reports/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete<void>(`/reports/templates/${id}`),
}

export const notificationsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<Notification>('/notifications', params),
  markRead: (id: string) => api.post<Notification>(`/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/notifications/read-all'),
  unreadCount: async () => {
    try {
      return await api.get<{ count: number }>('/notifications/unread-count')
    } catch {
      return { count: 0 }
    }
  },
}

export const auditApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    getPage<AuditLog>('/audit-logs', params),
}

export const lookupsApi = {
  get: (type: string) => getList<LookupItem>(`/lookups/${type}`),
  create: (type: string, data: Partial<LookupItem>) => api.post<LookupItem>(`/lookups/${type}`, data),
  update: (type: string, id: string, data: Partial<LookupItem>) =>
    api.patch<LookupItem>(`/lookups/${type}/${id}`, data),
}

export const settingsApi = {
  get: async () => {
    const rows = await getList<{ key: string; value?: string | null }>('/settings')
    const map: Record<string, unknown> = {}
    for (const row of rows) {
      if (row?.key) map[row.key] = row.value ?? ''
    }
    return map
  },
  update: async (data: Record<string, unknown>) => {
    // Upsert each key
    await Promise.all(
      Object.entries(data).map(([key, value]) =>
        api.put(`/settings/${key}`, { value: value == null ? null : String(value) }),
      ),
    )
    return data
  },
  updatePreferences: (data: Record<string, unknown>) =>
    api.patch<User>('/auth/preferences', data),
}

export const searchApi = {
  search: async (q: string, params?: Record<string, string | number | boolean | undefined>) => {
    const data = await api.get<unknown>('/search', { q, ...params })
    // Backend returns flat SearchResult[]; group for UI
    if (Array.isArray(data)) {
      const groups = {
        projects: [] as Project[],
        findings: [] as Finding[],
        assets: [] as Asset[],
        tools: [] as Tool[],
        users: [] as User[],
        evidence: [] as Evidence[],
      }
      for (const row of data as { entity_type?: string; entity_id?: number; title?: string; subtitle?: string }[]) {
        const type = row.entity_type || ''
        const item = {
          id: row.entity_id,
          name: row.title,
          title: row.title,
          human_id: row.subtitle,
          full_name: row.title,
          username: row.title,
        }
        if (type === 'project') groups.projects.push(item as unknown as Project)
        else if (type === 'finding') groups.findings.push(item as unknown as Finding)
        else if (type === 'asset') groups.assets.push(item as unknown as Asset)
        else if (type === 'tool') groups.tools.push(item as unknown as Tool)
        else if (type === 'user') groups.users.push(item as unknown as User)
        else if (type === 'evidence') groups.evidence.push(item as unknown as Evidence)
      }
      return groups
    }
    const obj = (data || {}) as Record<string, unknown>
    return {
      projects: asItems<Project>(obj.projects),
      findings: asItems<Finding>(obj.findings),
      assets: asItems<Asset>(obj.assets),
      tools: asItems<Tool>(obj.tools),
      users: asItems<User>(obj.users),
      evidence: asItems<Evidence>(obj.evidence),
    }
  },
}
