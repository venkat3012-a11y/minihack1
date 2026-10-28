import React, { useState, useEffect } from 'react'
import { CheckCircle2, Clock, Download, Eye, AlertCircle, BarChart3, ArrowLeft } from 'lucide-react'
import { api, EvaluationRecord, EvaluationQuestion } from '../../services/api'

export const EvaluationHistory: React.FC = () => {
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<(EvaluationRecord & { questions: EvaluationQuestion[] }) | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    api.getTeacherEvaluations()
      .then(res => setEvaluations(res.evaluations || []))
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const loadDetail = async (id: string) => {
    setLoadingDetail(true)
    setSelectedId(id)
    try {
      const res = await api.getTeacherEvaluationDetail(id)
      setDetail(res.evaluation)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleDownloadPdf = async (evalId: string, studentName: string, testTitle: string) => {
    try {
      const blob = await api.exportPdf(evalId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `evalai_${testTitle.replace(/\s+/g, '_')}_${studentName.replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('PDF export failed: ' + (err as Error).message)
    }
  }

  if (detail && selectedId) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedId(null); setDetail(null) }}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to History
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{detail.test_title}</h1>
              <p className="text-xs text-slate-500">{detail.student_name} ({detail.student_email})</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge-${detail.status === 'published' ? 'success' : 'warning'}`}>
              {detail.status === 'published' ? 'Published' : 'Pending Review'}
            </span>
            <button
              onClick={() => handleDownloadPdf(detail.id, detail.student_name, detail.test_title)}
              className="btn-secondary text-xs py-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* Score Summary */}
        <div className="card-premium bg-slate-900 text-white border-0 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Total Approved Marks</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-extrabold text-teal-400">{detail.total_final_score}</span>
              <span className="text-slate-400">/ {detail.max_score} marks</span>
              <span className="text-teal-300 font-semibold ml-2">
                ({detail.max_score > 0 ? Math.round((detail.total_final_score / detail.max_score) * 100) : 0}%)
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Engine: <span className="text-slate-200 font-mono">{detail.engine}</span>
          </div>
        </div>

        {detail.teacher_comments && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-900">
            <b>Teacher Comments:</b> {detail.teacher_comments}
          </div>
        )}

        {/* Question by question view */}
        <div className="space-y-4">
          {(detail.questions || []).map((q, idx) => (
            <div key={idx} className="card-premium space-y-3">
              <div className="flex items-start justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="badge-indigo">Question {q.question_num}</span>
                  {q.flagged_ambiguity && <span className="badge-warning">⚠ Ambiguity Flagged</span>}
                  {q.alternative_method && <span className="badge-teal">✓ Alt. Method</span>}
                </div>
                <span className="text-base font-bold text-indigo-700">
                  {q.final_marks} / {q.max_marks} marks
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800">{q.text}</p>
              <div className="grid gap-3 md:grid-cols-2 text-xs">
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Student Working</div>
                  <div className="rounded bg-slate-50 border border-slate-200 p-2.5 font-mono whitespace-pre-wrap">{q.student_working || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Model Solution</div>
                  <div className="rounded bg-emerald-50/60 border border-emerald-200 p-2.5 font-mono whitespace-pre-wrap">{q.model_solution || '—'}</div>
                </div>
              </div>
              {q.mistakes?.length > 0 && (
                <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded p-2">
                  <b>Mistakes:</b> {q.mistakes.join('; ')}
                </div>
              )}
              {q.feedback && (
                <div className="text-xs text-teal-950 bg-teal-50 border border-teal-200 rounded p-2">
                  <b>Feedback:</b> {q.feedback}
                </div>
              )}
              {q.teacher_note && (
                <div className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded p-2">
                  <b>Teacher Note:</b> {q.teacher_note}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Evaluation History</h1>
        <p className="text-xs text-slate-500">
          Audit past mathematics evaluations. Published records are accessible to their respective students.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-xs text-slate-500">Loading evaluations…</div>
      ) : evaluations.length === 0 ? (
        <div className="card-premium p-10 text-center space-y-2">
          <BarChart3 className="h-10 w-10 text-slate-400 mx-auto" />
          <p className="font-bold text-slate-800">No evaluations recorded yet</p>
          <p className="text-xs text-slate-500">Upload documents on the Evaluate tab to evaluate student work.</p>
        </div>
      ) : (
        <div className="card-premium overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Test Title</th>
                  <th className="py-3 px-4">Marks</th>
                  <th className="py-3 px-4">Engine</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {evaluations.map(ev => (
                  <tr key={ev.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{ev.student_name}</td>
                    <td className="py-3 px-4">{ev.test_title}</td>
                    <td className="py-3 px-4">
                      <span className="font-extrabold text-indigo-700">{ev.total_final_score}</span>
                      <span className="text-slate-400"> / {ev.max_score}</span>
                      <span className="text-slate-400 ml-1">
                        ({ev.max_score > 0 ? Math.round((ev.total_final_score / ev.max_score) * 100) : 0}%)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px] max-w-40 truncate">{ev.engine}</td>
                    <td className="py-3 px-4">
                      {ev.status === 'published' ? (
                        <span className="badge-success inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Published
                        </span>
                      ) : (
                        <span className="badge-warning inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Pending Review
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{new Date(ev.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => loadDetail(ev.id)}
                          className="btn-secondary text-xs py-1 px-2.5 text-indigo-700 font-semibold"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(ev.id, ev.student_name, ev.test_title)}
                          className="btn-secondary text-xs py-1 px-2.5"
                          title="Download Evaluation PDF"
                        >
                          <Download className="h-3 w-3" />
                          <span>PDF</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

