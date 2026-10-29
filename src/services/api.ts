const TOKEN_KEY = 'evalai_jwt_token'

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const headers = new Headers(options.headers || {})
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(endpoint, { ...options, headers })
  if (!res.ok) {
    let errorMsg = `Error ${res.status}: ${res.statusText}`
    try {
      const errData = await res.json()
      if (errData.detail) errorMsg = errData.detail
    } catch { /* ignore */ }
    throw new Error(errorMsg)
  }
  const contentType = res.headers.get('Content-Type') || ''
  if (contentType.includes('application/pdf') || contentType.includes('text/csv')) {
    return res.blob() as unknown as T
  }
  return res.json()
}

export interface User {
  id: string
  email: string
  full_name: string
  role: 'teacher' | 'student'
  roll_number?: string
  class_name?: string
  evaluations_count?: number
  avg_score_pct?: number
  created_at?: string
}

export interface ExamQuestion {
  id?: string
  question_num: number
  text: string
  max_marks: number
  model_solution?: string
  rubric_criteria?: string
}

export interface Exam {
  id: string
  title: string
  subject: string
  class_name: string
  total_marks: number
  duration_minutes: number
  exam_date: string
  question_count?: number
  submission_count?: number
  questions?: ExamQuestion[]
  created_at?: string
}

export interface PendingSheet {
  id: string
  exam_id?: string
  exam_title?: string
  original_filename: string
  storage_filename: string
  extracted_roll_number?: string
  ocr_confidence: number
  status: 'pending' | 'resolved' | 'rejected'
  error_reason?: string
  created_at: string
}

export interface AiImprovementStats {
  current_version: {
    id?: string
    version_tag: string
    base_model: string
    total_examples: number
    train_count: number
    val_count: number
    test_count: number
    benchmark_mae: number
    benchmark_accuracy: number
    notes?: string
    created_at?: string
  }
  version_history: any[]
  total_examples: number
  train_count: number
  val_count: number
  test_count: number
  published_tests_available: number
  data_quality_score: number
  methodology: string
}

export interface ClassAnalyticsSummary {
  total_evaluations: number
  class_average_pct: number
  pass_rate_pct: number
  highest_score_pct: number
  lowest_score_pct: number
  grade_distribution: Record<string, number>
  question_difficulty: {
    question_num: number
    text: string
    average_percentage: number
    difficulty: 'Easy' | 'Moderate' | 'Challenging'
  }[]
  common_mistakes: { mistake: string; occurrences: number }[]
  weak_topics: string[]
  strong_topics: string[]
}

export interface StudentDashboardData {
  profile: User
  analytics: {
    exams_completed: number
    total_marks_earned: number
    total_possible_marks: number
    overall_percentage: number
    grade_band: string
  }
  strengths: string[]
  weak_topics: string[]
  recommendations: string[]
  performance_history: {
    exam_num: number
    title: string
    score: number
    max_score: number
    percentage: number
    date: string
  }[]
}

export interface EvaluationQuestion {
  question_num: number
  text: string
  max_marks: number
  model_solution: string
  student_working: string
  proposed_marks: number
  final_marks: number
  is_correct: boolean
  is_partial: boolean
  mistakes: string[]
  feedback: string
  flagged_ambiguity: string | null
  alternative_method: boolean
  teacher_note?: string
}

export interface EvaluationRecord {
  id: string
  test_title: string
  student_id: string
  student_name: string
  student_email: string
  question_paper_filename: string
  answer_key_filename: string
  student_sheet_filename: string
  total_proposed_score: number
  total_final_score: number
  max_score: number
  status: 'evaluated' | 'published'
  engine: string
  teacher_comments: string
  created_at: string
  published_at: string | null
  questions?: EvaluationQuestion[]
  questions_count?: number
}

export interface StudentResult {
  id: string
  test_title: string
  student_name: string
  student_email: string
  total_final_score: number
  max_score: number
  status: string
  engine: string
  teacher_comments: string
  created_at: string
  published_at: string
  questions_count: number
}

