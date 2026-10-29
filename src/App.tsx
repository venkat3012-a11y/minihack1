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
import { AiModelImprovement } from './components/teacher/AiModelImprovement'
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
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Loading EvalAI…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LandingPage />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      <div>
        <Navbar
          currentTab={currentTab}
          onTabChange={tab => setCurrentTab(tab)}
        />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          {user.role === 'teacher' && (
            <>
              {currentTab === 'evaluate' && <EvaluationUploader />}
              {currentTab === 'pending' && <PendingVerificationQueue />}
              {currentTab === 'exams' && <ExamManagement />}
              {currentTab === 'students' && <StudentManagement />}
              {currentTab === 'history' && <EvaluationHistory />}
              {currentTab === 'analytics' && <ClassAnalytics />}
              {currentTab === 'ai-improvement' && <AiModelImprovement />}
            </>
          )}

          {user.role === 'student' && (
            <>
              {currentTab === 'results' && <MyResults />}
            </>
          )}
        </main>
      </div>

      <footer className="border-t border-slate-200/80 bg-white py-4 text-center text-xs text-slate-500">
        <p>EvalAI · Automated Mathematics Answer Evaluation & Personalized Learning System · Gemini AI & SymPy Core</p>
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
