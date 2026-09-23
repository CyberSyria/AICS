import { useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  GitBranch,
  GanttChart,
  Boxes,
  Bug,
  FileArchive,
  Wrench,
  Users,
  FileText,
  Bell,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Search,
  LogOut,
  Shield,
  ListTodo,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { notificationsApi, searchApi } from '@/api'
import { Button, Input } from '@/components/ui'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cn } from '@/utils/cn'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

type NavItem = {
  key: string
  to: string
  icon: typeof LayoutDashboard
  end?: boolean
  adminOnly?: boolean
  /** Show if user has any of these permissions (admin.all always passes via can()). */
  anyOf?: string[]
}

type NavGroup = {
  key: string
  labelKey: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    key: 'main',
    labelKey: '',
    items: [
      { key: 'dashboard', to: '/dashboard', icon: LayoutDashboard, end: true, anyOf: ['dashboard.read'] },
      { key: 'admin', to: '/admin', icon: Shield, adminOnly: true },
      { key: 'myWork', to: '/my-work', icon: Briefcase },
      { key: 'tasks', to: '/tasks', icon: ListTodo, anyOf: ['task.manage', 'task.update_own', 'admin.all'] },
    ],
  },
  {
    key: 'assessments',
    labelKey: 'nav.assessments',
    items: [
      { key: 'projects', to: '/projects', icon: FolderKanban, end: true, anyOf: ['project.read'] },
      { key: 'workflows', to: '/workflows', icon: GitBranch, anyOf: ['workflow.read', 'workflow.manage'] },
      { key: 'timeline', to: '/timeline', icon: GanttChart, end: true, anyOf: ['project.read'] },
    ],
  },
  {
    key: 'assets',
    labelKey: '',
    items: [{ key: 'assets', to: '/assets', icon: Boxes, anyOf: ['asset.manage', 'project.read'] }],
  },
  {
    key: 'security',
    labelKey: 'nav.security',
    items: [
      { key: 'findings', to: '/findings', icon: Bug, anyOf: ['finding.read'] },
      { key: 'evidence', to: '/evidence', icon: FileArchive, anyOf: ['evidence.download', 'evidence.upload'] },
      { key: 'tools', to: '/tools', icon: Wrench, anyOf: ['tool.manage', 'project.read'] },
    ],
  },
  {
    key: 'rest',
    labelKey: '',
    items: [
      { key: 'team', to: '/team', icon: Users, anyOf: ['team.read', 'user.read', 'user.manage'] },
      { key: 'reports', to: '/reports', icon: FileText, anyOf: ['report.generate', 'report.manage'] },
      { key: 'notifications', to: '/notifications', icon: Bell, anyOf: ['notification.read'] },
      { key: 'auditLog', to: '/audit-log', icon: ScrollText, anyOf: ['audit.read'] },
      { key: 'settings', to: '/settings', icon: Settings },
    ],
  },
]

