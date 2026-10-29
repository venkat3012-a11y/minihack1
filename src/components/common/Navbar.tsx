import React, { useState, useEffect } from 'react'
import {
  BookOpen,
  ClipboardCheck,
  LogOut,
  UserCircle2,
  CheckCircle2,
  Users,
  GraduationCap,
  Clock,
  BarChart3
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

interface NavbarProps {
  currentTab: string
  onTabChange: (tab: string) => void
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, logout } = useAuth()
  const isTeacher = user?.role === 'teacher'
  const [pendingCount, setPendingCount] = useState<number>(0)

  useEffect(() => {
    if (isTeacher) {
      api.getPendingSheets()
        .then(res => setPendingCount(res.count || 0))
        .catch(() => {})
    }
  }, [isTeacher, currentTab])

  const teacherTabs = [
    { id: 'evaluate', label: 'Evaluate Test', icon: BookOpen },
    { id: 'pending', label: 'Pending Verification', icon: Clock, badge: pendingCount },
    { id: 'exams', label: 'Exams & Rubrics', icon: GraduationCap },
    { id: 'students', label: 'Student Roster', icon: Users },
    { id: 'history', label: 'Evaluation History', icon: ClipboardCheck },
    { id: 'analytics', label: 'Class Analytics', icon: BarChart3 },
  ]

  const studentTabs = [
    { id: 'results', label: 'My Results & Analytics', icon: CheckCircle2 },
  ]

  const tabs = isTeacher ? teacherTabs : studentTabs

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/75 bg-white/85 backdrop-blur-md shadow-[0_2px_15px_-3px_rgba(15,23,42,0.03)] transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-500/20">
            <span className="font-serif text-xl font-bold">∑</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900">EvalAI</span>
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200/70 shadow-xs uppercase tracking-wider">
                Mathematics
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Automated Answer Evaluation & Personalized Learning</p>
          </div>
        </div>

        {/* User Badge & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-1.5 shadow-xs backdrop-blur-sm">
            <div className="relative">
              <UserCircle2 className={`h-5 w-5 ${isTeacher ? 'text-indigo-600' : 'text-teal-600'}`} />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="text-left text-xs">
              <div className="font-semibold text-slate-800 leading-tight">
                {user?.full_name} {user?.roll_number && <span className="font-mono text-indigo-700 font-bold bg-indigo-50/80 px-1.5 py-0.2 rounded border border-indigo-200/60 ml-1">({user.roll_number})</span>}
              </div>
              <div className="text-[11px] text-slate-500 capitalize">{user?.role} {user?.class_name ? `· ${user.class_name}` : ''}</div>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 active:scale-95 transition-all duration-150"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-t border-slate-200/60 bg-white/95">
        <div className="mx-auto flex max-w-7xl space-x-1 overflow-x-auto px-4 sm:px-6 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon
            const active = currentTab === tab.id
            const badgeCount = (tab as any).badge || 0
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`group relative flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 text-indigo-700 font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className={`h-4 w-4 transition-transform duration-200 group-hover:scale-110 ${active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span>{tab.label}</span>
                {badgeCount > 0 && (
                  <span className="rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs animate-pulse">
                    {badgeCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
