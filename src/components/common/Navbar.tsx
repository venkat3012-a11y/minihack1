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
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-800 to-indigo-600 text-white shadow-sm">
            <span className="font-serif text-xl font-bold">∑</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900">EvalAI</span>
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
                Mathematics
              </span>
            </div>
            <p className="text-xs text-slate-500">Automated Answer Evaluation & Personalized Learning</p>
          </div>
        </div>

        {/* User Badge & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-1.5">
            <UserCircle2 className={`h-5 w-5 ${isTeacher ? 'text-indigo-600' : 'text-teal-600'}`} />
            <div className="text-left text-xs">
              <div className="font-semibold text-slate-800 leading-tight">
                {user?.full_name} {user?.roll_number && <span className="font-mono text-indigo-700 font-bold">({user.roll_number})</span>}
              </div>
              <div className="text-slate-500 capitalize">{user?.role} {user?.class_name ? `· ${user.class_name}` : ''}</div>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-t border-slate-200/60 bg-white">
        <div className="mx-auto flex max-w-7xl space-x-1 overflow-x-auto px-4 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon
            const active = currentTab === tab.id
            const badgeCount = (tab as any).badge || 0
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 text-indigo-700 font-bold'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {badgeCount > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
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
