import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { authApi, settingsApi } from '@/api'
import { ApiError } from '@/api/client'
import type { User, Locale } from '@/types'
import { hasPermission } from '@/utils/cn'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setLanguage: (lng: Locale) => Promise<void>
  can: (permission: string) => boolean
  canAny: (...permissions: string[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me()
      setUser(me)
      if (me.preferences?.language && me.preferences.language !== i18n.language) {
        await i18n.changeLanguage(me.preferences.language)
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null)
      } else {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [i18n])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await authApi.login(username, password)
      setUser(res)
      if (res.preferences?.language) {
        await i18n.changeLanguage(res.preferences.language)
      }
    },
    [i18n],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const setLanguage = useCallback(
    async (lng: Locale) => {
      await i18n.changeLanguage(lng)
      localStorage.setItem('samp_lang', lng)
      if (user) {
        try {
          await settingsApi.updatePreferences({ language: lng })
        } catch {
          /* offline / API down — local preference still applied */
        }
      }
    },
    [i18n, user],
  )

  const can = useCallback(
    (permission: string) => hasPermission(user?.permissions, permission),
    [user],
  )

  const canAny = useCallback(
    (...codes: string[]) => codes.some((c) => hasPermission(user?.permissions, c)),
    [user],
  )

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      logout,
      refresh,
      setLanguage,
      can,
      canAny,
    }),
    [user, loading, login, logout, refresh, setLanguage, can, canAny],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