function LanguageToggle() {
  const { i18n } = useTranslation()
  const { setLanguage } = useAuth()
  const lng = i18n.language.startsWith('ar') ? 'ar' : 'en'
  return (
    <div className="inline-flex rounded border border-line p-0.5 text-xs" role="group" aria-label="Language">
      <button
        type="button"
        className={cn('rounded px-2 py-1', lng === 'en' ? 'bg-ink-green text-gold-light' : 'text-muted hover:text-text')}
        onClick={() => void setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={cn('rounded px-2 py-1', lng === 'ar' ? 'bg-ink-green text-gold-light' : 'text-muted hover:text-text')}
        onClick={() => void setLanguage('ar')}
      >
        العربية
      </button>
    </div>
  )
}

function GlobalSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebouncedValue(q, 300)
  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchApi.search(debounced),
    enabled: debounced.trim().length >= 2,
  })

  const results = useMemo(() => {
    if (!data) return []
    return [
      ...data.findings.map((f) => ({
        type: 'finding',
        id: f.id,
        label: `${f.human_id || f.public_id || f.id} — ${f.title}`,
        to: `/findings/${f.id}`,
      })),
      ...data.projects.map((p) => ({ type: 'project', id: p.id, label: p.name, to: `/projects/${p.id}` })),
      ...data.assets.map((a) => ({ type: 'asset', id: a.id, label: a.name, to: '/assets' })),
      ...data.tools.map((tool) => ({ type: 'tool', id: tool.id, label: tool.name, to: '/tools' })),
    ].slice(0, 8)
  }, [data])

  return (
    <div className="relative hidden min-w-0 flex-1 md:block md:max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={t('nav.search')}
          className="ps-8"
          aria-label={t('nav.search')}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded border border-line bg-card shadow-gold">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-text hover:bg-panel"
              onMouseDown={() => {
                navigate(r.to)
                setOpen(false)
                setQ('')
              }}
            >
              <span className="text-[10px] uppercase text-gold">{r.type}</span>
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { can, canAny } = useAuth()

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3" aria-label="Main">
      {navGroups.map((group) => {
        const items = group.items.filter((item) => {
          if (item.adminOnly) return can('admin.all') || can('user.manage')
          if (item.anyOf?.length) return canAny(...item.anyOf)
          return true
        })
        if (!items.length) return null
        return (
        <div key={group.key}>
          {group.labelKey && !collapsed && (
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{t(group.labelKey)}</p>
          )}
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.key}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={t(`nav.${item.key}`)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition',
                        collapsed && 'justify-center',
                        isActive
                          ? 'border border-line bg-ink-green text-gold-light'
                          : 'border border-transparent text-muted hover:bg-panel hover:text-text',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{t(`nav.${item.key}`)}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
        )
      })}
    </nav>
  )
}

export function AppLayout() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const rtl = i18n.language.startsWith('ar')
  const CollapseIcon = collapsed ? (rtl ? ChevronLeft : ChevronRight) : rtl ? ChevronRight : ChevronLeft

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 60_000,
  })

  return (
    <div className="flex min-h-screen bg-void">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-e border-line bg-panel transition-[width] md:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <div className={cn('flex h-14 items-center gap-2 border-b border-line px-3', collapsed && 'justify-center')}>
          <img src="/AICS.png" alt="" className="h-7 w-7 object-contain" aria-hidden />
          {!collapsed && <span className="truncate text-sm font-semibold text-gold-light">{t('app.name')}</span>}
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className="border-t border-line p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <CollapseIcon className="h-4 w-4" />
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-void-pure/70" onClick={() => setMobileOpen(false)} aria-label={t('nav.closeMenu')} />
          <aside className="absolute inset-y-0 start-0 flex w-72 flex-col border-e border-line bg-panel shadow-gold">
            <div className="flex h-14 items-center justify-between border-b border-line px-3">
              <div className="flex items-center gap-2">
                <img src="/AICS.png" alt="" className="h-7 w-7 object-contain" />
                <span className="text-sm font-semibold text-gold-light">{t('app.name')}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMobileOpen(false)} aria-label={t('nav.closeMenu')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-panel/95 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label={t('nav.openMenu')}>
            <Menu className="h-4 w-4" />
          </Button>
          <GlobalSearch />
          <div className="ms-auto flex items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <NavLink
              to="/notifications"
              className="relative rounded border border-transparent p-2 text-muted hover:border-line hover:text-text"
              aria-label={t('nav.notifications')}
            >
              <Bell className="h-4 w-4" />
              {(unread?.count ?? 0) > 0 && (
                <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-error" />
              )}
            </NavLink>
            <div className="hidden text-end sm:block">
              <p className="text-xs font-medium text-text">{user?.full_name}</p>
              <p className="text-[10px] text-muted">{user?.role?.name || user?.email}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label={t('auth.logout')}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <ErrorBoundary fallbackTitle="Page error">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-void p-4">{children}</div>
}
