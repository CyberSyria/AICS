import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useApiError } from '@/hooks/useApiError'
import { AuthShell } from '@/layouts/AppLayout'
import { Button, Card, Field, Input, LanguageToggleInline } from '@/pages/_shared'

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation()
  const { login, isAuthenticated, loading } = useAuth()
  const toast = useToast()
  const getError = useApiError()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (!loading && isAuthenticated) return <Navigate to="/dashboard" replace />

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      await login(values.username, values.password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error(getError(err, t('auth.invalidCredentials')))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <AuthShell>
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-gold" />
            <div>
              <p className="text-lg font-semibold text-gold-light">{t('app.name')}</p>
              <p className="text-xs text-muted">{t('app.fullName')}</p>
            </div>
          </div>
          <LanguageToggleInline />
        </div>
        <Card>
          <h1 className="text-xl font-semibold text-text">{t('auth.welcomeBack')}</h1>
          <p className="mt-1 text-sm text-muted">{t('auth.loginSubtitle')}</p>
          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <Field label={t('auth.username')} required htmlFor="username">
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                error={errors.username ? t('validation.required') : undefined}
                {...register('username')}
              />
            </Field>
            <Field label={t('auth.password')} required htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                error={errors.password ? t('validation.required') : undefined}
                {...register('password')}
              />
            </Field>
            <Button type="submit" className="w-full" loading={submitting}>
              {submitting ? t('auth.signingIn') : t('auth.login')}
            </Button>
          </form>
        </Card>
      </div>
    </AuthShell>
  )
}
