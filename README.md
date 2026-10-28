# EvalAI — AI-Powered Mathematics Answer Evaluation System

An automated mathematics evaluation platform where teachers upload three files and receive AI-generated proposed marks that they review and publish to students.

---

## Final Workflow

```
Upload 3 Files → Gemini AI Analysis → Proposed Marks & Feedback → Teacher Review → Publish → Student Views Results
```

1. **Teacher uploads** three files: Question Paper + Teacher Answer Key + Student's Written Test  
2. **Backend sends** files to Gemini API (multimodal) for mathematical evaluation  
3. **Gemini + SymPy** extract questions, match student working, evaluate correctness, award partial credit  
4. **Teacher reviews** proposed marks question-by-question, adjusts if needed, adds notes  
5. **Teacher publishes** — student immediately sees their marks, feedback, and explanations  

---

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS | UI for teacher upload, review, student results |
| **Backend** | Python FastAPI + SQLite WAL | REST API, auth, file storage, evaluation orchestration |
| **AI Evaluation** | Google Gemini API (official `google-genai` SDK) | Multimodal PDF/image analysis, mathematical evaluation |
| **Symbolic Verification** | SymPy 1.14.0 | Algebraic equivalence, partial credit validation |
| **PDF Export** | ReportLab | Evaluation certificates for students and teachers |

---

## Roles

### Teacher Portal
- Upload 3 required files (Question Paper, Answer Key, Student Sheet)
- View AI-proposed marks with question-by-question breakdown
- Edit final marks, add teacher notes, approve and publish
- View evaluation history with PDF export

### Student Portal  
- View **only their own** published marks (enforced on backend)
- See question-by-question feedback, mistakes, and explanations
- Analytics summary based on real published results
- Download PDF report

---

## Setup & Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Configure Backend Environment

```bash
cd backend
cp .env.example .env
# Edit .env — paste your GEMINI_API_KEY
```

`.env` file:
```env
SECRET_KEY=your-secret-key-change-in-production
GEMINI_API_KEY=your_actual_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

> ⚠️ **Never commit `.env` to Git.** It is in `.gitignore`.

### 2. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Start Backend Server

```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Backend runs at `http://127.0.0.1:8000`  
API docs available at `http://127.0.0.1:8000/docs`

### 4. Install Frontend Dependencies

```bash
npm install
```

### 5. Start Frontend Dev Server

```bash
npm run dev
```

Frontend runs at `http://localhost:5173` (proxies `/api` to port 8000)

---

## Demo Accounts (Pre-seeded)

| Role | Email | Password |
|------|-------|----------|
| Teacher | `teacher@evalai.edu` | `teacher123` |
| Student | `aarav@evalai.edu` | `student123` |
| Student | `priya@evalai.edu` | `student123` |
| Student | `rohan@evalai.edu` | `student123` |

---

## API Key & Model Configuration

The Gemini API key is **read exclusively from the backend environment**. It is **never exposed to the frontend**.

```python
# backend/gemini_service.py
api_key = os.environ.get("GEMINI_API_KEY", "").strip()
model_id = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()
```

If `GEMINI_API_KEY` is not set, the system falls back to a deterministic SymPy-only local evaluation engine — no AI but still functional.

**Verified model ID:** `gemini-2.5-flash` (confirmed from Google Gemini API documentation and SDK)

---

## File Upload Specifications

| Parameter | Value |
|-----------|-------|
| Supported formats | PDF, JPG, JPEG, PNG |
| Maximum file size | 30 MB per file |
| Files required | All 3 must be present before evaluation |

---

## Backend API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | None | Login |
| `POST` | `/api/auth/register` | None | Register |
| `GET` | `/api/auth/me` | Bearer | Current user |
| `GET` | `/api/teacher/students` | Teacher | List students |
| `POST` | `/api/teacher/evaluate-three-files` | Teacher | Upload 3 files and evaluate |
| `GET` | `/api/teacher/evaluations` | Teacher | List all evaluations |
| `GET` | `/api/teacher/evaluations/{id}` | Teacher | Evaluation detail |
| `PUT` | `/api/teacher/evaluations/{id}/publish` | Teacher | Publish marks |
| `GET` | `/api/student/my-results` | Student | Own published results |
| `GET` | `/api/student/my-results/{id}` | Student | Single result detail |
| `GET` | `/api/export/pdf/{id}` | Either | PDF report |
| `GET` | `/api/health` | None | System health check |

---

## Running Tests

### Backend Math Engine Tests (9 unit tests)
```bash
cd backend
python test_math_engine.py
```

### Backend Import Verification
```bash
cd backend
python test_imports.py
```

### Frontend TypeScript Build
```bash
npm run build
```

---

## Security

- JWT tokens signed with HMAC-SHA256 (no third-party JWT library required)
- Passwords hashed with PBKDF2-SHA256 + random salt (100,000 iterations)
- Students can only access their own published evaluations (enforced by backend query)
- `.env` is in `.gitignore` — API key never in source code or frontend bundle
- File uploads validated: type, extension, size limit, empty-file check
- Directory traversal prevented in `/api/storage/{filename}` endpoint

---

## Evaluation Engine Logic

1. **Gemini Multimodal Analysis:** Files are uploaded via `client.files.upload()` and sent as multimodal parts to `client.models.generate_content()` with a structured JSON response schema
2. **SymPy Validation:** After Gemini proposes scores, SymPy verifies mathematical steps for algebraic correctness, adds any missed errors to the `mistakes` list
3. **Partial Credit:** Valid methods with arithmetic slips earn method marks even if the final answer is wrong
4. **Alternative Methods:** Commutative/equivalent solutions are flagged as accepted (`alternative_method: true`)
5. **Ambiguity Flagging:** Unclear handwriting (l vs 1, O vs 0) is flagged in `flagged_ambiguity` for teacher review
6. **Fallback:** If Gemini is unavailable, local SymPy-only engine processes text extracted from files

---

## Supported Question Types (Mathematics Only)

- Arithmetic & Fractions: `3/4 - 5/6 = -1/12`
- Linear Equations: `2x + 5 = 15 → x = 5`
- Polynomial Factorization: `x² + 5x + 6 → (x+2)(x+3)`
- Quadratic Equations: solving with factoring or quadratic formula
- Arithmetic Progressions: Tₙ = a + (n-1)d

---

## Development Notes

- Frontend build: `npm run build` (TypeScript + Vite)
- Backend database: SQLite with WAL mode at `backend/evalai.db` (auto-initialized on startup)
- Uploaded files stored in `backend/storage/` (git-ignored)
- ML/OCR dependencies (EasyOCR, TrOCR, torch) are **optional** and commented out in `requirements.txt` — Gemini handles file analysis directly
