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
    <div className="relative min-h-screen bg-slate-50/90 text-slate-900 flex flex-col justify-between overflow-hidden">
      {/* Ambient background glow inspired by modern Lovable canvas */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-tr from-indigo-500/10 via-purple-500/10 to-teal-500/5 blur-3xl opacity-70" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[400px] bg-gradient-to-tl from-indigo-500/5 to-teal-500/5 blur-3xl opacity-50" />

      {/* Top Banner */}
      <div className="relative z-10 border-b border-indigo-900/30 bg-slate-950 px-4 py-2.5 text-center text-xs text-slate-300 shadow-xs backdrop-blur-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <span className="flex h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
          <strong className="text-white">EvalAI:</strong> AI-Powered Mathematics Answer Evaluation System with Gemini & SymPy.
        </span>
      </div>

      {/* Main Container */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 flex-1 w-full flex flex-col justify-center">
        {/* Header Hero */}
        <div className="text-center max-w-3xl mx-auto space-y-5 animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/90 bg-indigo-50/90 px-4 py-1.5 text-xs font-bold text-indigo-700 shadow-xs backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600 animate-spin-slow" />
            <span>Pure Mathematics Automated Evaluation</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
            Automated Mathematics Answer Evaluation & <span className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 bg-clip-text text-transparent">Rubric-Based</span> Grading
          </h1>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed">
            Upload Question Paper, Teacher Answer Key, and Student Test Paper. Gemini multimodal AI extracts questions
            and evaluates working steps with SymPy symbolic verification.
          </p>
        </div>

        {/* Separate Teacher and Student Portals */}
        <div className="mt-12 sm:mt-16 grid gap-6 md:grid-cols-2 max-w-4xl mx-auto w-full">
          {/* Teacher Portal Box */}
          <div className="group relative rounded-3xl border border-slate-200/80 bg-white/95 p-6 sm:p-8 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-indigo-300/80 hover:shadow-card-hover hover:-translate-y-1 flex flex-col justify-between">
            <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-indigo-600 to-indigo-700 opacity-90 group-hover:opacity-100 transition-opacity" />

            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-500/20">
                  <BookOpen className="h-6 w-6" />
                </div>
                <span className="badge-indigo">Educator & Grader</span>
              </div>

              <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Teacher Portal</h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                Upload Question Paper, Answer Key, and Student Written Test. Inspect proposed marks, adjust scores,
                add notes, and publish verified marks.
              </p>

              <ul className="mt-6 space-y-2.5 text-xs font-medium text-slate-600">
                <li className="flex items-center gap-2.5">
                  <span className="rounded-full bg-emerald-50 p-1 text-emerald-600 border border-emerald-200/60 shadow-xs"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                  <span>3-file input: Question Paper, Answer Key, Student Sheet</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="rounded-full bg-emerald-50 p-1 text-emerald-600 border border-emerald-200/60 shadow-xs"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                  <span>Multimodal analysis with Google Gen AI SDK + SymPy verification</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="rounded-full bg-emerald-50 p-1 text-emerald-600 border border-emerald-200/60 shadow-xs"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                  <span>Review proposed marks, adjust scores & approve before publishing</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <button
                onClick={() => handleOpenPortal('teacher')}
                className="btn-primary w-full py-3 text-xs sm:text-sm font-semibold shadow-md shadow-indigo-500/20"
              >
                <span>Teacher Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[11px] text-center text-slate-400 mt-2.5 font-mono">
                Demo: teacher@evalai.edu / teacher123
              </p>
            </div>
          </div>

          {/* Student Portal Box */}
          <div className="group relative rounded-3xl border border-slate-200/80 bg-white/95 p-6 sm:p-8 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-teal-300/80 hover:shadow-card-hover hover:-translate-y-1 flex flex-col justify-between">
            <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-teal-600 to-emerald-600 opacity-90 group-hover:opacity-100 transition-opacity" />

            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/25 ring-2 ring-teal-500/20">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <span className="badge-teal">Student & Learner</span>
              </div>

              <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Student Portal</h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                View your released marks, question-by-question evaluations, identified mistakes, diagnostic
                feedback, and download official PDF reports.
              </p>

              <ul className="mt-6 space-y-2.5 text-xs font-medium text-slate-600">
                <li className="flex items-center gap-2.5">
                  <span className="rounded-full bg-teal-50 p-1 text-teal-600 border border-teal-200/60 shadow-xs"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                  <span>Strict privacy: access only your own published evaluations</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="rounded-full bg-teal-50 p-1 text-teal-600 border border-teal-200/60 shadow-xs"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                  <span>Question-wise breakdown with student working vs model solution</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="rounded-full bg-teal-50 p-1 text-teal-600 border border-teal-200/60 shadow-xs"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                  <span>Diagnostic feedback, mistake notifications & PDF certificate download</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <button
                onClick={() => handleOpenPortal('student')}
                className="btn-teal w-full py-3 text-xs sm:text-sm font-semibold shadow-md shadow-teal-500/20"
              >
                <span>Student Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[11px] text-center text-slate-400 mt-2.5 font-mono">
                Demo: aarav@evalai.edu / student123
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Login / Register Modal */}
      {activePortal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-modal border border-slate-200/90 transition-all">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
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
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200 shadow-xs">
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
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isRegistering && activePortal === 'teacher' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="form-label">Teacher Verification Code</label>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Invite required</span>
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
                className={activePortal === 'teacher' ? 'btn-primary w-full mt-2.5 py-3 text-xs sm:text-sm' : 'btn-teal w-full mt-2.5 py-3 text-xs sm:text-sm'}
              >
                {loading ? 'Authenticating…' : isRegistering ? 'Register Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => { setIsRegistering(!isRegistering); setError('') }}
                className="text-indigo-600 font-semibold hover:text-indigo-700 hover:underline"
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
                className="text-slate-500 hover:text-slate-900 font-medium"
              >
                Reset to Demo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200/70 bg-white/80 backdrop-blur-xs py-4 text-center text-xs text-slate-500 shadow-xs">
        <p className="font-medium text-slate-600">EvalAI · Automated Mathematics Answer Evaluation System</p>
      </footer>
    </div>
  )
}
