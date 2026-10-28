import React, { useState, useEffect } from 'react'
import { CheckCircle2, BookOpen, Download, ArrowLeft, AlertCircle } from 'lucide-react'
import { api, StudentResult, StudentResultDetail, EvaluationQuestion, StudentAnalytics } from '../../services/api'

export const MyResults: React.FC = () => {
  const [results, setResults] = useState<StudentResult[]>([])
  const [analytics, setAnalytics] = useState<StudentAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<StudentResultDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    api.getMyResults()
      .then(res => {
        setResults(res.results || [])
        setAnalytics(res.analytics)
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const loadDetail = async (id: string) => {
    setLoadingDetail(true)
    setSelectedId(id)
    try {
      const res = await api.getMyResultDetail(id)
      setDetail(res.evaluation)
    } catch (err) {
      setError((err as Error).message)
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
    } catch (err) {
      alert('PDF download failed: ' + (err as Error).message)
    }
  }

  if (detail && selectedId) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedId(null); setDetail(null) }}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Back to My Results
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{detail.test_title}</h1>
              <p className="text-xs text-slate-500">Official Released Mathematics Evaluation</p>
            </div>
          </div>
          <button
            onClick={() => handleDownloadPdf(detail.id, detail.test_title)}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Download PDF Report
          </button>
        </div>

        {/* Score Banner */}
        <div className="card-premium bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-0 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge-teal">Results Published</span>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                (detail.engine || '').includes('Gemini')
                  ? 'bg-indigo-900/80 text-indigo-200 border border-indigo-600/50'
                  : 'bg-amber-900/80 text-amber-200 border border-amber-600/50'
              }`}>
                Engine: {detail.engine || 'Gemini AI + SymPy'}
              </span>
            </div>
            <h2 className="text-xl font-bold mt-1">{detail.test_title}</h2>
            <p className="text-xs text-slate-300 mt-0.5">Student: {detail.student_name}</p>
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
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-900">
            <b>Teacher Feedback:</b> {detail.teacher_comments}
          </div>
        )}

        {/* Question by question breakdown */}
        <div className="space-y-4">
          {(detail.questions || []).map((q: EvaluationQuestion, idx: number) => (
            <div key={idx} className="card-premium space-y-3 border-slate-200">
              <div className="flex items-start justify-between pb-2 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge-indigo">Question {q.question_num}</span>
                    {q.alternative_method && <span className="badge-teal">✓ Valid Alt. Method Accepted</span>}
                    {q.flagged_ambiguity && <span className="badge-warning">⚠ Handwriting Note</span>}
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
                  <div className="rounded bg-slate-50 border border-slate-200 p-2.5 font-mono whitespace-pre-wrap min-h-10 text-slate-800">
                    {q.student_working || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Model Solution</div>
                  <div className="rounded bg-emerald-50/60 border border-emerald-200 p-2.5 font-mono whitespace-pre-wrap text-emerald-950">
                    {q.model_solution || '—'}
                  </div>
                </div>
              </div>

              {q.mistakes && q.mistakes.length > 0 && (
                <div className="text-xs bg-rose-50 border border-rose-200 rounded p-2.5">
                  <b className="text-rose-800">Mistakes Detected:</b>
                  <ul className="mt-1 space-y-0.5">
                    {q.mistakes.map((m, mi) => (
                      <li key={mi} className="text-rose-700">• {m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {q.feedback && (
                <div className="text-xs bg-teal-50 border border-teal-200 rounded p-2.5 text-teal-950">
                  <b>AI Feedback:</b> {q.feedback}
                </div>
              )}

              {q.teacher_note && (
                <div className="text-xs bg-indigo-50 border border-indigo-200 rounded p-2.5 text-indigo-900">
                  <b>Teacher Note:</b> {q.teacher_note}
                </div>
              )}

              {q.flagged_ambiguity && (
                <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2.5 text-amber-900">
                  <b>Handwriting Clarification:</b> {q.flagged_ambiguity}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Mathematics Results</h1>
        <p className="text-xs text-slate-500">
          View your released test scores, step-by-step mathematical feedback, and teacher notes.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Real Analytics Summary Bar */}
      {analytics && analytics.tests_completed > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div className="card-premium text-center p-3.5">
            <div className="text-2xl font-extrabold text-indigo-700">{analytics.tests_completed}</div>
            <div className="text-xs text-slate-500 mt-0.5">Tests Completed</div>
          </div>
          <div className="card-premium text-center p-3.5">
            <div className="text-2xl font-extrabold text-emerald-700">{analytics.overall_percentage}%</div>
            <div className="text-xs text-slate-500 mt-0.5">Overall Average</div>
          </div>
          <div className="card-premium text-center p-3.5">
            <div className="text-2xl font-extrabold text-slate-800">
              {analytics.total_marks_earned} / {analytics.total_max_marks}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Total Marks</div>
          </div>
          <div className="card-premium text-center p-3.5">
            <div className="text-2xl font-extrabold text-teal-700">{analytics.questions_fully_correct}</div>
            <div className="text-xs text-slate-500 mt-0.5">Fully Correct Questions</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-xs text-slate-500">Loading your results…</div>
      ) : results.length === 0 ? (
        <div className="card-premium p-10 text-center space-y-2">
          <BookOpen className="h-10 w-10 text-slate-400 mx-auto" />
          <p className="font-bold text-slate-800">No published results available yet</p>
          <p className="text-xs text-slate-500">
            Your teacher will review your evaluated answer sheet and publish the results here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map(r => (
            <div key={r.id} className="card-premium flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-slate-900">{r.test_title}</h3>
                  <span className="badge-success inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Published
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Published on {new Date(r.published_at).toLocaleDateString()} · {r.questions_count} questions
                </p>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4">
                <div className="text-right">
                  <span className="text-lg font-extrabold text-teal-700">
                    {r.total_final_score} / {r.max_score}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">marks</span>
                  <div className="text-xs text-slate-500">
                    {r.max_score > 0 ? Math.round((r.total_final_score / r.max_score) * 100) : 0}%
                  </div>
                </div>
                <button
                  onClick={() => loadDetail(r.id)}
                  className="btn-secondary text-xs py-1.5 px-3 font-semibold text-indigo-700"
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

