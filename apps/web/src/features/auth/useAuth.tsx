import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { PublicUser } from '@agent-frame/shared'
import { clearToken, getToken, setToken } from '../../lib/auth-token.ts'
import * as authApi from './auth.api.ts'

type AuthContextValue = {
  user: PublicUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, username?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const { user: me } = await authApi.fetchMe()
      setUser(me)
    } catch {
      clearToken()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMe()
    const onLogout = () => {
      setUser(null)
    }
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [loadMe])

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password })
    setToken(res.accessToken)
    setUser(res.user)
  }

  const register = async (email: string, password: string, username?: string) => {
    const res = await authApi.register({ email, password, username })
    setToken(res.accessToken)
    setUser(res.user)
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
