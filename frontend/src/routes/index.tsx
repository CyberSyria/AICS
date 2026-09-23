import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/layouts/AppLayout'
import { RequirePermission } from '@/components/RequirePermission'
import { Spinner } from '@/components/ui'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MyWorkPage } from '@/pages/MyWorkPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ProjectNewPage } from '@/pages/ProjectNewPage'
import { ProjectDetailPage } from '@/pages/ProjectDetailPage'
import { TimelinePage } from '@/pages/TimelinePage'
import { ProjectTimelinePage } from '@/pages/ProjectTimelinePage'
import { WorkflowsPage } from '@/pages/WorkflowsPage'
import { WorkflowNewPage } from '@/pages/WorkflowNewPage'
import { WorkflowDetailPage } from '@/pages/WorkflowDetailPage'
import { AssetsPage } from '@/pages/AssetsPage'
import { ToolsPage } from '@/pages/ToolsPage'
import { FindingsPage } from '@/pages/FindingsPage'
import { FindingDetailPage } from '@/pages/FindingDetailPage'
import { EvidencePage } from '@/pages/EvidencePage'
import { TeamPage } from '@/pages/TeamPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ReportTemplatesPage } from '@/pages/ReportTemplatesPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AdminDashboardPage } from '@/pages/AdminDashboardPage'
import { TasksPage } from '@/pages/TasksPage'

function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <Spinner />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/my-work" element={<MyWorkPage />} />
          <Route
            path="/tasks"
            element={
              <RequirePermission anyOf={['task.manage', 'task.update_own', 'admin.all']}>
                <TasksPage />
              </RequirePermission>
            }
          />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route
            path="/projects/new"
            element={
              <RequirePermission anyOf={['project.create', 'admin.all']}>
                <ProjectNewPage />
              </RequirePermission>
            }
          />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/timeline" element={<ProjectTimelinePage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route
            path="/workflows/new"
            element={
              <RequirePermission anyOf={['workflow.manage', 'admin.all']}>
                <WorkflowNewPage />
              </RequirePermission>
            }
          />
          <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/findings" element={<FindingsPage />} />
          <Route path="/findings/:id" element={<FindingDetailPage />} />
          <Route path="/evidence" element={<EvidencePage />} />
          <Route
            path="/team"
            element={
              <RequirePermission anyOf={['team.read', 'user.read', 'user.manage', 'admin.all']}>
                <TeamPage />
              </RequirePermission>
            }
          />
          <Route path="/reports" element={<ReportsPage />} />
          <Route
            path="/reports/templates"
            element={
              <RequirePermission anyOf={['report.generate', 'report.manage', 'admin.all']}>
                <ReportTemplatesPage />
              </RequirePermission>
            }
          />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/audit-log"
            element={
              <RequirePermission anyOf={['audit.read', 'admin.all']}>
                <AuditLogPage />
              </RequirePermission>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
