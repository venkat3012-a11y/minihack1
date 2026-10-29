import React, { useState, useEffect } from 'react'
import {
  Users, UserPlus, Search, Edit2, Trash2,
  CheckCircle2, AlertCircle, Loader2, X, RefreshCw
} from 'lucide-react'
import { api, User } from '../../services/api'

export const StudentManagement: React.FC = () => {
  const [students, setStudents] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Add Student Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addRoll, setAddRoll] = useState('')
  const [addClassName, setAddClassName] = useState('Grade 7')
  const [addPassword, setAddPassword] = useState('student123')
  const [submittingAdd, setSubmittingAdd] = useState(false)

  // Edit Student Modal State
  const [editingStudent, setEditingStudent] = useState<User | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRoll, setEditRoll] = useState('')
  const [editClassName, setEditClassName] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // Delete Confirmation Modal State
  const [deletingStudent, setDeletingStudent] = useState<User | null>(null)
  const [submittingDelete, setSubmittingDelete] = useState(false)

  const loadStudents = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.getTeacherStudents(searchTerm, selectedClass)
      setStudents(res.students || [])
    } catch (err) {
      setError((err as Error).message || 'Failed to load students.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [searchTerm, selectedClass])

  const handleOpenAddModal = async () => {
    setError('')
    setSuccess('')
    setAddName('')
    setAddEmail('')
    setAddClassName('Grade 7')
    setAddPassword('student123')
    setShowAddModal(true)
    try {
      const nrRes = await api.getNextRollNumber()
      setAddRoll(nrRes.next_roll_number)
    } catch {
      setAddRoll('25ALR001')
    }
  }

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addName.trim() || !addEmail.trim() || !addRoll.trim()) {
      setError('Name, email, and roll number are required.')
      return
    }

    setSubmittingAdd(true)
    setError('')
    try {
      const res = await api.createStudent({
        full_name: addName.trim(),
        email: addEmail.trim(),
        roll_number: addRoll.trim().toUpperCase(),
        class_name: addClassName.trim() || 'Grade 7',
        password: addPassword || 'student123'
      })
      setSuccess(res.message)
      setShowAddModal(false)
      loadStudents()
    } catch (err) {
      setError((err as Error).message || 'Failed to create student.')
    } finally {
      setSubmittingAdd(false)
    }
  }

  const handleOpenEditModal = (student: User) => {
    setError('')
    setSuccess('')
    setEditingStudent(student)
    setEditName(student.full_name)
    setEditEmail(student.email)
    setEditRoll(student.roll_number || '')
    setEditClassName(student.class_name || 'Grade 7')
  }

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStudent) return

    setSubmittingEdit(true)
    setError('')
    try {
      const res = await api.updateStudent(editingStudent.id, {
        full_name: editName.trim(),
        email: editEmail.trim(),
        roll_number: editRoll.trim().toUpperCase(),
        class_name: editClassName.trim() || 'Grade 7'
      })
      setSuccess(res.message)
      setEditingStudent(null)
      loadStudents()
    } catch (err) {
      setError((err as Error).message || 'Failed to update student.')
    } finally {
      setSubmittingEdit(false)
    }
  }

  const handleDeleteStudent = async () => {
    if (!deletingStudent) return

    setSubmittingDelete(true)
    setError('')
    try {
      const res = await api.deleteStudent(deletingStudent.id)
      setSuccess(res.message)
      setDeletingStudent(null)
      loadStudents()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete student.')
    } finally {
      setSubmittingDelete(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Student Roster Management</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Manage students with unique sequential roll numbers (e.g., 25ALR001), class assignments, and progress tracking.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="btn-primary flex items-center gap-2 text-xs py-2 px-4 shadow-sm self-start sm:self-auto"
        >
          <UserPlus className="h-4 w-4" />
          <span>Add New Student</span>
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

      {/* Filters Bar */}
      <div className="card-premium p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name, roll number, or email…"
            className="form-input pl-9 text-xs py-1.5"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            className="form-input text-xs py-1.5 w-full sm:w-44"
          >
            <option value="">All Classes</option>
            <option value="Grade 7">Grade 7</option>
            <option value="Grade 8">Grade 8</option>
            <option value="Class 10A">Class 10A</option>
          </select>

          <button
            onClick={loadStudents}
            title="Refresh Roster"
            className="btn-secondary p-2 text-slate-600 hover:text-slate-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="card-premium overflow-hidden p-0 border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4 text-center">Evaluations</th>
                <th className="py-3 px-4 text-center">Avg. Score</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600 mb-2" />
                    <span>Loading student roster…</span>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No students found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {searchTerm ? 'Try adjusting your search criteria.' : 'Click "Add New Student" to register students.'}
                    </p>
                  </td>
                </tr>
              ) : (
                students.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                      <span className="badge-indigo text-[11px] px-2 py-0.5">
                        {s.roll_number || 'Unassigned'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {s.full_name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.email}
                    </td>
                    <td className="py-3 px-4">
                      <span className="badge-teal text-[10px]">
                        {s.class_name || 'Grade 7'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-slate-700">
                      {s.evaluations_count || 0}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${
                        (s.avg_score_pct || 0) >= 80 ? 'text-emerald-700' :
                        (s.avg_score_pct || 0) >= 60 ? 'text-amber-700' : 'text-slate-500'
                      }`}>
                        {s.avg_score_pct ? `${s.avg_score_pct}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(s)}
                          title="Edit Student"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 rounded hover:bg-slate-100"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingStudent(s)}
                          title="Delete Student"
                          className="p-1.5 text-slate-500 hover:text-rose-600 rounded hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <UserPlus className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">Add New Student</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="mt-4 space-y-3">
              <div>
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="e.g. Divya Nair"
                  className="form-input text-xs"
                />
              </div>

              <div>
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  placeholder="e.g. divya@evalai.edu"
                  className="form-input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="form-label">Roll Number</label>
                    <span className="text-[10px] text-indigo-600 font-mono">Auto</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={addRoll}
                    onChange={e => setAddRoll(e.target.value)}
                    placeholder="25ALR###"
                    className="form-input text-xs font-mono font-bold text-indigo-700"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Format: 25ALR###</p>
                </div>

                <div>
                  <label className="form-label">Class / Grade</label>
                  <input
                    type="text"
                    value={addClassName}
                    onChange={e => setAddClassName(e.target.value)}
                    placeholder="e.g. Grade 7"
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Initial Password</label>
                <input
                  type="text"
                  value={addPassword}
                  onChange={e => setAddPassword(e.target.value)}
                  placeholder="student123"
                  className="form-input text-xs font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {submittingAdd && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Student</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <Edit2 className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">Edit Student Record</h3>
              </div>
              <button onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStudent} className="mt-4 space-y-3">
              <div>
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="form-input text-xs"
                />
              </div>

              <div>
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="form-input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Roll Number</label>
                  <input
                    type="text"
                    required
                    value={editRoll}
                    onChange={e => setEditRoll(e.target.value)}
                    className="form-input text-xs font-mono font-bold text-indigo-700"
                  />
                </div>

                <div>
                  <label className="form-label">Class</label>
                  <input
                    type="text"
                    value={editClassName}
                    onChange={e => setEditClassName(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {submittingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-rose-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Student?</h3>
                <p className="text-xs text-slate-500 font-mono">{deletingStudent.roll_number}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong>{deletingStudent.full_name}</strong>?
              {deletingStudent.evaluations_count && deletingStudent.evaluations_count > 0 ? (
                <span className="block mt-2 text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  Note: This student has {deletingStudent.evaluations_count} historical test evaluation(s). Their exam marks audit history will be preserved.
                </span>
              ) : null}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingDelete}
                onClick={handleDeleteStudent}
                className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition flex items-center gap-1.5"
              >
                {submittingDelete && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
