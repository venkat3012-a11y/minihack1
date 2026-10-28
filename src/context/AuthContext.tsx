import React, { createContext, useContext, useState, useEffect } from 'react'
import { User, api, getStoredToken, clearStoredToken } from '../services/api'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, pass: string) => Promise<User>
  register: (data: { email: string; password: string; full_name: string; role: string; teacher_code?: string }) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      const token = getStoredToken()
      if (token) {
        try {
          const res = await api.getMe()
          setUser(res.user)
        } catch {
          clearStoredToken()
          setUser(null)
        }
      }
      setIsLoading(false)
    }
    checkAuth()
  }, [])

  const login = async (email: string, pass: string): Promise<User> => {
    const res = await api.login(email, pass)
    setUser(res.user)
    return res.user
  }

  const register = async (data: { email: string; password: string; full_name: string; role: string; teacher_code?: string }): Promise<User> => {
    const res = await api.register(data)
    setUser(res.user)
    return res.user
  }

  const logout = () => {
    clearStoredToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
