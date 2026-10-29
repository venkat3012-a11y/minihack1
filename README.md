# EvalAI — AI-Powered Answer Sheet Evaluation & Personalized Learning System

An end-to-end, intelligent Mathematics evaluation and personalized learning platform. EvalAI combines Gemini Multimodal AI, SymPy symbolic verification, sequential student management, OCR-based answer sheet auto-mapping, rubric validation, class analytics, and continuous model improvement.

---

## Complete System Capabilities

1. **Student Management & Auto-Generated Roll Numbers:**
   - Sequential roll numbers automatically generated in the strict format `25ALR001`, `25ALR002`, `25ALR003`, etc.
   - Guaranteed uniqueness, duplicate prevention, and historical record preservation upon deletion.
2. **Automatic Answer-Sheet Mapping & OCR:**
   - Extracts roll number (`25ALR###`) directly from uploaded student answer sheets (PDF, JPG, JPEG, PNG).
   - Automatically maps answer sheets to registered students.
   - Ambiguous or unreadable sheets are automatically routed to the **Pending Verification Queue** with OCR confidence scores for teacher resolution.
3. **Exam & Rubric Management:**
   - Create and manage exams with question-level rubrics, step solutions, and alternative methods.
   - Strict server-side mathematical validation that question maximum marks sum exactly to the total exam marks.
4. **AI Evaluation with Partial Marking & SymPy Core:**
   - Gemini Multimodal AI extracts handwritten student steps, matches question numbers, and computes proposed marks against rubrics.
   - Python SymPy performs symbolic verification of intermediate algebra, step validity, and alternative equivalent methods.
   - Proportional partial credit (e.g., 2/5, 3/5) awarded for valid working with arithmetic slips; 0 marks for irrelevant work; full credit for equivalent solutions.
   - Handwriting ambiguity warnings (e.g., `l` vs `1`, `O` vs `0`) flagged for teacher attention.
5. **Continuous Model Improvement Pipeline:**
   - Teacher-controlled supervised learning calibration.
   - Automatically ingests verified evaluations, strips student PII, and deduplicates using SHA-256 hashes.
   - Deterministic 70% Training / 15% Validation / 15% Test partitioning.
   - Few-shot exemplar memory injected dynamically into Gemini evaluation prompts.
   - Tracks benchmark Mean Absolute Error (MAE) and accuracy (±0.5 marks) across model versions.
6. **Class Performance Analytics & CSV Export:**
   - Aggregated metrics: class average, pass rate %, highest vs lowest score.
   - Academic grade distribution: `A+` (90-100%), `A` (80-89%), `B` (65-79%), `C` (50-64%), `Needs Improvement` (<50%).
   - Question difficulty index identifying topics where students struggled.
   - One-click CSV export of complete evaluation and question-wise results.
7. **Personalized Student Learning Dashboard:**
   - Student profile with verified roll number and class affiliation.
   - Cumulative academic analytics and performance progress tracking.
   - Identified curriculum strengths and focus areas (weak topics).
   - Personalized learning recommendations tailored to student error patterns.
   - Detailed question-by-question review with model solutions, mistakes, and PDF report download.

---

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS | Teacher Portal, Student Dashboard, Analytics, Rubric Management |
| **Backend** | Python FastAPI + SQLite WAL | REST API, role-based authorization, file handling, migrations |
| **AI Evaluation** | Google Gemini API (official `google-genai` SDK) | Multimodal PDF/image analysis, handwriting recognition, rubric scoring |
| **Symbolic Engine** | Python SymPy 1.14.0 | Algebraic equivalence, step proof, arithmetic slip verification |
| **OCR & Mapping** | Regex Engine + Gemini Vision Fallback | Roll number header extraction and confidence scoring |
| **Export Engine** | ReportLab + Python CSV | PDF certificate cards and full class data exports |

---

## Setup & Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Configure Backend Environment

```bash
cd backend
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
```

`.env` configuration:
```env
SECRET_KEY=your-secure-secret-key-change-in-production
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
```

> ⚠️ **Never commit `.env` to Git.** It is secured in `.gitignore`.

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

- Backend API: `http://127.0.0.1:8000`  
- Interactive API Docs: `http://127.0.0.1:8000/docs`

### 4. Install Frontend Dependencies & Start

```bash
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` (or `5174`).

---

## Pre-Seeded Demo Accounts

| Role | Name | Roll Number / Class | Email | Password |
|------|------|---------------------|-------|----------|
| **Teacher** | Dr. Sarah Sharma | Mathematics Faculty | `teacher@evalai.edu` | `teacher123` |
| **Student** | Aarav Patel | `25ALR001` (Class 10) | `aarav@evalai.edu` | `student123` |
| **Student** | Priya Sharma | `25ALR002` (Class 10) | `priya@evalai.edu` | `student123` |
| **Student** | Rohan Gupta | `25ALR003` (Class 10) | `rohan@evalai.edu` | `student123` |

---

## Test Suites & Verification

### Run All 30 Automated Backend Tests

```bash
cd backend
python -m unittest test_api_endpoints.py test_math_engine.py
```

Result:
```text
Ran 30 tests in 6.407s
OK
```

- **`test_api_endpoints.py` (21 tests):**
  - Student roster CRUD, sequential `25ALR###` roll number generation, duplicate prevention, and deletion protection.
  - Exam creation, rubric validation, and marks summation checks.
  - Automatic roll number OCR extraction, sheet mapping, and pending queue resolution.
  - Continuous AI improvement pipeline (70/15/15 splits, MAE benchmark calculation, version logging).
  - Class analytics summary and CSV export.
  - Student dashboard isolation and personalized analytics.
- **`test_math_engine.py` (9 tests):**
  - SymPy symbolic verification, equivalent expressions, quadratic equations, and partial credit scoring.

### Frontend TypeScript Build

```bash
npm run build
```

Result: `✓ built in 3.37s` with zero TypeScript errors.

---

## Git Repositories

- **Private Repository:** `https://github.com/venkat3012-a11y/minihack`
- **Secondary Repository:** `https://github.com/venkat3012-a11y/minihack1`
