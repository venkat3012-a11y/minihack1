import React, { useState, useEffect } from 'react'
import {
  BarChart3,
  TrendingUp,
  Download,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Percent,
  Users,
  Award,
  RefreshCw,
  BookOpen
} from 'lucide-react'
import { api, ClassAnalyticsSummary } from '../../services/api'

export const ClassAnalytics: React.FC = () => {
  const [data, setData] = useState<ClassAnalyticsSummary | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState<boolean>(false)

  const fetchAnalytics = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const summary = await api.getClassAnalytics()
      setData(summary)
    } catch (err: any) {
      setError(err?.message || 'Failed to load class analytics.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const handleExportCsv = async () => {
    setIsExporting(true)
    try {
      const blob = await api.downloadClassCsv()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `evalai_class_analytics_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(err?.message || 'Failed to export CSV report.')
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">Aggregating class performance analytics…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-rose-600" />
          <div>
            <h3 className="font-semibold">Unable to Load Class Analytics</h3>
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        </div>
        <button
          onClick={fetchAnalytics}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!data || data.total_evaluations === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <BarChart3 className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-800">No Evaluation Data Available Yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Class analytics will automatically populate once test answer sheets are evaluated and published by the teacher.
        </p>
      </div>
    )
  }

  const gradeColors: Record<string, { bg: string; bar: string; text: string }> = {
    'A+': { bg: 'bg-emerald-50 border-emerald-200', bar: 'bg-emerald-600', text: 'text-emerald-700' },
    'A': { bg: 'bg-teal-50 border-teal-200', bar: 'bg-teal-600', text: 'text-teal-700' },
    'B': { bg: 'bg-indigo-50 border-indigo-200', bar: 'bg-indigo-600', text: 'text-indigo-700' },
    'C': { bg: 'bg-amber-50 border-amber-200', bar: 'bg-amber-600', text: 'text-amber-700' },
    'Needs Improvement': { bg: 'bg-rose-50 border-rose-200', bar: 'bg-rose-600', text: 'text-rose-700' },
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Class Performance & Academic Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time evaluation statistics, grade distributions, SymPy-verified question difficulty index, and common error patterns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            Refresh
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting…' : 'Export Full CSV'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Evaluated Papers</span>
            <span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Users className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900">{data.total_evaluations}</div>
          <div className="mt-1 text-xs text-slate-500">Published test submissions</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Class Average</span>
            <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><Percent className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-indigo-700">{data.class_average_pct}%</div>
          <div className="mt-1 text-xs text-slate-500">Mean mathematical score</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Pass Rate</span>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-700">{data.pass_rate_pct}%</div>
          <div className="mt-1 text-xs text-slate-500">Scores at or above 50%</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Score Range</span>
            <span className="rounded-lg bg-purple-50 p-2 text-purple-600"><Award className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-purple-700">
            {data.highest_score_pct}% <span className="text-sm font-normal text-slate-400">/ {data.lowest_score_pct}%</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Highest vs Lowest score</div>
        </div>
      </div>

      {/* Grade Distribution */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          Academic Grade Distribution
        </h2>
        <p className="mt-1 text-xs text-slate-500">Student performance across standard academic percentage bands.</p>

        <div className="mt-6 space-y-4">
          {Object.entries(data.grade_distribution).map(([grade, count]) => {
            const pct = data.total_evaluations > 0 ? Math.round((count / data.total_evaluations) * 100) : 0
            const style = gradeColors[grade] || { bg: 'bg-slate-50 border-slate-200', bar: 'bg-slate-600', text: 'text-slate-700' }
            return (
              <div key={grade} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="font-semibold text-slate-800">{grade}</span>
                  <span className="text-slate-500">
                    {count} {count === 1 ? 'student' : 'students'} ({pct}%)
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                    style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Question Difficulty Index */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          Question Difficulty Index
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Aggregated question-by-question scoring performance. Flags questions where students experienced mathematical difficulty.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Q#</th>
                <th className="py-2.5 px-3 font-semibold">Question Summary</th>
                <th className="py-2.5 px-3 font-semibold text-right">Avg Score %</th>
                <th className="py-2.5 px-3 font-semibold text-center">Difficulty Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.question_difficulty.map((q) => {
                const badge =
                  q.difficulty === 'Easy'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : q.difficulty === 'Moderate'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'

                return (
                  <tr key={q.question_num} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-bold text-slate-900">Q{q.question_num}</td>
                    <td className="py-3 px-3 text-slate-700 font-medium max-w-md truncate">{q.text}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">{q.average_percentage}%</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge}`}>
                        {q.difficulty}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights: Strengths, Weaknesses, Common Mistakes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Topic Mastery */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            Curriculum Mastery Patterns
          </h2>

          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="h-4 w-4" /> Strong Topics (Class Mastery)
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.strong_topics.length > 0 ? (
                  data.strong_topics.map((t, i) => (
                    <span key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No mastered topics recorded yet</span>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1.5 mb-2">
                <AlertCircle className="h-4 w-4" /> Focus Areas (Weak Topics)
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.weak_topics.length > 0 ? (
                  data.weak_topics.map((t, i) => (
                    <span key={i} className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-800">
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No weak topics flagged</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Common Mistakes */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-indigo-600" />
            Common Student Misconceptions
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Frequently detected mathematical errors and missing intermediate working steps.
          </p>

          <div className="mt-4 space-y-2">
            {data.common_mistakes.length > 0 ? (
              data.common_mistakes.map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs">
                  <span className="text-slate-800 font-medium">{m.mistake}</span>
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 font-bold text-rose-700">
                    {m.occurrences} {m.occurrences === 1 ? 'case' : 'cases'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">No recurring misconceptions detected.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

