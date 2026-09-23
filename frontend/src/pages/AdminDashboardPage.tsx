import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { permissionsApi, tasksApi, teamApi } from '@/api'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Badge,
} from '@/pages/_shared'
import { bilingualName, cn } from '@/utils/cn'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useApiError } from '@/hooks/useApiError'
import type { Permission } from '@/types'

type Tab = 'users' | 'roles' | 'tasks'

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const { can } = useAuth()
  const toast = useToast()
  const getError = useApiError()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('users')

  if (!can('admin.all') && !can('user.manage')) {
    return <Navigate to="/dashboard" replace />
  }

  const { data: usersPage, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => teamApi.users({ page: 1, page_size: 100 }),
  })
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => teamApi.roles(),
  })
  const { data: permissions } = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => permissionsApi.list(),
    enabled: tab === 'roles',
  })
  const { data: tasksPage, isLoading: tasksLoading } = useQuery({
    queryKey: ['admin', 'tasks'],
    queryFn: () => tasksApi.list({ page: 1, page_size: 100 }),
    enabled: tab === 'tasks',
  })

  const users = usersPage?.items || []
  const tasks = tasksPage?.items || []

  const [newUser, setNewUser] = useState({
    username: '',
    full_name: '',
    password: '',
    role_id: '',
  })
  const [roleEdit, setRoleEdit] = useState<{ id: string; permission_ids: number[] } | null>(null)

  const createUser = useMutation({
    mutationFn: () =>
      teamApi.createUser({
        username: newUser.username.trim().toLowerCase(),
        full_name: newUser.full_name.trim(),
        password: newUser.password,
        role_id: Number(newUser.role_id),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setNewUser({ username: '', full_name: '', password: '', role_id: '' })
      toast.success(t('common.created'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: Record<string, unknown> }) =>
      teamApi.updateUser(String(id), data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string | number; password: string }) =>
      teamApi.resetPassword(String(id), password),
    onSuccess: () => toast.success(t('toast.saved')),
    onError: (err) => toast.error(getError(err)),
  })

  const updateRole = useMutation({
    mutationFn: ({ id, permission_ids }: { id: string | number; permission_ids: number[] }) =>
      teamApi.updateRole(String(id), { permission_ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
      setRoleEdit(null)
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const resetSystemRoles = useMutation({
    mutationFn: () => teamApi.resetSystemRoles(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const resetRole = useMutation({
    mutationFn: (id: string | number) => teamApi.resetRole(String(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const removeUser = useMutation({
    mutationFn: (id: string | number) => teamApi.removeUser(String(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success(t('toast.deleted'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const assignTask = useMutation({
    mutationFn: ({ taskId, assignee_id }: { taskId: string | number; assignee_id: number | null }) =>
      tasksApi.update(String(taskId), { assignee_id: assignee_id as unknown as string | null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'tasks'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: t('admin.accounts') },
    { id: 'roles', label: t('admin.rolesPermissions') },
    { id: 'tasks', label: t('admin.assignTasks') },
  ]

  const roleOptions = useMemo(() => roles || [], [roles])

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        actions={
          <div className="flex items-center gap-2 text-gold">
            <Shield className="h-5 w-5" />
            <span className="text-xs">{t('admin.adminOnly')}</span>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1 rounded border border-line p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded px-3 py-1.5 text-xs',
              tab === item.id ? 'bg-ink-green text-gold-light' : 'text-muted hover:text-text',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-gold-light">{t('admin.addUser')}</h3>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newUser.username || !newUser.password || !newUser.role_id) {
                  toast.warning(t('validation.required'))
                  return
                }
                createUser.mutate()
              }}
            >
              <Field label={t('auth.username')} required>
                <Input
                  value={newUser.username}
                  onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))}
                  autoComplete="off"
                />
              </Field>
              <Field label={t('auth.fullName')} required>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser((s) => ({ ...s, full_name: e.target.value }))}
                />
              </Field>
              <Field label={t('auth.password')} required>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                />
              </Field>
              <Field label={t('admin.role')} required>
                <Select
                  value={newUser.role_id}
                  onChange={(e) => setNewUser((s) => ({ ...s, role_id: e.target.value }))}
                >
                  <option value="">{t('common.select')}</option>
                  {roleOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {locale === 'ar' ? r.name_ar || r.name_en || r.name : r.name_en || r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" loading={createUser.isPending}>
                {t('admin.createUser')}
              </Button>
            </form>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold">{t('admin.accounts')}</h3>
              <p className="text-xs text-muted">{t('admin.accountsHint')}</p>
            </div>
            {usersLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : !users.length ? (
              <EmptyState title={t('common.empty')} />
            ) : (
              <ul className="divide-y divide-line/40">
                {users.map((u) => (
                  <li key={u.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-text">{u.username}</p>
                        <p className="text-xs text-muted">
                          {u.full_name}
                          {u.role?.code ? ` · ${u.role.code}` : ''}
                        </p>
                      </div>
                      <Badge tone={u.is_active ? 'success' : 'error'}>
                        {u.is_active ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        className="min-w-[8rem] flex-1"
                        value={String(u.role_id || u.role?.id || '')}
                        onChange={(e) =>
                          updateUser.mutate({ id: u.id, data: { role_id: Number(e.target.value) } })
                        }
                      >
                        {roleOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {locale === 'ar' ? r.name_ar || r.name_en || r.name : r.name_en || r.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          updateUser.mutate({ id: u.id, data: { is_active: !u.is_active } })
                        }
                      >
                        {u.is_active ? t('admin.disable') : t('admin.enable')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          const pw = window.prompt(t('admin.newPasswordPrompt'))
                          if (pw && pw.length >= 4) resetPassword.mutate({ id: u.id, password: pw })
                        }}
                      >
                        {t('admin.resetPassword')}
                      </Button>
                      {can('admin.all') && (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(t('admin.confirmRemoveUser'))) {
                              removeUser.mutate(u.id)
                            }
                          }}
                        >
                          {t('admin.removeUser')}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              loading={resetSystemRoles.isPending}
              onClick={() => resetSystemRoles.mutate()}
            >
              {t('admin.resetSystemRoles')}
            </Button>
          </div>
          {rolesLoading ? (
            <Skeleton className="h-32" />
          ) : (
            (roles || []).map((role) => {
              const isSystem = Boolean(role.is_system)
              const canEditRole = !isSystem || can('admin.all')
              const editing = roleEdit?.id === String(role.id)
              const selected = new Set(roleEdit?.permission_ids || [])
              return (
                <Card key={role.id}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gold-light">
                        {locale === 'ar' ? role.name_ar || role.name_en || role.name : role.name_en || role.name}
                      </h3>
                      <p className="text-xs text-muted">
                        {role.code}
                        {isSystem ? ` · ${t('admin.systemRole')}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isSystem && (
                        <Button
                          type="button"
                          variant="secondary"
                          loading={resetRole.isPending}
                          onClick={() => resetRole.mutate(role.id)}
                        >
                          {t('admin.resetRole')}
                        </Button>
                      )}
                      {canEditRole && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setRoleEdit(
                              editing
                                ? null
                                : {
                                    id: String(role.id),
                                    permission_ids: (role.permissions || []).map((p) => Number(p.id)),
                                  },
                            )
                          }
                        >
                          {editing ? t('common.cancel') : t('admin.editPermissions')}
                        </Button>
                      )}
                    </div>
                  </div>
                  {!editing && (
                    <div className="flex flex-wrap gap-1">
                      {(role.permissions || []).map((p) => (
                        <span key={p.id} className="rounded border border-line px-2 py-0.5 text-[11px] text-muted">
                          {p.code}
                        </span>
                      ))}
                      {!role.permissions?.length && <span className="text-xs text-muted">{t('common.empty')}</span>}
                    </div>
                  )}
                  {editing && canEditRole && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted">{t('admin.editPermissionsHint')}</p>
                      <div className="max-h-72 space-y-4 overflow-y-auto">
                        {Object.entries(
                          (permissions || []).reduce<Record<string, Permission[]>>((acc, p) => {
                            const cat = p.category || 'general'
                            ;(acc[cat] ||= []).push(p)
                            return acc
                          }, {}),
                        ).map(([category, perms]) => (
                          <div key={category}>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold-light">
                              {t(`admin.permissionCategories.${category}`, { defaultValue: category })}
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {perms.map((p) => (
                                <label
                                  key={p.id}
                                  className="flex items-start gap-2 rounded border border-line/50 px-2 py-1.5 text-xs text-text"
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={selected.has(Number(p.id))}
                                    onChange={(e) => {
                                      const next = new Set(selected)
                                      if (e.target.checked) next.add(Number(p.id))
                                      else next.delete(Number(p.id))
                                      setRoleEdit({ id: String(role.id), permission_ids: [...next] })
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block font-medium">{p.name_en || p.name}</span>
                                    {p.name_ar && (
                                      <span className="block text-[10px] text-muted">{p.name_ar}</span>
                                    )}
                                    <span className="mt-0.5 block font-mono text-[10px] text-muted">{p.code}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        loading={updateRole.isPending}
                        onClick={() =>
                          updateRole.mutate({
                            id: role.id,
                            permission_ids: roleEdit?.permission_ids || [],
                          })
                        }
                      >
                        {t('common.save')}
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold">{t('admin.assignTasks')}</h3>
            <p className="text-xs text-muted">{t('admin.assignTasksHint')}</p>
          </div>
          {tasksLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10" />
            </div>
          ) : !tasks.length ? (
            <EmptyState title={t('common.empty')} description={t('admin.noTasks')} />
          ) : (
            <ul className="divide-y divide-line/40">
              {tasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{task.title}</p>
                    <p className="text-xs text-muted">{task.status}</p>
                  </div>
                  <Select
                    className="w-48"
                    value={String(task.assignee_id ?? '')}
                    onChange={(e) =>
                      assignTask.mutate({
                        taskId: task.id,
                        assignee_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">{t('admin.unassigned')}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} — {u.full_name}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
