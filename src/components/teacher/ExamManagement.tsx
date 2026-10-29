import React, { useState, useEffect } from 'react'
import {
  FileCheck, Plus, Trash2, Eye, Calendar, Clock,
  CheckCircle2, AlertCircle, Loader2, X, BookOpen, Layers
} from 'lucide-react'
import { api, Exam, ExamQuestion } from '../../services/api'

export const ExamManagement: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create Exam Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('Mathematics')
  const [className, setClassName] = useState('Grade 7')
  const [totalMarks, setTotalMarks] = useState<number>(15)
  const [duration, setDuration] = useState<number>(45)
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10))
  const [questions, setQuestions] = useState<ExamQuestion[]>([
    { question_num: 1, text: '', max_marks: 5, model_solution: '', rubric_criteria: '' },
    { question_num: 2, text: '', max_marks: 5, model_solution: '', rubric_criteria: '' },
    { question_num: 3, text: '', max_marks: 5, model_solution: '', rubric_criteria: '' }
  ])
  const [submitting, setSubmitting] = useState(false)

  // Details Modal
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const loadExams = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.getExams()
      setExams(res.exams || [])
    } catch (err) {
      setError((err as Error).message || 'Failed to load exams.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExams()
  }, [])

  const currentQuestionsSum = questions.reduce((s, q) => s + (Number(q.max_marks) || 0), 0)
  const isMarksSumValid = Math.abs(currentQuestionsSum - totalMarks) < 0.01

  const handleAddQuestion = () => {
    const nextNum = questions.length + 1
    setQuestions([...questions, {
      question_num: nextNum,
      text: '',
      max_marks: 5,
      model_solution: '',
      rubric_criteria: ''
    }])
  }

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return
    const updated = questions.filter((_, i) => i !== idx).map((q, i) => ({
      ...q,
      question_num: i + 1
    }))
    setQuestions(updated)
  }

  const handleQuestionChange = (idx: number, field: keyof ExamQuestion, val: any) => {
    const updated = [...questions]
    updated[idx] = { ...updated[idx], [field]: val }
    setQuestions(updated)
  }

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Exam title is required.')
      return
    }
    if (!isMarksSumValid) {
      setError(`Question marks total (${currentQuestionsSum}) must equal total exam marks (${totalMarks}).`)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await api.createExam({
        title: title.trim(),
        subject,
        class_name: className.trim() || 'Grade 7',
        total_marks: totalMarks,
        duration_minutes: duration,
        exam_date: examDate,
        questions
      })
      setSuccess(res.message)
      setShowCreateModal(false)
      loadExams()
    } catch (err) {
      setError((err as Error).message || 'Failed to create exam.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleViewDetail = async (examId: string) => {
    setLoadingDetail(true)
    try {
      const res = await api.getExamDetail(examId)
      setSelectedExam(res.exam)
    } catch (err) {
      setError((err as Error).message || 'Failed to load exam details.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleDeleteExam = async (examId: string) => {
    if (!window.confirm('Are you sure you want to delete this exam?')) return
    try {
      await api.deleteExam(examId)
      setSuccess('Exam deleted successfully.')
      loadExams()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete exam.')
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Exam & Rubric Management</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Define structured exams, question-by-question rubrics, step marking criteria, and model solutions.
          </p>
        </div>

        <button
          onClick={() => {
            setError('')
            setSuccess('')
            setTitle('')
            setTotalMarks(15)
            setQuestions([
              { question_num: 1, text: '', max_marks: 5, model_solution: '', rubric_criteria: '' },
              { question_num: 2, text: '', max_marks: 5, model_solution: '', rubric_criteria: '' },
              { question_num: 3, text: '', max_marks: 5, model_solution: '', rubric_criteria: '' }
            ])
            setShowCreateModal(true)
          }}
          className="btn-primary flex items-center gap-2 text-xs py-2 px-4 shadow-sm self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Create New Exam</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
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

      {/* Exams Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin mx-auto text-indigo-600 mb-2" />
          <p className="text-xs">Loading exams catalog…</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="card-premium text-center py-12 bg-white">
          <FileCheck className="h-10 w-10 mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No Exams Created Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Click "Create New Exam" to define questions, model answers, and marking rubrics.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exams.map(ex => (
            <div key={ex.id} className="card-premium p-5 flex flex-col justify-between bg-white hover:border-indigo-300 transition-all">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="badge-indigo text-[10px]">{ex.subject || 'Mathematics'}</span>
                  <span className="badge-teal text-[10px]">{ex.class_name || 'Grade 7'}</span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug">{ex.title}</h3>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{ex.exam_date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>{ex.duration_minutes} mins</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Marks</span>
                    <span className="font-extrabold text-indigo-700 text-sm">{ex.total_marks} Marks</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Questions</span>
                    <span className="font-bold text-slate-700">{ex.question_count || 0} Questions</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleViewDetail(ex.id)}
                  className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Inspect Rubric</span>
                </button>
                <button
                  onClick={() => handleDeleteExam(ex.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition"
                  title="Delete Exam"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <Plus className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">Create New Exam & Rubric</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExam} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="form-label">Exam Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Linear Equations Diagnostic Mid-Term"
                    className="form-input text-xs"
                  />
                </div>

                <div>
                  <label className="form-label">Subject</label>
                  <select
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="form-input text-xs"
                  >
                    <option value="Mathematics">Mathematics</option>
                    <option value="Physics">Physics</option>
                    <option value="Science">General Science</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Class / Grade</label>
                  <input
                    type="text"
                    value={className}
                    onChange={e => setClassName(e.target.value)}
                    placeholder="Grade 7"
                    className="form-input text-xs"
                  />
                </div>

                <div>
                  <label className="form-label">Total Exam Marks</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    step={1}
                    value={totalMarks}
                    onChange={e => setTotalMarks(Number(e.target.value))}
                    className="form-input text-xs font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="form-label">Duration (Minutes)</label>
                  <input
                    type="number"
                    min={10}
                    max={180}
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    className="form-input text-xs"
                  />
                </div>
              </div>

              {/* Questions Section */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Exam Questions & Step Rubrics ({questions.length})
                    </h4>
                    <p className={`text-[11px] font-semibold mt-0.5 ${isMarksSumValid ? 'text-emerald-700' : 'text-rose-600'}`}>
                      Question Marks Sum: {currentQuestionsSum} / {totalMarks} Marks
                      {!isMarksSumValid && ` (Difference: ${(currentQuestionsSum - totalMarks).toFixed(1)})`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Question</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {questions.map((q, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="badge-indigo text-[10px]">Question {q.question_num}</span>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-semibold text-slate-500 uppercase">Max Marks:</label>
                          <input
                            type="number"
                            min={0.5}
                            max={50}
                            step={0.5}
                            value={q.max_marks}
                            onChange={e => handleQuestionChange(idx, 'max_marks', Number(e.target.value))}
                            className="form-input text-xs w-16 py-0.5 font-bold font-mono"
                          />
                          {questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveQuestion(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        type="text"
                        required
                        placeholder="Enter full question text…"
                        value={q.text}
                        onChange={e => handleQuestionChange(idx, 'text', e.target.value)}
                        className="form-input text-xs bg-white"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <input
                          type="text"
                          placeholder="Model solution from Answer Key…"
                          value={q.model_solution || ''}
                          onChange={e => handleQuestionChange(idx, 'model_solution', e.target.value)}
                          className="form-input text-[11px] bg-white font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Step marking rubric (e.g. Step 1: 2M, Step 2: 3M)…"
                          value={q.rubric_criteria || ''}
                          onChange={e => handleQuestionChange(idx, 'rubric_criteria', e.target.value)}
                          className="form-input text-[11px] bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !isMarksSumValid}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save & Publish Exam</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Exam Details Modal */}
      {selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="badge-indigo text-[10px] mb-1">{selectedExam.subject} · {selectedExam.class_name}</span>
                <h3 className="text-base font-bold text-slate-900">{selectedExam.title}</h3>
                <p className="text-xs text-slate-500 font-mono">Total: {selectedExam.total_marks} Marks · {selectedExam.duration_minutes} Mins</p>
              </div>
              <button onClick={() => setSelectedExam(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {(selectedExam.questions || []).map((q, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="badge-indigo text-[10px]">Question {q.question_num}</span>
                    <span className="font-bold text-indigo-700">{q.max_marks} Marks</span>
                  </div>
                  <p className="font-semibold text-slate-900">{q.text}</p>
                  {q.model_solution && (
                    <div className="bg-emerald-50/70 border border-emerald-200 p-2 rounded text-emerald-950 font-mono text-[11px]">
                      <strong>Model Solution:</strong> {q.model_solution}
                    </div>
                  )}
                  {q.rubric_criteria && (
                    <p className="text-slate-600 text-[11px]">
                      <strong>Rubric:</strong> {q.rubric_criteria}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

