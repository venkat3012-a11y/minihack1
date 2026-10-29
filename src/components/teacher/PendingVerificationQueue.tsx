import React, { useState, useEffect, useRef } from 'react'
import {
  Inbox, CheckCircle2, AlertTriangle, Trash2, Eye,
  RefreshCw, Loader2, ArrowRight, UserCheck, UploadCloud,
  FileText, Search, Edit3, History, ShieldAlert, Check
} from 'lucide-react'
import { api, PendingSheet, User, Exam } from '../../services/api'

// Client-side numeric sort helper: extracts number so 2 < 10, 001 < 002 < 003
export function parseRollNumberSortKey(roll?: string | null): [number, number, string] {
  if (!roll || !roll.trim()) return [1, 999999999, '']
  const cleaned = roll.trim().toUpperCase()
  const m = cleaned.match(/ALR\s*[-_.]?\s*(\d+)/i) || cleaned.match(/(\d+)(?!.*\d)/)
  const num = m ? parseInt(m[1] || m[0], 10) : 999999998
  return [0, num, cleaned]
}

export const PendingVerificationQueue: React.FC = () => {
  const [pendingSheets, setPendingSheets] = useState<PendingSheet[]>([])
  const [students, setStudents] = useState<User[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExamId, setSelectedExamId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Reassignment Modal State
  const [reassignSheet, setReassignSheet] = useState<PendingSheet | null>(null)
  const [reassignStudentId, setReassignStudentId] = useState<string>('')
  const [reassignSearchQuery, setReassignSearchQuery] = useState<string>('')
  const [reassignConfirmPrompt, setReassignConfirmPrompt] = useState<boolean>(false)
  const [isReassigning, setIsReassigning] = useState<boolean>(false)

  // Direct student assignment selector map: { [sheetId]: studentId }
  const [selectedStudentMap, setSelectedStudentMap] = useState<Record<string, string>>({})
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [psRes, stRes, exRes] = await Promise.all([
        api.getPendingSheets(),
        api.getTeacherStudents().catch(() => ({ students: [] })),
        api.getExams().catch(() => ({ exams: [] }))
      ])

      // Sort sheets strictly by numeric roll number
      const sorted = (psRes.pending_sheets || []).slice().sort((a, b) => {
        const [catA, numA, strA] = parseRollNumberSortKey(a.extracted_roll_number)
        const [catB, numB, strB] = parseRollNumberSortKey(b.extracted_roll_number)
        if (catA !== catB) return catA - catB
        if (numA !== numB) return numA - numB
        return strA.localeCompare(strB)
      })

      setPendingSheets(sorted)
      setStudents(stRes.students || [])
      setExams(exRes.exams || [])
    } catch (err) {
      setError((err as Error).message || 'Failed to load pending sheets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Handle uploading one or multiple answer sheets
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      const fileList = Array.from(files)
      const res = await api.uploadSheetsBatch(fileList, selectedExamId || undefined)
      setSuccess(`Successfully uploaded ${res.uploaded_count || fileList.length} answer sheet(s). Organized automatically in roll-number order.`)
      await loadData()
    } catch (err) {
      setError((err as Error).message || 'Failed to upload answer sheets.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Open Reassign Modal
  const openReassignModal = (sheet: PendingSheet) => {
    setReassignSheet(sheet)
    setReassignStudentId(sheet.student_id || '')
    setReassignSearchQuery('')
    setReassignConfirmPrompt(false)
  }

  // Submit Reassignment with Confirmation
  const handleExecuteReassignment = async () => {
    if (!reassignSheet || !reassignStudentId) {
      setError('Please select a student from the roster to reassign this sheet.')
      return
    }

    const targetStudent = students.find(s => s.id === reassignStudentId)
    if (!targetStudent) {
      setError('Selected student was not found.')
      return
    }

    setIsReassigning(true)
    setError('')
    try {
      const res = await api.reassignPendingSheet(
        reassignSheet.id,
        targetStudent.id,
        `Reassigned by teacher from '${reassignSheet.extracted_roll_number || 'Unidentified'}' to '${targetStudent.roll_number}'`
      )
      setSuccess(res.message)
      setReassignSheet(null)
      setReassignConfirmPrompt(false)
      await loadData()
    } catch (err) {
      setError((err as Error).message || 'Failed to reassign answer sheet.')
    } finally {
      setIsReassigning(false)
    }
  }

  // Confirm / Resolve mapping
  const handleResolveSheet = async (sheetId: string) => {
    const sheet = pendingSheets.find(s => s.id === sheetId)
    const targetStudentId = selectedStudentMap[sheetId] || sheet?.student_id
    if (!targetStudentId) {
      setError('Please select or verify a student to map this answer sheet to.')
      return
    }

    setResolvingId(sheetId)
    setError('')
    try {
      const res = await api.resolvePendingSheet(sheetId, { student_id: targetStudentId })
      setSuccess(res.message)
      await loadData()
    } catch (err) {
      setError((err as Error).message || 'Failed to resolve pending sheet.')
    } finally {
      setResolvingId(null)
    }
  }

  const handleDeleteSheet = async (sheetId: string) => {
    if (!window.confirm('Are you sure you want to dismiss this pending answer sheet? This action cannot be undone.')) return
    try {
      await api.deletePendingSheet(sheetId)
      setSuccess('Pending sheet dismissed.')
      await loadData()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete pending sheet.')
    }
  }

  // Partition into Identifiable Roll Numbers (sorted 001, 002, ...) and Unidentified
  const identifiedSheets = pendingSheets.filter(ps => parseRollNumberSortKey(ps.extracted_roll_number)[0] === 0)
  const unidentifiedSheets = pendingSheets.filter(ps => parseRollNumberSortKey(ps.extracted_roll_number)[0] === 1)

  const filteredStudents = students.filter(s => {
    const q = reassignSearchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      (s.full_name || '').toLowerCase().includes(q) ||
      (s.roll_number || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    )
  })

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
                {pendingSheets.length} Sheets Queued
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Automatically organized in ascending numeric roll-number order (001, 002, 003, ...). Verify student mappings, resolve duplicates, or manually reassign.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-xs"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            <span>Upload Answer Sheets</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={loadData}
            className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5"
            title="Refresh Queue"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick Upload Drag & Drop Banner */}
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Batch Upload Student Answer Sheets</h3>
              <p className="text-[11px] text-slate-500">
                Upload sheets in any order (e.g. 003, 001, 002). EvalAI extracts roll numbers via OCR and sorts the queue into 001, 002, 003 automatically.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {exams.length > 0 && (
              <select
                value={selectedExamId}
                onChange={e => setSelectedExamId(e.target.value)}
                className="form-input text-xs py-1.5 w-full sm:w-44"
              >
                <option value="">-- General Assessment --</option>
                {exams.map(ex => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-secondary text-xs py-1.5 px-3 shrink-0"
            >
              Select Files
            </button>
          </div>
        </div>
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

      {/* SECTION 1: Identified Roll Number Queue (Sorted 001, 002, 003, ... 010) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Identified Roll Number Queue
            </h2>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
              {identifiedSheets.length} Sheets (Numeric Order)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Sorted by roll number (001, 002, 003...) regardless of upload order
          </span>
        </div>

        <div className="card-premium overflow-hidden p-0 border-slate-200 bg-white shadow-xs">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin mx-auto text-indigo-600 mb-2" />
              <p className="text-xs">Loading pending queue…</p>
            </div>
          ) : identifiedSheets.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-xs font-semibold text-slate-700">No identified sheets currently waiting in queue.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Upload student answer sheets above to populate the queue.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
                    <th className="py-3 px-4">Roll Number</th>
                    <th className="py-3 px-4">Uploaded Document</th>
                    <th className="py-3 px-4">OCR Confidence</th>
                    <th className="py-3 px-4">Student Mapping Status</th>
                    <th className="py-3 px-4">Correction History</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {identifiedSheets.map(ps => {
                    const isDup = Boolean(ps.is_duplicate)
                    return (
                      <tr key={ps.id} className={`transition-colors ${isDup ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/60'}`}>
                        {/* Roll Number Badge */}
                        <td className="py-3.5 px-4 font-mono font-bold">
                          <span className="badge-indigo text-xs px-2.5 py-1 font-bold inline-flex items-center gap-1">
                            {ps.extracted_roll_number}
                          </span>
                          {isDup && (
                            <span className="ml-1.5 rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[10px] font-bold border border-rose-300">
                              Duplicate
                            </span>
                          )}
                        </td>

                        {/* Uploaded File + Preview */}
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-800 truncate max-w-xs">{ps.original_filename}</span>
                            <a
                              href={`/api/storage/${ps.storage_filename}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Preview Uploaded Answer Sheet"
                              className="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </a>
                          </div>
                          <span className="text-[10px] text-slate-400">{ps.created_at.slice(0, 16).replace('T', ' ')}</span>
                        </td>

                        {/* OCR Confidence */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-2 rounded-full bg-slate-200 overflow-hidden">
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

                        {/* Mapping / Reason / Duplicate */}
                        <td className="py-3.5 px-4">
                          {isDup ? (
                            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800 max-w-xs">
                              <div className="flex items-center gap-1 font-bold">
                                <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Possible Duplicate
                              </div>
                              <p className="mt-0.5 text-[10px] leading-tight text-rose-700">
                                {ps.duplicate_reason || 'Multiple sheets uploaded for this roll number.'}
                              </p>
                            </div>
                          ) : ps.student_name ? (
                            <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span>{ps.student_name}</span>
                              <span className="text-slate-400 font-normal font-mono text-[11px]">({ps.extracted_roll_number})</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 block max-w-xs leading-snug">
                              {ps.error_reason || 'Needs review'}
                            </span>
                          )}
                        </td>

                        {/* Correction History */}
                        <td className="py-3.5 px-4">
                          {ps.correction_history && ps.correction_history.length > 0 ? (
                            <div className="flex items-center gap-1 text-[11px] text-indigo-700" title={`Reassigned ${ps.correction_history.length} time(s)`}>
                              <History className="h-3.5 w-3.5 text-indigo-500" />
                              <span>Reassigned ({ps.correction_history.length})</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Original OCR</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openReassignModal(ps)}
                              className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1 text-slate-700 hover:text-indigo-700"
                              title="Manually Change / Reassign Student"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Reassign</span>
                            </button>
                            <button
                              onClick={() => handleResolveSheet(ps.id)}
                              disabled={resolvingId === ps.id || (!ps.student_id && !selectedStudentMap[ps.id])}
                              className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1 shadow-xs"
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: Roll Number Unidentified Section */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Roll Number Unidentified
            </h2>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
              {unidentifiedSheets.length} Sheets Pending Manual Assignment
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Never assigned based on queue position. Manual assignment required.
          </span>
        </div>

        <div className="card-premium overflow-hidden p-0 border-slate-200 bg-white shadow-xs">
          {unidentifiedSheets.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Check className="h-6 w-6 mx-auto text-emerald-500 mb-1" />
              <p className="text-xs">No unreadable or invalid roll numbers detected.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
                    <th className="py-3 px-4">Uploaded File</th>
                    <th className="py-3 px-4">Status / Reason</th>
                    <th className="py-3 px-4">OCR Confidence</th>
                    <th className="py-3 px-4">Manual Student Assignment</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unidentifiedSheets.map(ps => (
                    <tr key={ps.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-800 truncate max-w-xs">{ps.original_filename}</span>
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

                      <td className="py-3.5 px-4">
                        <span className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-block font-semibold">
                          {ps.error_reason || 'Roll number missing or unreadable'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-rose-500"
                              style={{ width: `${Math.round(ps.ocr_confidence * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-slate-600">{Math.round(ps.ocr_confidence * 100)}%</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={selectedStudentMap[ps.id] || ''}
                          onChange={e => setSelectedStudentMap({
                            ...selectedStudentMap,
                            [ps.id]: e.target.value
                          })}
                          className="form-input text-xs py-1.5 w-56"
                        >
                          <option value="">-- Select Student from Roster --</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>
                              [{s.roll_number}] {s.full_name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openReassignModal(ps)}
                            className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Assign</span>
                          </button>
                          <button
                            onClick={() => handleResolveSheet(ps.id)}
                            disabled={resolvingId === ps.id || !selectedStudentMap[ps.id]}
                            className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1 shadow-xs"
                          >
                            <Check className="h-3 w-3" />
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

      {/* Manual Reassign / Edit Confirmation Modal */}
      {reassignSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Reassign Answer Sheet</h3>
              </div>
              <button
                onClick={() => setReassignSheet(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200/80 space-y-1">
                <div><strong>Document:</strong> <span className="font-mono text-slate-700">{reassignSheet.original_filename}</span></div>
                <div><strong>Current Roll:</strong> <span className="font-mono font-bold text-indigo-700">{reassignSheet.extracted_roll_number || 'Unidentified'}</span></div>
                {reassignSheet.student_name && (
                  <div><strong>Mapped Student:</strong> <span className="text-slate-700">{reassignSheet.student_name}</span></div>
                )}
              </div>

              {!reassignConfirmPrompt ? (
                <div className="space-y-3 pt-2">
                  <label className="form-label">Search & Select Target Student from Roster</label>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={reassignSearchQuery}
                      onChange={e => setReassignSearchQuery(e.target.value)}
                      placeholder="Search by name, roll number, or email…"
                      className="form-input pl-8 text-xs py-1.5"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <p className="p-3 text-slate-400 text-center italic">No matching students found</p>
                    ) : (
                      filteredStudents.map(s => {
                        const isSelected = reassignStudentId === s.id
                        return (
                          <div
                            key={s.id}
                            onClick={() => setReassignStudentId(s.id)}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-800">{s.full_name}</div>
                              <div className="text-[11px] text-slate-500">{s.email}</div>
                            </div>
                            <span className="font-mono text-xs font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                              {s.roll_number}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setReassignSheet(null)}
                      className="btn-secondary text-xs py-2 px-3.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!reassignStudentId) {
                          alert('Please select a student from the list.')
                          return
                        }
                        setReassignConfirmPrompt(true)
                      }}
                      disabled={!reassignStudentId}
                      className="btn-primary text-xs py-2 px-4 shadow-xs"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span>Confirm Reassignment</span>
                    </div>
                    <p className="text-xs leading-relaxed">
                      Are you sure you want to assign this answer sheet to{' '}
                      <strong>{students.find(s => s.id === reassignStudentId)?.full_name}</strong> (Roll No:{' '}
                      <strong>{students.find(s => s.id === reassignStudentId)?.roll_number}</strong>)?
                    </p>
                    <p className="text-[11px] text-amber-800">
                      The sheet's position in the queue will automatically refresh to match its new numeric roll-number order.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setReassignConfirmPrompt(false)}
                      disabled={isReassigning}
                      className="btn-secondary text-xs py-2 px-3.5"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleExecuteReassignment}
                      disabled={isReassigning}
                      className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow-xs bg-indigo-600 hover:bg-indigo-700"
                    >
                      {isReassigning && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>Yes, Save Reassignment</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