export interface StudentResultDetail {
  id: string
  test_title: string
  student_id: string
  student_name: string
  total_final_score: number
  max_score: number
  status: string
  engine?: string
  teacher_comments: string
  created_at?: string
  published_at?: string
  questions: EvaluationQuestion[]
}

export interface StudentAnalytics {
  tests_completed: number
  total_marks_earned: number
  total_max_marks: number
  overall_percentage: number
  questions_evaluated: number
  questions_fully_correct: number
  questions_partial_credit: number
  questions_needs_practice: number
}

export const api = {
  async login(email: string, pass: string): Promise<{ access_token: string; user: User }> {
    const res = await request<{ access_token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    })
    setStoredToken(res.access_token)
    return res
  },

  async register(data: { email: string; password: string; full_name: string; role: string; teacher_code?: string }): Promise<{ access_token: string; user: User }> {
    const res = await request<{ access_token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    setStoredToken(res.access_token)
    return res
  },

  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/me')
  },

  async getTeacherStudents(search?: string, className?: string): Promise<{ students: User[] }> {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (className) params.append('class_name', className)
    const q = params.toString() ? `?${params.toString()}` : ''
    return request<{ students: User[] }>(`/api/teacher/students${q}`)
  },

  async getNextRollNumber(): Promise<{ next_roll_number: string }> {
    return request<{ next_roll_number: string }>('/api/teacher/students/next-roll-number')
  },

  async createStudent(data: { full_name: string; email: string; roll_number?: string; class_name?: string; password?: string }): Promise<{ ok: boolean; message: string; student: User }> {
    return request<{ ok: boolean; message: string; student: User }>('/api/teacher/students', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async updateStudent(studentId: string, data: { full_name: string; email: string; roll_number?: string; class_name?: string }): Promise<{ ok: boolean; message: string; student: User }> {
    return request<{ ok: boolean; message: string; student: User }>(`/api/teacher/students/${studentId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async deleteStudent(studentId: string): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>(`/api/teacher/students/${studentId}`, {
      method: 'DELETE'
    })
  },

  // Exam Management
  async getExams(): Promise<{ exams: Exam[] }> {
    return request<{ exams: Exam[] }>('/api/teacher/exams')
  },

  async createExam(data: { title: string; subject?: string; class_name?: string; total_marks: number; duration_minutes?: number; exam_date?: string; questions: ExamQuestion[] }): Promise<{ ok: boolean; message: string; exam_id: string }> {
    return request<{ ok: boolean; message: string; exam_id: string }>('/api/teacher/exams', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async getExamDetail(examId: string): Promise<{ exam: Exam }> {
    return request<{ exam: Exam }>(`/api/teacher/exams/${examId}`)
  },

  async deleteExam(examId: string): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>(`/api/teacher/exams/${examId}`, {
      method: 'DELETE'
    })
  },

  // Auto-Mapping & Pending Queue
  async uploadSheetAutoMap(studentSheet: File, examId?: string): Promise<{
    mapped: boolean
    pending?: boolean
    student?: User
    roll_number?: string
    confidence?: number
    storage_filename: string
    pending_id?: string
    reason?: string
    warning?: string
  }> {
    const fd = new FormData()
    fd.append('student_sheet', studentSheet)
    if (examId) fd.append('exam_id', examId)

    return request('/api/teacher/upload-sheet-auto-map', {
      method: 'POST',
      body: fd
    })
  },

  async getPendingSheets(): Promise<{ pending_sheets: PendingSheet[]; count: number }> {
    return request<{ pending_sheets: PendingSheet[]; count: number }>('/api/teacher/pending-sheets')
  },

  async resolvePendingSheet(sheetId: string, data: { student_id?: string; roll_number?: string }): Promise<{ ok: boolean; message: string; student: User; storage_filename: string }> {
    return request<{ ok: boolean; message: string; student: User; storage_filename: string }>(`/api/teacher/pending-sheets/${sheetId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async deletePendingSheet(sheetId: string): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>(`/api/teacher/pending-sheets/${sheetId}`, {
      method: 'DELETE'
    })
  },

  // AI Continuous Improvement
  async getAiImprovementStats(): Promise<AiImprovementStats> {
    return request<AiImprovementStats>('/api/teacher/ai-improvement/stats')
  },

  async runAiImprovement(): Promise<{
    ok: boolean
    new_version: string
    ingested_count: number
    duplicates_skipped: number
    anonymized_count: number
    total_examples: number
    train_count: number
    val_count: number
    test_count: number
    benchmark_mae: number
    benchmark_accuracy: number
    created_at: string
  }> {
    return request('/api/teacher/ai-improvement/run', {
      method: 'POST'
    })
  },

  // Class Analytics & CSV Export
  async getClassAnalytics(): Promise<ClassAnalyticsSummary> {
    return request<ClassAnalyticsSummary>('/api/teacher/analytics/class-summary')
  },

  async downloadClassCsv(): Promise<Blob> {
    return request<Blob>('/api/teacher/export/csv')
  },

  // Student Dashboard
  async getStudentDashboard(): Promise<StudentDashboardData> {
    return request<StudentDashboardData>('/api/student/dashboard')
  },

  async evaluateThreeFiles(
    questionPaper: File,
    answerKey: File,
    studentSheet: File,
    studentId: string,
    testTitle: string,
    onProgress?: (pct: number) => void
  ): Promise<EvaluationRecord & { questions: EvaluationQuestion[] }> {
    const fd = new FormData()
    fd.append('question_paper', questionPaper)
    fd.append('answer_key', answerKey)
    fd.append('student_sheet', studentSheet)
    fd.append('student_id', studentId)
    fd.append('test_title', testTitle)

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const token = getStoredToken()
      xhr.open('POST', '/api/teacher/evaluate-three-files')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 90))
        }
      }

      xhr.onload = () => {
        if (onProgress) onProgress(100)
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)) }
          catch { reject(new Error('Invalid JSON response from server')) }
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            reject(new Error(err.detail || `Server error ${xhr.status}`))
          } catch {
            reject(new Error(`Server error ${xhr.status}: ${xhr.statusText}`))
          }
        }
      }
      xhr.onerror = () => reject(new Error('Network error during file upload'))
      xhr.ontimeout = () => reject(new Error('Request timed out'))
      xhr.timeout = 300000 // 5 min timeout for large files + AI processing
      xhr.send(fd)
    })
  },

  async getTeacherEvaluations(): Promise<{ evaluations: EvaluationRecord[] }> {
    return request<{ evaluations: EvaluationRecord[] }>('/api/teacher/evaluations')
  },

  async getTeacherEvaluationDetail(evalId: string): Promise<{ evaluation: EvaluationRecord & { questions: EvaluationQuestion[] } }> {
    return request<{ evaluation: EvaluationRecord & { questions: EvaluationQuestion[] } }>(`/api/teacher/evaluations/${evalId}`)
  },

  async publishEvaluation(
    evalId: string,
    questions: EvaluationQuestion[],
    teacherComments: string
  ): Promise<{ ok: boolean; evaluation: EvaluationRecord }> {
    return request<{ ok: boolean; evaluation: EvaluationRecord }>(`/api/teacher/evaluations/${evalId}/publish`, {
      method: 'PUT',
      body: JSON.stringify({ questions, teacher_comments: teacherComments })
    })
  },

  async getMyResults(): Promise<{ results: StudentResult[]; analytics: StudentAnalytics }> {
    return request<{ results: StudentResult[]; analytics: StudentAnalytics }>('/api/student/my-results')
  },

  async getMyResultDetail(evalId: string): Promise<{ evaluation: StudentResultDetail }> {
    return request<{ evaluation: StudentResultDetail }>(`/api/student/my-results/${evalId}`)
  },

  async exportPdf(evalId: string): Promise<Blob> {
    return request<Blob>(`/api/export/pdf/${evalId}`)
  },

  async getHealth(): Promise<{ ok: boolean; gemini_configured: boolean; model: string }> {
    return request<{ ok: boolean; gemini_configured: boolean; model: string }>('/api/health')
  }
}
