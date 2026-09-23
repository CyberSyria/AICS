export type Locale = 'en' | 'ar'

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ApiErrorBody {
  detail?: string
  code?: string
  request_id?: string
}

export interface User {
  id: string | number
  username: string
  email?: string | null
  full_name: string
  full_name_ar?: string | null
  is_active?: boolean
  role_id?: string | number | null
  role?: Role | null
  role_code?: string | null
  role_name_en?: string | null
  role_name_ar?: string | null
  permissions?: string[]
  preferences?: UserPreferences
  must_change_password?: boolean
  created_at?: string
  last_login_at?: string | null
  csrf_token?: string
}

export interface Role {
  id: string | number
  code?: string
  name?: string
  name_en?: string
  name_ar?: string | null
  description?: string | null
  is_system?: boolean
  permissions?: Permission[]
}

export interface Permission {
  id: string | number
  code: string
  name?: string
  name_en?: string
  name_ar?: string | null
  category?: string | null
}

export interface UserPreferences {
  language: Locale
  timezone: string
  date_format: string
  theme?: string
}

export interface LookupItem {
  id: string
  name_en: string
  name_ar?: string | null
  code?: string | null
  color_token?: string | null
  weight?: number | null
  sla_days?: number | null
  is_terminal?: boolean | null
  is_active?: boolean
  sort_order?: number
}

export interface Workflow {
  id: string
  name_en: string
  name_ar?: string | null
  description?: string | null
  description_ar?: string | null
  version: number
  is_active: boolean
  project_type_id?: string | null
  project_type?: LookupItem | null
  phases?: WorkflowPhase[]
  created_at?: string
  updated_at?: string
}

export interface WorkflowPhase {
  id: string
  workflow_id: string
  name_en: string
  name_ar?: string | null
  description?: string | null
  order: number
  estimated_duration_hours?: number | null
  required_evidence?: boolean
  enabled: boolean
  default_assignee_id?: string | null
  tools?: Tool[]
  tool_ids?: (string | number)[]
  checklist_items?: ChecklistItem[]
}

export interface ChecklistItem {
  id: string
  title_en: string
  title_ar?: string | null
  description?: string | null
  reference?: string | null
  is_mandatory?: boolean
  order: number
}

export interface Project {
  id: string
  name: string
  description?: string | null
  status: string
  priority?: string | null
  project_type_id?: string | null
  project_type?: LookupItem | null
  workflow_id?: string | null
  workflow?: Workflow | null
  owner_id?: string | null
  owner?: User | null
  client?: string | null
  environment?: string | null
  scope_in?: string | null
  scope_out?: string | null
  rules_of_engagement?: string | null
  start_date?: string | null
  due_date?: string | null
  completed_at?: string | null
  progress?: number
  tags?: string[]
  phases?: ProjectPhase[]
  members?: ProjectMember[]
  created_at?: string
  updated_at?: string
}

export interface ProjectPhase {
  id: string
  project_id: string
  name_en: string
  name_ar?: string | null
  description?: string | null
  order: number
  sort_order?: number
  status: string
  status_id?: string | number | null
  status_reason?: string | null
  assignee_id?: string | number | null
  assignee?: User | null
  planned_start?: string | null
  planned_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
  estimated_duration_hours?: number | null
  weight_percent?: number | null
  days_allocated?: number | null
  days_remaining?: number | null
  notes?: string | null
  findings_count?: number
  evidence_count?: number
  tasks_count?: number
  tools?: PhaseTool[]
  checklist_items?: ChecklistItem[]
}

export interface PhaseTool {
  id: string | number
  tool_id: string | number
  usage_status: 'unused' | 'in_use' | 'used' | string
  was_used?: boolean
  name_en?: string | null
  name_ar?: string | null
  category?: string | null
}

export interface ProjectMember {
  id: string
  user_id: string
  user?: User
  role?: string
}

export interface Task {
  id: string
  project_id: string
  phase_id?: string | null
  title: string
  description?: string | null
  status: string
  priority?: string | null
  assignee_id?: string | number | null
  assignee?: User | null
  due_date?: string | null
  estimated_hours?: number | null
  actual_hours?: number | null
  project?: Project | null
  phase?: ProjectPhase | null
  created_at?: string
}

export interface Asset {
  id: string
  project_id: string
  name: string
  asset_type_id?: string | null
  asset_type?: LookupItem | null
  value: string
  description?: string | null
  environment?: string | null
  status?: string | null
  tags?: string[]
  project?: Project | null
  created_at?: string
}

export interface Tool {
  id: string
  name: string
  name_en?: string | null
  name_ar?: string | null
  description?: string | null
  description_en?: string | null
  description_ar?: string | null
  category_id?: string | null
  category?: LookupItem | null
  version?: string | null
  website?: string | null
  command_reference?: string | null
  notes?: string | null
  is_active: boolean
}

