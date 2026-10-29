import React, { useState, useEffect, useRef } from 'react'
import {
  FileText, CheckCircle2, AlertCircle, Award,
  Send, RotateCcw, X, Loader2, FileUp, AlertTriangle
} from 'lucide-react'
import { api, EvaluationQuestion, EvaluationRecord, User, Exam } from '../../services/api'

type FileState = {
  file: File | null
  previewUrl: string | null
  error: string
}

function FileDropZone({
  label,
  hint,
  value,
  onChange,
  id
}: {
  label: string
  hint: string
  value: FileState
  onChange: (fs: FileState) => void
  id: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  const validate = (file: File): string => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
      return 'Unsupported format. Allowed: PDF, JPG, JPEG, PNG.'
    }
    if (file.size > 30 * 1024 * 1024) {
      return 'File size exceeds 30MB limit.'
    }
    if (file.size === 0) {
      return 'File is empty (0 bytes).'
    }
    return ''
  }

  const handleFile = (file: File) => {
    const err = validate(file)
    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    onChange({ file, previewUrl, error: err })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const clear = () => {
    if (value.previewUrl) URL.revokeObjectURL(value.previewUrl)
    onChange({ file: null, previewUrl: null, error: '' })
    if (ref.current) ref.current.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="form-label">{label}</label>
      <div
        className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          value.error
            ? 'border-rose-400 bg-rose-50/40'
            : value.file
            ? 'border-emerald-400 bg-emerald-50/30'
            : 'border-indigo-200 bg-indigo-50/20 hover:border-indigo-400 hover:bg-indigo-50/40'
        }`}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => ref.current?.click()}
      >
        <input
          ref={ref}
          type="file"
          id={id}
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleChange}
        />

        {value.file ? (
          <div className="p-4 flex items-start gap-3">
            {value.previewUrl ? (
              <img
                src={value.previewUrl}
                alt="preview"
                className="h-20 w-20 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-indigo-100 border border-indigo-200 shrink-0">
                <FileText className="h-8 w-8 text-indigo-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{value.file.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(value.file.size / 1024 / 1024).toFixed(2)} MB · {value.file.name.split('.').pop()?.toUpperCase()}
              </p>
              {value.error ? (
                <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {value.error}
                </p>
              ) : (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Ready for evaluation
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                clear()
              }}
              title="Remove file"
              className="p-1 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-rose-600 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="p-8 text-center">
            <FileUp className="h-8 w-8 text-indigo-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">{hint}</p>
            <p className="text-xs text-slate-400 mt-1">PDF, JPG, JPEG, PNG · Up to 30MB</p>
            <p className="text-xs text-indigo-600 font-medium mt-2">Click to browse or drop here</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const EvaluationUploader: React.FC = () => {
  const [students, setStudents] = useState<User[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [testTitle, setTestTitle] = useState('Mathematics Assessment')

  // Three required file inputs
  const [qp, setQp] = useState<FileState>({ file: null, previewUrl: null, error: '' })
  const [ak, setAk] = useState<FileState>({ file: null, previewUrl: null, error: '' })
  const [ss, setSs] = useState<FileState>({ file: null, previewUrl: null, error: '' })

  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [apiError, setApiError] = useState('')
  const [result, setResult] = useState<(EvaluationRecord & { questions: EvaluationQuestion[] }) | null>(null)

  // Teacher review states
  const [editedQuestions, setEditedQuestions] = useState<EvaluationQuestion[]>([])
  const [teacherComments, setTeacherComments] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)

  useEffect(() => {
    Promise.all([
      api.getTeacherStudents().catch(() => ({ students: [] })),
      api.getExams().catch(() => ({ exams: [] }))
    ]).then(([studRes, examRes]) => {
      // Naturally sort students by sequential roll number (e.g. 25ALR001, 25ALR002, 25ALR003)
      const studs = (studRes.students || []).slice().sort((a, b) => {
        const rollA = a.roll_number || ''
        const rollB = b.roll_number || ''
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' })
      })
      setStudents(studs)
      setExams(examRes.exams || [])
      if (studs.length > 0) {
        setSelectedStudentId(studs[0].id)
      }
    })
  }, [])

  const handleExamChange = (examId: string) => {
    setSelectedExamId(examId)
    if (examId) {
      const ex = exams.find(e => e.id === examId)
      if (ex) setTestTitle(ex.title)
    }
  }

  const canEvaluate =
    Boolean(qp.file && !qp.error) &&
    Boolean(ak.file && !ak.error) &&
    Boolean(ss.file && !ss.error) &&
    Boolean(selectedStudentId) &&
    Boolean(testTitle.trim())

  const handleEvaluate = async () => {
    if (!canEvaluate) return
    setUploading(true)
    setUploadPct(0)
    setApiError('')
    setResult(null)
    setPublishSuccess(false)

    try {
      const evalResult = await api.evaluateThreeFiles(
        qp.file!,
        ak.file!,
        ss.file!,
        selectedStudentId,
        testTitle.trim(),
        pct => setUploadPct(pct)
      )
      if (!evalResult || (evalResult as any).pending) {
        throw new Error((evalResult as any)?.message || 'Student roll number could not be matched automatically. Please select a registered student from the dropdown.')
      }
      if (!evalResult.questions || evalResult.questions.length === 0) {
        throw new Error('Evaluation completed but no questions were parsed. Please check that the uploaded documents contain legible Mathematics questions and solutions.')
      }
      setResult(evalResult)
      setEditedQuestions(JSON.parse(JSON.stringify(evalResult.questions || [])))
      setTeacherComments('')

      // Automatically advance TARGET STUDENT to the next sequential roll number (e.g. 001 -> 002 -> 003)
      const currentIdx = students.findIndex(s => s.id === selectedStudentId)
      if (currentIdx >= 0 && currentIdx < students.length - 1) {
        setSelectedStudentId(students[currentIdx + 1].id)
      } else if (students.length > 0) {
        setSelectedStudentId(students[0].id)
      }
    } catch (err) {
      setApiError((err as Error).message || 'Evaluation failed. Please verify files and try again.')
    } finally {
      setUploading(false)
      setUploadPct(0)
    }
  }

  const handlePublish = async () => {
    if (!result) return
    setPublishing(true)
    setApiError('')
    try {
      await api.publishEvaluation(result.id, editedQuestions, teacherComments)
      setPublishSuccess(true)
    } catch (err) {
      setApiError((err as Error).message || 'Publishing marks failed.')
    } finally {
      setPublishing(false)
    }
  }

  const handleReset = () => {
    setQp({ file: null, previewUrl: null, error: '' })
    setAk({ file: null, previewUrl: null, error: '' })
    setSs({ file: null, previewUrl: null, error: '' })
    setResult(null)
    setEditedQuestions([])
    setTeacherComments('')
    setApiError('')
    setPublishSuccess(false)
    setTestTitle('Mathematics Assessment')
  }

  const totalFinal = editedQuestions.reduce((s, q) => s + Number(q.final_marks || 0), 0)
  const totalMax = editedQuestions.reduce((s, q) => s + Number(q.max_marks || 0), 0) || (result?.max_score || 0)

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mathematics Evaluation</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pure Mathematics evaluation powered by Gemini AI multimodal analysis and SymPy symbolic verification.
          </p>
        </div>
        {result && (
          <button onClick={handleReset} className="btn-secondary text-xs">
            <RotateCcw className="h-4 w-4" />
            New Evaluation
          </button>
        )}
      </div>

      {/* STEP 1: Upload Exactly 3 Files */}
      {!result && (
        <div className="card-premium space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold">1</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Upload Three Required Documents</h2>
              <p className="text-xs text-slate-500">
                All 3 files are strictly required: (1) Question Paper, (2) Answer Key, and (3) Student Test Paper.
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <FileDropZone
              id="qp"
              label="1. Question Paper *"
              hint="Upload Question Paper"
              value={qp}
              onChange={setQp}
            />
            <FileDropZone
              id="ak"
              label="2. Teacher Answer Key *"
              hint="Upload Answer Key & Rubrics"
              value={ak}
              onChange={setAk}
            />
            <FileDropZone
              id="ss"
              label="3. Student Written Paper *"
              hint="Upload Student Answer Sheet"
              value={ss}
              onChange={setSs}
            />
          </div>

          {/* Assessment & Student Metadata */}
          <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-slate-100">
            <div>
              <label className="form-label">Link to Registered Exam (Optional)</label>
              <select
                value={selectedExamId}
                onChange={e => handleExamChange(e.target.value)}
                className="form-input"
              >
                <option value="">-- Standalone Evaluation --</option>
                {exams.map(ex => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} ({ex.class_name || 'Class 10'}) - {ex.total_marks} Marks
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Assessment Title *</label>
              <input
                type="text"
                value={testTitle}
                onChange={e => setTestTitle(e.target.value)}
                placeholder="e.g. Linear Equations & Polynomials Exam"
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Target Student *</label>
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="form-input"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.roll_number || 'No Roll'}] {s.full_name} ({s.email})
                  </option>
                ))}
                <option value="auto">✨ Auto-Detect Roll Number via OCR</option>
              </select>
            </div>
          </div>

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="space-y-3 rounded-xl bg-indigo-50/80 border border-indigo-200 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600 shrink-0" />
                  {uploadPct < 90
                    ? `Uploading 3 documents to server… (${uploadPct}%)`
                    : 'Documents uploaded. Gemini AI is analyzing questions, handwriting & marking rubrics…'}
                </span>
                <span className="font-bold text-indigo-700 font-mono">
                  {uploadPct < 90 ? `${uploadPct}%` : 'Processing…'}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-indigo-200 overflow-hidden">
                <div
                  className={`h-full bg-indigo-600 rounded-full transition-all duration-300 ${
                    uploadPct >= 90 ? 'animate-pulse' : ''
                  }`}
                  style={{ width: `${Math.max(uploadPct, 92)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-600 flex items-center justify-between">
                <span>
                  {uploadPct < 90
                    ? 'Transferring Question Paper, Answer Key, and Student Written Test.'
                    : 'Multimodal AI extraction + SymPy step verification in progress (typically 10–25s).'}
                </span>
                <span className="text-indigo-600 font-medium">Please wait…</span>
              </p>
            </div>
          )}

          {/* API Error Notification */}
          {apiError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3.5 text-xs text-rose-700 border border-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Evaluate Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500 space-y-0.5 w-full sm:w-auto">
              {!qp.file && <p className="text-rose-500">• Question Paper file missing</p>}
              {!ak.file && <p className="text-rose-500">• Teacher Answer Key file missing</p>}
              {!ss.file && <p className="text-rose-500">• Student Written Test Paper file missing</p>}
              {canEvaluate && (
                <p className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All 3 required files validated
                </p>
              )}
            </div>
            <button
              onClick={handleEvaluate}
              disabled={!canEvaluate || uploading}
              className="btn-primary w-full sm:w-auto px-6 py-2.5 text-sm"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing Documents…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Run AI Mathematics Evaluation
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Review Proposed Marks & Teacher Overrides */}
      {result && !publishSuccess && (
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="card-premium bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-0 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="badge-teal mb-1">Evaluation Generated</span>
              <h2 className="text-xl font-bold mt-1">{result.test_title}</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Student: <strong className="text-white">{result.student_name}</strong> ({result.student_email})
              </p>
              <p className="text-xs text-teal-300 mt-0.5 font-mono">
                Engine: {result.engine}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 uppercase font-semibold">Total Proposed / Final Marks</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-extrabold text-teal-400">{totalFinal.toFixed(1)}</span>
                <span className="text-slate-400 font-medium">/ {totalMax.toFixed(1)} marks</span>
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                {totalMax > 0 ? Math.round((totalFinal / totalMax) * 100) : 0}% aggregate
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold">2</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Review, Correct & Approve Question-by-Question Marks</h2>
              <p className="text-xs text-slate-500">
                You can adjust marks, review identified mistakes, and add personalized teacher notes.
              </p>
            </div>
          </div>

          {/* Question Breakdown List */}
          <div className="space-y-4">
            {editedQuestions.map((q, idx) => (
              <div key={idx} className="card-premium space-y-4 border-slate-200">
                {/* Question Header */}
                <div className="flex items-start justify-between pb-3 border-b border-slate-100 gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge-indigo">Question {q.question_num}</span>
                      {q.flagged_ambiguity && (
                        <span className="badge-warning flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Ambiguity Flagged
                        </span>
                      )}
                      {q.alternative_method && (
                        <span className="badge-teal">✓ Valid Alternative Method</span>
                      )}
                      {q.is_partial && (
                        <span className="badge-neutral">Partial Credit Awarded</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-2">{q.text}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Max Marks</div>
                    <div className="text-base font-bold text-slate-800">{q.max_marks}</div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Left Column: Student Working & Model Solution */}
                  <div className="space-y-3">
                    <div>
                      <label className="form-label">Student Written Working</label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed min-h-12">
                        {q.student_working || 'No student working detected for this question.'}
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Model Solution (Answer Key)</label>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs font-mono text-emerald-950 whitespace-pre-wrap leading-relaxed">
                        {q.model_solution || '—'}
                      </div>
                    </div>

                    {q.flagged_ambiguity && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 flex items-start gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Ambiguity Flag:</strong> {q.flagged_ambiguity}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Marks, Mistakes, Feedback & Teacher Controls */}
                  <div className="space-y-3">
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900">
                          AI Proposed: <span className="text-indigo-600 font-extrabold">{q.proposed_marks}</span> / {q.max_marks} M
                        </span>
                        <span className={`text-xs font-semibold ${q.is_correct ? 'text-emerald-700' : q.is_partial ? 'text-amber-700' : 'text-rose-700'}`}>
                          {q.is_correct ? '✓ Correct' : q.is_partial ? '~ Partial Credit' : '✗ Incorrect'}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-1">
                          <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                            Max Marks
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={0.5}
                            value={editedQuestions[idx].max_marks}
                            onChange={e => {
                              const newMax = Math.max(0.5, Number(e.target.value))
                              setEditedQuestions(prev => {
                                const updated = [...prev]
                                const curFinal = updated[idx].final_marks
                                updated[idx] = {
                                  ...updated[idx],
                                  max_marks: newMax,
                                  final_marks: Math.min(curFinal, newMax)
                                }
                                return updated
                              })
                            }}
                            className="form-input text-xs py-1"
                          />
                        </div>

                        <div className="col-span-1">
                          <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                            Approved Marks
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={editedQuestions[idx].max_marks}
                            step={0.5}
                            value={editedQuestions[idx].final_marks}
                            onChange={e => {
                              const val = Math.min(editedQuestions[idx].max_marks, Math.max(0, Number(e.target.value)))
                              setEditedQuestions(prev => {
                                const updated = [...prev]
                                updated[idx] = { ...updated[idx], final_marks: val }
                                return updated
                              })
                            }}
                            className="form-input text-xs py-1"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                            Teacher Note (to student)
                          </label>
                          <input
                            type="text"
                            value={editedQuestions[idx].teacher_note || ''}
                            onChange={e => {
                              const note = e.target.value
                              setEditedQuestions(prev => {
                                const updated = [...prev]
                                updated[idx] = { ...updated[idx], teacher_note: note }
                                return updated
                              })
                            }}
                            placeholder="Optional note for student…"
                            className="form-input text-xs py-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mistakes List */}
                    {q.mistakes && q.mistakes.length > 0 && (
                      <div className="rounded-lg bg-rose-50/60 border border-rose-200 p-2.5 text-xs">
                        <p className="font-semibold text-rose-800 mb-1">Specific Mistakes Detected:</p>
                        <ul className="space-y-0.5">
                          {q.mistakes.map((m, mi) => (
                            <li key={mi} className="text-rose-700 flex items-start gap-1">
                              <span className="shrink-0">•</span>
                              <span>{m}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* AI Pedagogical Feedback */}
                    {q.feedback && (
                      <div className="rounded-lg bg-teal-50/70 border border-teal-200 p-2.5 text-xs text-teal-950">
                        <b>AI Diagnostic:</b> {q.feedback}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* STEP 3: Teacher Comments & Final Publish */}
          <div className="card-premium space-y-4 border-indigo-200 bg-indigo-50/20">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold">3</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Approve & Publish Results to Student</h2>
                <p className="text-xs text-slate-500">
                  Once published, {result.student_name} will immediately be able to view their verified marks and feedback.
                </p>
              </div>
            </div>

            <div>
              <label className="form-label">Overall Teacher Comments (optional)</label>
              <textarea
                rows={2}
                value={teacherComments}
                onChange={e => setTeacherComments(e.target.value)}
                placeholder="e.g. Great overall performance on linear equations. Remember to double-check factoring coefficients."
                className="form-input text-xs"
              />
            </div>

            {apiError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-indigo-100">
              <div className="text-xs font-semibold text-slate-700">
                Final Total: <span className="text-indigo-700 text-base font-bold">{totalFinal.toFixed(1)}</span>
                <span className="text-slate-400"> / {result.max_score} marks</span>
                <span className="text-slate-500 ml-2">
                  ({result.max_score > 0 ? Math.round((totalFinal / result.max_score) * 100) : 0}%)
                </span>
              </div>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing Marks…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Approve & Publish Marks to Student
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS CONFIRMATION STATE */}
      {publishSuccess && result && (
        <div className="card-premium text-center space-y-4 py-12">
          <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Marks Successfully Published!</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Evaluation for <strong>{result.student_name}</strong> ({result.test_title}) has been approved and published.
            The student can now securely view their marks, mistakes, and feedback.
          </p>
          <div className="text-2xl font-extrabold text-indigo-700">
            {totalFinal.toFixed(1)} / {result.max_score} marks
          </div>
          <button onClick={handleReset} className="btn-primary mt-2">
            <RotateCcw className="h-4 w-4" />
            Evaluate Another Student Test
          </button>
        </div>
      )}
    </div>
  )
}
