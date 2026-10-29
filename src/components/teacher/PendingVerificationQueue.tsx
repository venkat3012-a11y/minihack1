import React, { useState, useEffect } from 'react'
import {
  Inbox, CheckCircle2, AlertTriangle, Trash2, Eye,
  RefreshCw, Loader2, ArrowRight, UserCheck
} from 'lucide-react'
import { api, PendingSheet, User } from '../../services/api'

export const PendingVerificationQueue: React.FC = () => {
  const [pendingSheets, setPendingSheets] = useState<PendingSheet[]>([])
  const [students, setStudents] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Mapping state: { [sheetId]: studentId }
  const [selectedStudentMap, setSelectedStudentMap] = useState<Record<string, string>>({})
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [psRes, stRes] = await Promise.all([
        api.getPendingSheets(),
        api.getTeacherStudents()
      ])
      setPendingSheets(psRes.pending_sheets || [])
      setStudents(stRes.students || [])
    } catch (err) {
      setError((err as Error).message || 'Failed to load pending sheets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleResolveSheet = async (sheetId: string) => {
    const targetStudentId = selectedStudentMap[sheetId]
    if (!targetStudentId) {
      setError('Please select a student to map this answer sheet to.')
      return
    }

    setResolvingId(sheetId)
    setError('')
    try {
      const res = await api.resolvePendingSheet(sheetId, { student_id: targetStudentId })
      setSuccess(res.message)
      loadData()
    } catch (err) {
      setError((err as Error).message || 'Failed to resolve pending sheet.')
    } finally {
      setResolvingId(null)
    }
  }

  const handleDeleteSheet = async (sheetId: string) => {
    if (!window.confirm('Are you sure you want to dismiss this pending sheet?')) return
    try {
      await api.deletePendingSheet(sheetId)
      setSuccess('Pending sheet dismissed.')
      loadData()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete pending sheet.')
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <Inbox className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Pending Verification Queue</h1>
            {pendingSheets.length > 0 && (
              <span className="badge-warning text-xs font-bold px-2.5 py-0.5">
                {pendingSheets.length} Pending
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Uploaded answer sheets where OCR roll number was unreadable, ambiguous, or unregistered. Verify student identity before grading.
          </p>
        </div>

        <button
          onClick={loadData}
          className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-rose-500 hover:text-rose-800">✕</button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="ml-auto text-emerald-600 hover:text-emerald-900">✕</button>
        </div>
      )}

      {/* Table / List */}
      <div className="card-premium overflow-hidden p-0 border-slate-200 bg-white">
        {loading ? (
          <div className="text-center py-12 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin mx-auto text-indigo-600 mb-2" />
            <p className="text-xs">Checking pending queue…</p>
          </div>
        ) : pendingSheets.length === 0 ? (
          <div className="text-center py-14 text-slate-500">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
            <h3 className="text-sm font-bold text-slate-800">All Answer Sheets Verified</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              There are no ambiguous or unmapped answer sheets waiting in the verification queue.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
                  <th className="py-3 px-4">Uploaded File</th>
                  <th className="py-3 px-4">Extracted Roll</th>
                  <th className="py-3 px-4">OCR Confidence</th>
                  <th className="py-3 px-4">Reason / Status</th>
                  <th className="py-3 px-4">Assign Student from Roster</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingSheets.map(ps => (
                  <tr key={ps.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-800">{ps.original_filename}</span>
                        <a
                          href={`/api/storage/${ps.storage_filename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Preview Document"
                          className="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <span className="text-[10px] text-slate-400">{ps.created_at.slice(0, 16).replace('T', ' ')}</span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold">
                      {ps.extracted_roll_number ? (
                        <span className="badge-warning text-[11px] px-2 py-0.5">
                          {ps.extracted_roll_number}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unreadable</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              ps.ocr_confidence >= 0.8 ? 'bg-emerald-500' :
                              ps.ocr_confidence >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.round(ps.ocr_confidence * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-slate-700">
                          {Math.round(ps.ocr_confidence * 100)}%
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 block max-w-xs leading-snug">
                        {ps.error_reason || 'Pending verification'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={selectedStudentMap[ps.id] || ''}
                        onChange={e => setSelectedStudentMap({
                          ...selectedStudentMap,
                          [ps.id]: e.target.value
                        })}
                        className="form-input text-xs py-1.5 w-52"
                      >
                        <option value="">-- Select Student --</option>
                        {students.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.roll_number} - {s.full_name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleResolveSheet(ps.id)}
                          disabled={resolvingId === ps.id || !selectedStudentMap[ps.id]}
                          className="btn-primary text-xs py-1 px-3 flex items-center gap-1 shadow-xs"
                          title="Confirm Mapping"
                        >
                          {resolvingId === ps.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserCheck className="h-3 w-3" />
                          )}
                          <span>Confirm</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSheet(ps.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                          title="Dismiss"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