export interface Finding {
  id: string
  human_id?: string
  public_id?: string
  title: string
  description?: string | null
  severity_id?: string | null
  severity?: LookupItem | null
  status_id?: string | null
  status?: LookupItem | null
  project_id: string
  project?: Project | null
  asset_ids?: string[]
  assets?: Asset[]
  phase_id?: string | null
  phase?: ProjectPhase | null
  tool_id?: string | null
  tool?: Tool | null
  assignee_id?: string | number | null
  assignee?: User | null
  reporter?: User | null
  affected_component?: string | null
  impact?: string | null
  recommendation?: string | null
  reproduction_steps?: string | null
  references?: string | null
  cve?: string | null
  cwe?: string | null
  cvss_score?: number | null
  cvss_vector?: string | null
  owasp?: string | null
  tags?: string[]
  due_date?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
  history?: FindingHistory[]
  evidence?: Evidence[]
}

export interface FindingHistory {
  id: string
  field: string
  old_value?: string | null
  new_value?: string | null
  changed_by?: User | null
  created_at: string
}

export interface Evidence {
  id: string
  filename: string
  mime_type: string
  size?: number
  size_bytes?: number
  sha256?: string | null
  project_id?: string | null
  phase_id?: string | null
  task_id?: string | null
  finding_id?: string | null
  asset_id?: string | null
  uploaded_by?: User | null
  created_at: string
  project?: Project | null
}

export interface ReportTemplate {
  id: string
  name_en: string
  name_ar?: string | null
  description?: string | null
  description_en?: string | null
  description_ar?: string | null
  is_active: boolean
  is_default?: boolean
  sections?: ReportSection[]
}

export interface ReportSection {
  id?: string
  type?: string
  section_type?: string
  title_en: string
  title_ar?: string | null
  order?: number
  sort_order?: number
  enabled: boolean
  content?: string | null
  content_md?: string | null
}

export interface GeneratedReport {
  id: string
  project_id: string
  template_id?: string | null
  language: string
  status: string
  version?: number
  title?: string | null
  classification?: string | null
  content_html?: string | null
  has_pdf?: boolean
  finalized_at?: string | null
  created_at: string
  project?: Project | null
  template?: ReportTemplate | null
  error_message?: string | null
}

export interface Notification {
  id: string
  title: string
  title_ar?: string | null
  body?: string | null
  body_ar?: string | null
  type: string
  is_read: boolean
  link?: string | null
  created_at: string
}

export interface AuditLog {
  id: string | number
  user?: User | null
  action: string
  entity?: string | null
  entity_type?: string | null
  entity_id?: string | number | null
  ip_address?: string | null
  user_agent?: string | null
  summary?: string | null
  before_summary?: string | null
  after_summary?: string | null
  created_at: string
}

export interface DashboardStats {
  total_projects: number
  active_projects: number
  completed_projects: number
  open_findings_by_severity: { name: string; name_ar?: string; count: number; color?: string }[]
  findings_by_project?: {
    project_id: string | number
    name: string
    total: number
    by_severity: { code: string; name: string; name_ar?: string; count: number; color?: string }[]
  }[]
  overdue_findings: number
  overdue_tasks: number
  overdue_phases: number
  team_workload: { user_id: string; name: string; open_tasks: number; overdue: number }[]
  project_status_distribution: { status: string; count: number }[]
  recent_activity: AuditLog[]
  recent_findings: Finding[]
  upcoming_deadlines: { id: string; title: string; due_date: string; type: string }[]
  my_work_summary: { open_tasks: number; open_phases: number; overdue: number }
  assessment_progress: { project_id: string; name: string; progress: number }[]
}

export interface MyWorkResponse {
  phases: ProjectPhase[]
  tasks: Task[]
  findings: Finding[]
}

export interface TeamWorkload {
  users: {
    user: User
    open_tasks: number
    open_phases: number
    open_findings: number
    overdue: number
    estimated_hours: number
    logged_hours: number
  }[]
}

export interface ProjectCreateWizard {
  name: string
  description?: string
  project_type_id: string
  priority?: string
  client?: string
  environment?: string
  start_date?: string
  due_date?: string
  workflow_id: string
  assets?: { name: string; asset_type_id: string; value: string; environment?: string }[]
  scope_in?: string
  scope_out?: string
  rules_of_engagement?: string
  member_ids?: string[]
  phase_assignments?: {
    workflow_phase_id?: string
    phase_order: number
    selected?: boolean
    weight_percent?: number
    assignee_id?: string
    tool_ids?: string[]
  }[]
  tags?: string[]
}
