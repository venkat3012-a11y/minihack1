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
  teacher_comments: string
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

  async register(data: { email: string; password: string; full_name: string; role: string }): Promise<{ access_token: string; user: User }> {
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

  async getTeacherStudents(): Promise<{ students: User[] }> {
    return request<{ students: User[] }>('/api/teacher/students')
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
