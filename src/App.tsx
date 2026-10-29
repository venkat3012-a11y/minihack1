import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Navbar } from './components/common/Navbar'
import { LandingPage } from './components/landing/LandingPage'
import { EvaluationUploader } from './components/teacher/EvaluationUploader'
import { EvaluationHistory } from './components/teacher/EvaluationHistory'
import { StudentManagement } from './components/teacher/StudentManagement'
import { ExamManagement } from './components/teacher/ExamManagement'
import { PendingVerificationQueue } from './components/teacher/PendingVerificationQueue'
import { ClassAnalytics } from './components/teacher/ClassAnalytics'
import { MyResults } from './components/student/MyResults'

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth()
  const [currentTab, setCurrentTab] = useState<string>('evaluate')

  useEffect(() => {
    if (user) {
      setCurrentTab(user.role === 'teacher' ? 'evaluate' : 'results')
    }
  }, [user])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-200 animate-ping opacity-25" />
            <div className="h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Loading EvalAI…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LandingPage />
  }

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 flex flex-col justify-between">
      <div>
        <Navbar
          currentTab={currentTab}
          onTabChange={tab => setCurrentTab(tab)}
        />

        <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 animate-fade-in">
          {user.role === 'teacher' && (
            <>
              {currentTab === 'evaluate' && <EvaluationUploader />}
              {currentTab === 'pending' && <PendingVerificationQueue />}
              {currentTab === 'exams' && <ExamManagement />}
              {currentTab === 'students' && <StudentManagement />}
              {currentTab === 'history' && <EvaluationHistory />}
              {currentTab === 'analytics' && <ClassAnalytics />}
            </>
          )}

          {user.role === 'student' && (
            <>
              {currentTab === 'results' && <MyResults />}
            </>
          )}
        </main>
      </div>

      <footer className="border-t border-slate-200/70 bg-white/80 backdrop-blur-sm py-5 text-center text-xs text-slate-500 shadow-xs">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="font-medium text-slate-600">EvalAI · Automated Mathematics Answer Evaluation & Personalized Learning System</p>
          <p className="text-[11px] text-slate-400">Gemini AI Multimodal & SymPy Symbolic Core</p>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
