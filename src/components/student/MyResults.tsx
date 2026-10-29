import React, { useState, useEffect } from 'react'
import {
  CheckCircle2,
  BookOpen,
  Download,
  ArrowLeft,
  AlertCircle,
  Award,
  TrendingUp,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  UserCheck,
  RefreshCw
} from 'lucide-react'
import {
  api,
  StudentResult,
  StudentResultDetail,
  EvaluationQuestion,
  StudentDashboardData
} from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export const MyResults: React.FC = () => {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState<StudentDashboardData | null>(null)
  const [results, setResults] = useState<StudentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<StudentResultDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [dashRes, resRes] = await Promise.all([
        api.getStudentDashboard().catch(() => null),
        api.getMyResults().catch(() => ({ results: [], analytics: null }))
      ])
      if (dashRes) setDashboard(dashRes)
      if (resRes?.results) setResults(resRes.results)
    } catch (err: any) {
      setError(err?.message || 'Failed to load student dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadDetail = async (id: string) => {
    setLoadingDetail(true)
    setSelectedId(id)
    try {
      const res = await api.getMyResultDetail(id)
      setDetail(res.evaluation)
    } catch (err: any) {
      setError(err?.message || 'Failed to load test details.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleDownloadPdf = async (evalId: string, title: string) => {
    try {
      const blob = await api.exportPdf(evalId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `evalai_results_${title.replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('PDF download failed: ' + (err?.message || 'Unknown error'))
    }
  }

  // Question detail view
  if (detail && selectedId) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedId(null); setDetail(null) }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{detail.test_title}</h1>
              <p className="text-xs text-slate-500">Official Teacher-Approved Evaluation</p>
            </div>
          </div>
          <button
            onClick={() => handleDownloadPdf(detail.id, detail.test_title)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
          >
            <Download className="h-3.5 w-3.5" /> Download PDF Report
          </button>
        </div>

        {/* Score Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                Official Marks Published
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-indigo-900/80 text-indigo-200 border border-indigo-600/50">
                {detail.engine || 'Gemini Multimodal AI + SymPy'}
              </span>
            </div>
            <h2 className="text-xl font-bold mt-1">{detail.test_title}</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Student: {detail.student_name} · Roll No: <strong className="text-teal-300 font-mono">{user?.roll_number || '25ALR001'}</strong>
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 uppercase font-semibold">Your Score</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-teal-400">{detail.total_final_score}</span>
              <span className="text-slate-400">/ {detail.max_score} marks</span>
            </div>
            <div className="text-sm font-bold text-teal-300">
              {detail.max_score > 0 ? Math.round((detail.total_final_score / detail.max_score) * 100) : 0}% aggregate
            </div>
          </div>
        </div>

        {detail.teacher_comments && (
          <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 text-xs text-indigo-950">
            <strong className="font-semibold text-indigo-900">Teacher Feedback & Overall Remarks:</strong>
            <p className="mt-1 text-slate-700 leading-relaxed">{detail.teacher_comments}</p>
          </div>
        )}

        {/* Question by question breakdown */}
        <div className="space-y-4">
          {(detail.questions || []).map((q: EvaluationQuestion, idx: number) => (
            <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-start justify-between pb-2 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">
                      Question {q.question_num}
                    </span>
                    {q.alternative_method && (
                      <span className="rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-xs font-semibold text-teal-700">
                        ✓ Valid Alternative Method Accepted
                      </span>
                    )}
                    {q.flagged_ambiguity && (
                      <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        ⚠ Ambiguity / Handwriting Note
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-900 mt-2">{q.text}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-base font-bold ${q.final_marks >= q.max_marks * 0.99 ? 'text-emerald-700' : q.final_marks > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
                    {q.final_marks}
                  </span>
                  <span className="text-slate-400"> / {q.max_marks} marks</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 text-xs">
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Your Submitted Working</div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 font-mono whitespace-pre-wrap min-h-12 text-slate-800">
                    {q.student_working || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Teacher Model Solution & Step Rubric</div>
                  <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-3 font-mono whitespace-pre-wrap text-emerald-950">
                    {q.model_solution || '—'}
                  </div>
                </div>
              </div>

              {q.mistakes && q.mistakes.length > 0 && (
                <div className="text-xs bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <strong className="text-rose-900 font-semibold">Identified Mistakes & Inaccuracies:</strong>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-rose-800">
                    {q.mistakes.map((m, mi) => (
                      <li key={mi}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {q.feedback && (
                <div className="text-xs bg-teal-50 border border-teal-200 rounded-lg p-3 text-teal-950">
                  <strong className="text-teal-900 font-semibold">AI Step-by-Step Feedback:</strong>
                  <p className="mt-0.5">{q.feedback}</p>
                </div>
              )}

              {q.teacher_note && (
                <div className="text-xs bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-indigo-950">
                  <strong className="text-indigo-900 font-semibold">Teacher Verification Note:</strong>
                  <p className="mt-0.5">{q.teacher_note}</p>
                </div>
              )}

              {q.flagged_ambiguity && (
                <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                  <strong className="font-semibold">Handwriting Note:</strong>
                  <p className="mt-0.5">{q.flagged_ambiguity}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Dashboard Overview
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Student Profile & Roll Number Banner */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-700 to-indigo-600 text-white font-bold text-xl shadow-xs">
            {user?.full_name?.charAt(0) || 'S'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{user?.full_name}</h1>
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200 font-mono">
                {user?.roll_number || '25ALR001'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Class: <strong className="text-slate-700">{user?.class_name || 'Class 10'}</strong> · Subject: <strong className="text-teal-700">Mathematics</strong>
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Overall Score</span>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-3 text-2xl font-bold text-indigo-700">
            {dashboard?.analytics?.overall_percentage != null ? `${dashboard.analytics.overall_percentage}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">Cumulative average</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Grade Band</span>
            <Award className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-700">
            {dashboard?.analytics?.grade_band || 'A'}
          </div>
          <div className="mt-1 text-xs text-slate-500">Performance tier</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Marks Earned</span>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-3 text-xl font-bold text-slate-900">
            {dashboard?.analytics?.total_marks_earned != null ? `${dashboard.analytics.total_marks_earned} / ${dashboard.analytics.total_possible_marks}` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">Total marks accumulated</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Evaluated Exams</span>
            <BookOpen className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-3 text-2xl font-bold text-purple-700">
            {dashboard?.analytics?.exams_completed || results.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Published test papers</div>
        </div>
      </div>

      {/* Personalized Learning: Strengths, Weak Topics & Recommendations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Strengths & Weaknesses */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-600" />
            Curriculum Strengths & Focus Areas
          </h2>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Demonstrated Strengths
              </div>
              <div className="flex flex-wrap gap-2">
                {dashboard?.strengths && dashboard.strengths.length > 0 ? (
                  dashboard.strengths.map((s, i) => (
                    <span key={i} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">Complete more evaluations to identify strengths.</span>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-amber-600" /> Recommended Topics to Practice
              </div>
              <div className="flex flex-wrap gap-2">
                {dashboard?.weak_topics && dashboard.weak_topics.length > 0 ? (
                  dashboard.weak_topics.map((w, i) => (
                    <span key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                      {w}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No weak topics identified yet.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Personalized Recommendations */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Personalized Learning Action Items
          </h2>
          <p className="text-xs text-slate-500">Targeted mathematical suggestions tailored to your recent test results.</p>

          <div className="mt-3 space-y-2.5">
            {dashboard?.recommendations && dashboard.recommendations.length > 0 ? (
              dashboard.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-xs text-indigo-950">
                  <Sparkles className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{rec}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">Recommendations will be generated after your first test evaluation is published.</p>
            )}
          </div>
        </div>
      </div>

      {/* Published Evaluations List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          My Evaluated Mathematics Answer Sheets
        </h2>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" /> Loading your results…
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
            <BookOpen className="h-10 w-10 text-slate-400 mx-auto" />
            <h3 className="mt-3 font-bold text-slate-800">No Published Evaluations Yet</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Your teacher will upload and review your mathematics answer sheet. Once approved, your score and question feedback will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map(r => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">{r.test_title}</h3>
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Teacher Approved
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Published on {new Date(r.published_at).toLocaleDateString()} · {r.questions_count} evaluated questions
                  </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="text-right">
                    <span className="text-lg font-extrabold text-teal-700">
                      {r.total_final_score} / {r.max_score}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">marks</span>
                    <div className="text-xs font-semibold text-slate-600">
                      {r.max_score > 0 ? Math.round((r.total_final_score / r.max_score) * 100) : 0}%
                    </div>
                  </div>
                  <button
                    onClick={() => loadDetail(r.id)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
