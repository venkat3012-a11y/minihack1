import React, { useState } from 'react'
import {
  GraduationCap, BookOpen, ArrowRight,
  CheckCircle2, Sparkles, AlertCircle, Eye, EyeOff
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export const LandingPage: React.FC = () => {
  const { login, register } = useAuth()

  const [activePortal, setActivePortal] = useState<'teacher' | 'student' | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [teacherCode, setTeacherCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleOpenPortal = (portal: 'teacher' | 'student') => {
    setActivePortal(portal)
    setIsRegistering(false)
    setError('')
    setEmail(portal === 'teacher' ? 'teacher@evalai.edu' : 'aarav@evalai.edu')
    setPassword(portal === 'teacher' ? 'teacher123' : 'student123')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please provide email and password.')
      return
    }
    if (isRegistering && !fullName) {
      setError('Please provide your full name.')
      return
    }
    if (isRegistering && activePortal === 'teacher' && !teacherCode) {
      setError('Please enter the Teacher Verification Code to create a teacher account.')
      return
    }

    setLoading(true)
    setError('')
    try {
      if (isRegistering) {
        await register({
          email,
          password,
          full_name: fullName,
          role: activePortal || 'student',
          teacher_code: activePortal === 'teacher' ? teacherCode : undefined
        })
      } else {
        await login(email, password)
      }
    } catch (err) {
      setError((err as Error).message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Top Banner */}
      <div className="border-b border-indigo-900/30 bg-slate-900 px-4 py-2 text-center text-xs text-slate-300">
        <span className="inline-flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-teal-400" />
          <strong className="text-white">EvalAI:</strong> AI-Powered Mathematics Answer Evaluation System with Gemini & SymPy.
        </span>
      </div>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:py-16 flex-1 w-full flex flex-col justify-center">
        {/* Header Hero */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3.5 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Pure Mathematics Automated Evaluation</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Automated Mathematics Answer Evaluation & <span className="text-indigo-600">Rubric-Based</span> Grading
          </h1>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
            Upload Question Paper, Teacher Answer Key, and Student Test Paper. Gemini multimodal AI extracts questions
            and evaluates working steps with SymPy symbolic verification.
          </p>
        </div>

        {/* Separate Teacher and Student Portals */}
        <div className="mt-12 grid gap-6 md:grid-cols-2 max-w-4xl mx-auto w-full">
          {/* Teacher Portal Box */}
          <div className="rounded-2xl border-2 border-indigo-200 bg-white p-6 sm:p-8 shadow-sm transition-all hover:shadow-md hover:border-indigo-400 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  <BookOpen className="h-6 w-6" />
                </div>
                <span className="badge-indigo">Educator & Grader</span>
              </div>

              <h2 className="mt-5 text-2xl font-bold text-slate-900">Teacher Portal</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Upload Question Paper, Answer Key, and Student Written Test. Inspect proposed marks, adjust scores,
                add notes, and publish verified marks.
              </p>

              <ul className="mt-5 space-y-2 text-xs font-medium text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>3-file input: Question Paper, Answer Key, Student Sheet</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Multimodal analysis with Google Gen AI SDK + SymPy verification</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Review proposed marks, adjust scores & approve before publishing</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <button
                onClick={() => handleOpenPortal('teacher')}
                className="btn-primary w-full py-3 font-semibold shadow-sm"
              >
                <span>Teacher Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[11px] text-center text-slate-400 mt-2 font-mono">
                Demo: teacher@evalai.edu / teacher123
              </p>
            </div>
          </div>

          {/* Student Portal Box */}
          <div className="rounded-2xl border-2 border-teal-200 bg-white p-6 sm:p-8 shadow-sm transition-all hover:shadow-md hover:border-teal-400 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <span className="badge-teal">Student & Learner</span>
              </div>

              <h2 className="mt-5 text-2xl font-bold text-slate-900">Student Portal</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                View your released marks, question-by-question evaluations, identified mistakes, diagnostic
                feedback, and download official PDF reports.
              </p>

              <ul className="mt-5 space-y-2 text-xs font-medium text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
                  <span>Strict privacy: access only your own published evaluations</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
                  <span>Question-wise breakdown with student working vs model solution</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
                  <span>Diagnostic feedback, mistake notifications & PDF certificate download</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <button
                onClick={() => handleOpenPortal('student')}
                className="btn-teal w-full py-3 font-semibold shadow-sm"
              >
                <span>Student Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[11px] text-center text-slate-400 mt-2 font-mono">
                Demo: aarav@evalai.edu / student123
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Login / Register Modal */}
      {activePortal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className={activePortal === 'teacher' ? 'badge-indigo' : 'badge-teal'}>
                  {activePortal === 'teacher' ? 'Teacher Portal' : 'Student Portal'}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {isRegistering ? 'Create Account' : 'Sign In'}
                </span>
              </div>
              <button
                onClick={() => setActivePortal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              {isRegistering && (
                <div>
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder={activePortal === 'teacher' ? 'Dr. Sarah Sharma' : 'Aarav Patel'}
                    className="form-input"
                  />
                </div>
              )}

              <div>
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@evalai.edu"
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="form-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isRegistering && activePortal === 'teacher' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="form-label">Teacher Verification Code</label>
                    <span className="text-[11px] text-slate-400 font-mono">Invite required</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={teacherCode}
                    onChange={e => setTeacherCode(e.target.value)}
                    placeholder="e.g. EVALAI-TEACHER-2026"
                    className="form-input font-mono"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Prevents unauthorized teacher registrations. Contact administrator if unknown.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={activePortal === 'teacher' ? 'btn-primary w-full mt-2' : 'btn-teal w-full mt-2'}
              >
                {loading ? 'Authenticating…' : isRegistering ? 'Register Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => { setIsRegistering(!isRegistering); setError('') }}
                className="text-indigo-600 font-semibold hover:underline"
              >
                {isRegistering ? 'Already have an account? Sign In' : 'New user? Register account'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activePortal === 'teacher') {
                    setEmail('teacher@evalai.edu')
                    setPassword('teacher123')
                  } else {
                    setEmail('aarav@evalai.edu')
                    setPassword('student123')
                  }
                }}
                className="text-slate-500 hover:text-slate-800"
              >
                Reset to Demo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <p>EvalAI · Automated Mathematics Answer Evaluation System</p>
      </footer>
    </div>
  )
}
