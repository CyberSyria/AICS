import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { authApi, lookupsApi, settingsApi, teamApi } from '@/api'
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '@/pages/_shared'
import { bilingualName, cn } from '@/utils/cn'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useApiError } from '@/hooks/useApiError'

type Tab = 'general' | 'security' | 'appearance' | 'administration'

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en'
  const { user, setLanguage, refresh, can } = useAuth()
  const toast = useToast()
  const getError = useApiError()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('general')
  const canAdminSettings = can('admin.all') || can('settings.manage')

  const prefs = useForm({
    values: {
      language: (user?.preferences?.language || locale) as string,
      timezone: user?.preferences?.timezone || 'UTC',
      date_format: user?.preferences?.date_format || 'yyyy-MM-dd',
    },
  })

  const passwordForm = useForm({
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  })

  const { data: projectTypes } = useQuery({
    queryKey: ['lookups', 'project-types'],
    queryFn: () => lookupsApi.get('project-types'),
    enabled: tab === 'administration',
  })
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => teamApi.roles(),
    enabled: tab === 'administration',
  })

  const savePrefs = useMutation({
    mutationFn: async (values: { language: string; timezone: string; date_format: string }) => {
      await settingsApi.updatePreferences(values)
      await setLanguage(values.language as 'en' | 'ar')
      await refresh()
    },
    onSuccess: () => toast.success(t('toast.saved')),
    onError: (err) => toast.error(getError(err)),
  })

  const saveSettings = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.update(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const changePassword = useMutation({
    mutationFn: (v: { current_password: string; new_password: string }) =>
      authApi.changePassword(v.current_password, v.new_password),
    onSuccess: () => {
      passwordForm.reset()
      toast.success(t('toast.saved'))
    },
    onError: (err) => toast.error(getError(err)),
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: t('settings.general') },
    { id: 'security', label: t('settings.security') },
    { id: 'appearance', label: t('settings.appearance') },
    ...(canAdminSettings
      ? [{ id: 'administration' as const, label: t('settings.administration') }]
      : []),
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

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

      {tab === 'general' && (
        <Card>
          <form className="max-w-md space-y-4" onSubmit={prefs.handleSubmit((v) => savePrefs.mutate(v))}>
            <Field label={t('common.language')}>
              <Select {...prefs.register('language')}>
                <option value="en">{t('common.english')}</option>
                <option value="ar">{t('common.arabic')}</option>
              </Select>
              <p className="mt-1 text-xs text-muted">{t('settings.languageHint')}</p>
            </Field>
            <Field label={t('common.timezone')}>
              <Input {...prefs.register('timezone')} />
            </Field>
            <Field label={t('common.dateFormat')}>
              <Input {...prefs.register('date_format')} />
            </Field>
            <Button type="submit" loading={savePrefs.isPending}>{t('common.saveChanges')}</Button>
          </form>
        </Card>
      )}

      {tab === 'security' && (
        <Card>
          <p className="mb-4 text-sm text-muted">{t('settings.passwordPolicy')}</p>
          <form
            className="max-w-md space-y-4"
            onSubmit={passwordForm.handleSubmit((v) => {
              if (v.new_password !== v.confirm) {
                toast.warning(t('validation.passwordMatch'))
                return
              }
              changePassword.mutate({ current_password: v.current_password, new_password: v.new_password })
            })}
          >
            <Field label={t('auth.currentPassword')} required>
              <Input type="password" {...passwordForm.register('current_password', { required: true })} />
            </Field>
            <Field label={t('auth.newPassword')} required>
              <Input type="password" {...passwordForm.register('new_password', { required: true, minLength: 4 })} />
            </Field>
            <Field label={t('auth.confirmPassword')} required>
              <Input type="password" {...passwordForm.register('confirm', { required: true })} />
            </Field>
            <Button type="submit" loading={changePassword.isPending}>{t('auth.changePassword')}</Button>
          </form>
        </Card>
      )}

      {tab === 'appearance' && (
        <Card>
          <p className="mb-3 text-sm text-muted">{t('settings.appearance')}</p>
          <div className="flex flex-wrap gap-2">
            {[
              '#C1A576', '#062E28', '#010C0A', '#071F1B', '#F0E6D2', '#7CFF6B', '#FF6B6B', '#E6C27A',
            ].map((c) => (
              <span key={c} className="h-8 w-8 rounded border border-line" style={{ background: c }} title={c} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">Qamra · dark security-ops palette (fixed design tokens)</p>
        </Card>
      )}

      {tab === 'administration' && canAdminSettings && (
        <div className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">{t('common.orgName')}</h3>
              <form
                className="flex max-w-md flex-col gap-3 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  saveSettings.mutate({ org_name: String(fd.get('org_name') || '') })
                }}
              >
                <Input name="org_name" defaultValue={String(settings?.org_name || '')} className="flex-1" />
                <Button type="submit" loading={saveSettings.isPending}>{t('common.save')}</Button>
              </form>
            </Card>
          )}

          <Card>
            <h3 className="mb-3 text-sm font-semibold">{t('settings.lookups')}</h3>
            <p className="mb-2 text-xs text-muted">{t('settings.projectTypes')}</p>
            <ul className="mb-4 space-y-1 text-sm">
              {(projectTypes || []).map((pt) => (
                <li key={pt.id} className="rounded border border-line/40 px-2 py-1">{bilingualName(pt, locale)}</li>
              ))}
              {!projectTypes?.length && <li className="text-muted">{t('common.empty')}</li>}
            </ul>
            <h3 className="mb-2 text-sm font-semibold">{t('settings.roles')}</h3>
            <ul className="space-y-1 text-sm">
              {(roles || []).map((r) => (
                <li key={r.id} className="rounded border border-line/40 px-2 py-1">
                  {locale === 'ar' ? r.name_ar || r.name_en || r.name : r.name_en || r.name}
                  <span className="ms-2 text-xs text-muted">{(r.permissions || []).length} perms</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
