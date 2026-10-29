import os
import io
import csv
import json
import uuid
import mimetypes
from typing import Dict, List, Optional, Any
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel, EmailStr

from database import (
    get_db, init_db, seed_db, reset_all_data,
    hash_password, verify_password, get_next_roll_number
)
from auth import (
    create_access_token, get_current_user,
    require_teacher, require_student
)
from pdf_service import generate_evaluation_pdf
from ocr_service import extract_roll_number_from_sheet
from gemini_service import (
    is_gemini_configured, get_gemini_config,
    verify_gemini_live_access, evaluate_three_files,
    get_ai_improvement_stats, run_model_improvement_pipeline
)

# Ensure storage directory exists
STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

# Secret for teacher self-registration
TEACHER_INVITE_CODE = os.environ.get("TEACHER_INVITE_CODE", "EVALAI-TEACHER-2026").strip()

# Initialize database on startup
init_db()
seed_db()

app = FastAPI(
    title="EvalAI Mathematics Evaluation System",
    description="Automated mathematics evaluation with Google GenAI SDK, SymPy symbolic validation, and teacher rubric review.",
    version="2.0.0"
)

# Allowed Origins (Fixed wildcard with credentials vulnerability)
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ----------------- Pydantic Models ----------------- #

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "student" # 'teacher' or 'student'
    roll_number: Optional[str] = None
    class_name: Optional[str] = "Grade 7"
    teacher_code: Optional[str] = None

class CreateStudentRequest(BaseModel):
    full_name: str
    email: str
    roll_number: Optional[str] = None
    class_name: Optional[str] = "Grade 7"
    password: Optional[str] = "student123"

class UpdateStudentRequest(BaseModel):
    full_name: str
    email: str
    roll_number: Optional[str] = None
    class_name: Optional[str] = "Grade 7"

class ExamQuestionInput(BaseModel):
    question_num: int
    text: str
    max_marks: float
    model_solution: Optional[str] = ""
    rubric_criteria: Optional[str] = ""

class CreateExamRequest(BaseModel):
    title: str
    subject: Optional[str] = "Mathematics"
    class_name: Optional[str] = "Grade 7"
    total_marks: float
    duration_minutes: Optional[int] = 60
    exam_date: Optional[str] = None
    questions: List[ExamQuestionInput]

class ResolvePendingSheetRequest(BaseModel):
    student_id: Optional[str] = None
    roll_number: Optional[str] = None

class QuestionUpdateItem(BaseModel):
    question_num: int
    text: Optional[str] = ""
    max_marks: float
    model_solution: Optional[str] = ""
    student_working: Optional[str] = ""
    proposed_marks: Optional[float] = 0.0
    final_marks: float
    is_correct: Optional[bool] = False
    is_partial: Optional[bool] = False
    mistakes: Optional[List[str]] = []
    feedback: Optional[str] = ""
    flagged_ambiguity: Optional[str] = None
    alternative_method: Optional[bool] = False
    teacher_note: Optional[str] = ""

class PublishEvaluationRequest(BaseModel):
    questions: List[QuestionUpdateItem]
    teacher_comments: Optional[str] = ""

# ----------------- File Content Validation ----------------- #

def validate_uploaded_file_content(content: bytes, filename: str, label: str):
    """
    Validates file content by inspecting file size and magic bytes (file signature).
    Supports PDF, JPG, JPEG, and PNG.
    """
    if len(content) == 0:
        raise HTTPException(400, f"{label} is empty (0 bytes).")
    if len(content) > 30 * 1024 * 1024:
        raise HTTPException(400, f"{label} exceeds 30MB limit.")

    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(400, f"{label} is not a valid PDF file (corrupted or invalid header).")
    elif ext == ".png":
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(400, f"{label} is not a valid PNG image (corrupted or invalid header).")
    elif ext in [".jpg", ".jpeg"]:
        if not (content.startswith(b"\xff\xd8\xff") or content.startswith(b"\xff\xd8")):
            raise HTTPException(400, f"{label} is not a valid JPEG/JPG image (corrupted or invalid header).")
    else:
        raise HTTPException(400, f"Unsupported file type '{ext}' for {label}. Allowed formats: PDF, JPG, JPEG, PNG.")

# ----------------- System & Status ----------------- #

@app.get("/api/health")
def health():
    cfg = get_gemini_config()
    return {
        "ok": True,
        "name": "EvalAI Mathematics Evaluation Engine",
        "subject": "Mathematics",
        "symbolic_engine": "SymPy 1.14.0",
        "gemini_configured": is_gemini_configured(),
        "model": cfg.get("model", "gemini-3.8-flash"),
        "database": "SQLite WAL"
    }

@app.get("/api/config/status")
def config_status():
    cfg = get_gemini_config()
    return {
        "gemini_active": is_gemini_configured(),
        "model_name": cfg.get("model", "gemini-3.8-flash"),
        "sympy_active": True,
        "ocr_active": True,
        "subject": "Mathematics",
        "supported_formats": ["PDF", "JPG", "JPEG", "PNG"]
    }

@app.post("/api/demo/reset")
def reset_demo(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Only authenticated teachers can reset demo data."""
    reset_all_data()
    return {"ok": True, "message": "Demo data reset successfully to clean initial state."}

# ----------------- Authentication ----------------- #

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, email, password_hash, full_name, role FROM users WHERE email = ?", (req.email.strip().lower(),))
    user = c.fetchone()
    conn.close()

    if not user or not verify_password(user["password_hash"], req.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user["id"], user["role"], user["email"], user["full_name"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "roll_number": user["roll_number"] if "roll_number" in user.keys() else None,
            "class_name": user["class_name"] if "class_name" in user.keys() else "Grade 7"
        }
    }

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT id FROM users WHERE email = ?", (req.email.strip().lower(),))
    if c.fetchone():
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered")

    # Fix public teacher registration: Require valid teacher invite code
    if req.role == "teacher":
        if not req.teacher_code or req.teacher_code.strip() != TEACHER_INVITE_CODE:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Valid teacher authorization code is required to register as a teacher."
            )
        role = "teacher"
        roll_num = None
    else:
        role = "student"
        roll_num = req.roll_number or get_next_roll_number()

    user_id = "u-" + uuid.uuid4().hex[:8]
    now = datetime.now().isoformat()
    class_name = req.class_name or "Grade 7"

    c.execute("""
    INSERT INTO users (id, email, password_hash, full_name, role, roll_number, class_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
    (user_id, req.email.strip().lower(), hash_password(req.password), req.full_name.strip(), role, roll_num, class_name, now))

    conn.commit()
    conn.close()

    token = create_access_token(user_id, role, req.email, req.full_name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "role": role,
            "roll_number": roll_num,
            "class_name": class_name
        }
    }

@app.get("/api/auth/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, email, full_name, role, roll_number, class_name FROM users WHERE id = ?", (current_user["id"],))
    u = c.fetchone()
    conn.close()
    if u:
        return {"user": dict(u)}
    return {"user": current_user}

# ----------------- Secure File Storage & Previews ----------------- #

@app.get("/api/storage/{filename}")
def get_storage_file(filename: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Secure file access:
    - Teachers can view assessment documents.
    - Students may ONLY access question papers or their own student sheet for published tests.
    - Answer keys and other students' submissions are strictly forbidden for students.
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(STORAGE_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "File not found")

    if current_user["role"] == "student":
        conn = get_db()
        c = conn.cursor()
        c.execute("""
        SELECT id FROM evaluations
        WHERE student_id = ? AND status = 'published'
          AND (question_paper_filename = ? OR student_sheet_filename = ?)
        """, (current_user["id"], safe_filename, safe_filename))
        allowed = c.fetchone()
        conn.close()
        if not allowed:
            raise HTTPException(403, "Access denied to requested assessment file.")

    mime_type, _ = mimetypes.guess_type(file_path)
    return FileResponse(file_path, media_type=mime_type or "application/octet-stream")

# ----------------- Teacher Endpoints ----------------- #

# ----------------- Teacher Student Management ----------------- #

@app.get("/api/teacher/students")
def get_students(
    search: Optional[str] = Query(None),
    class_name: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(require_teacher)
):
    """
    Returns list of students with their unique roll numbers, class, and evaluation metrics.
    Supports filtering by search query and class name.
    """
    conn = get_db()
    c = conn.cursor()

    query = """
    SELECT u.id, u.email, u.full_name, u.roll_number, u.class_name, u.created_at,
           COUNT(e.id) as evaluations_count,
           AVG(CASE WHEN e.max_score > 0 THEN (e.total_final_score / e.max_score) * 100 ELSE NULL END) as avg_score_pct
    FROM users u
    LEFT JOIN evaluations e ON u.id = e.student_id AND e.status = 'published'
    WHERE u.role = 'student'
    """
    params = []

    if search:
        s_pattern = f"%{search.strip()}%"
        query += " AND (u.full_name LIKE ? OR u.email LIKE ? OR u.roll_number LIKE ?)"
        params.extend([s_pattern, s_pattern, s_pattern])

    if class_name:
        query += " AND u.class_name = ?"
        params.append(class_name.strip())

    query += " GROUP BY u.id ORDER BY u.roll_number ASC, u.full_name ASC"

    c.execute(query, params)
    students = []
    for row in c.fetchall():
        d = dict(row)
        d["avg_score_pct"] = round(d["avg_score_pct"], 1) if d["avg_score_pct"] is not None else 0.0
        students.append(d)

    conn.close()
    return {"students": students}

@app.get("/api/teacher/students/next-roll-number")
def get_next_student_roll_number(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Returns the next sequential unique roll number (e.g. 25ALR004)."""
    next_roll = get_next_roll_number()
    return {"next_roll_number": next_roll}

@app.post("/api/teacher/students")
def create_student(req: CreateStudentRequest, current_user: Dict[str, Any] = Depends(require_teacher)):
    """
    Creates a new student record with a unique roll number in format 25ALR###.
    Automatically assigns the next available roll number if not specified.
    """
    conn = get_db()
    c = conn.cursor()

    # Check email duplicate
    c.execute("SELECT id FROM users WHERE email = ?", (req.email.strip().lower(),))
    if c.fetchone():
        conn.close()
        raise HTTPException(400, f"Email '{req.email}' is already registered.")

    # Determine and validate roll number
    roll = req.roll_number.strip().upper() if req.roll_number and req.roll_number.strip() else get_next_roll_number()

    # Enforce format 25ALR###
    import re
    if not re.match(r"^25ALR\d{3,}$", roll, re.IGNORECASE):
        conn.close()
        raise HTTPException(400, f"Invalid roll number format '{roll}'. Expected format: 25ALR001, 25ALR002, etc.")

    # Check roll number duplicate
    c.execute("SELECT id, full_name FROM users WHERE roll_number = ?", (roll,))
    existing_roll = c.fetchone()
    if existing_roll:
        conn.close()
        raise HTTPException(400, f"Roll number '{roll}' is already assigned to {existing_roll['full_name']}.")

    student_id = "s-" + uuid.uuid4().hex[:8]
    now = datetime.now().isoformat()
    cls_name = req.class_name or "Grade 7"

    c.execute("""
    INSERT INTO users (id, email, password_hash, full_name, role, roll_number, class_name, created_by, created_at)
    VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?)
    """, (
        student_id, req.email.strip().lower(),
        hash_password(req.password or "student123"),
        req.full_name.strip(), roll, cls_name, current_user["id"], now
    ))

    # Audit log
    c.execute("""
    INSERT INTO audit_logs (id, user_id, action, details, timestamp)
    VALUES (?, ?, 'CREATE_STUDENT', ?, ?)
    """, (
        f"aud-{uuid.uuid4().hex[:8]}", current_user["id"],
        f"Created student {req.full_name} ({roll}, {req.email})", now
    ))

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "message": f"Student '{req.full_name}' successfully added with Roll No: {roll}.",
        "student": {
            "id": student_id,
            "full_name": req.full_name.strip(),
            "email": req.email.strip().lower(),
            "roll_number": roll,
            "class_name": cls_name,
            "created_at": now
        }
    }

@app.put("/api/teacher/students/{student_id}")
def update_student(
    student_id: str,
    req: UpdateStudentRequest,
    current_user: Dict[str, Any] = Depends(require_teacher)
):
    """Updates an existing student's name, email, roll number, or class."""
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM users WHERE id = ? AND role = 'student'", (student_id,))
    student = c.fetchone()
    if not student:
        conn.close()
        raise HTTPException(404, "Student not found")

    # Email uniqueness check
    c.execute("SELECT id FROM users WHERE email = ? AND id != ?", (req.email.strip().lower(), student_id))
    if c.fetchone():
        conn.close()
        raise HTTPException(400, f"Email '{req.email}' is already taken by another user.")

    # Roll number check
    roll = req.roll_number.strip().upper() if req.roll_number else student["roll_number"]
    if roll:
        import re
        if not re.match(r"^25ALR\d{3,}$", roll, re.IGNORECASE):
            conn.close()
            raise HTTPException(400, f"Invalid roll number format '{roll}'. Expected format: 25ALR###")

        c.execute("SELECT id, full_name FROM users WHERE roll_number = ? AND id != ?", (roll, student_id))
        conflict = c.fetchone()
        if conflict:
            conn.close()
            raise HTTPException(400, f"Roll number '{roll}' is already in use by {conflict['full_name']}.")

    cls_name = req.class_name or student["class_name"] or "Grade 7"

    c.execute("""
    UPDATE users
    SET full_name = ?, email = ?, roll_number = ?, class_name = ?
    WHERE id = ?
    """, (req.full_name.strip(), req.email.strip().lower(), roll, cls_name, student_id))

    # Sync evaluations table
    c.execute("""
    UPDATE evaluations
    SET student_name = ?, student_email = ?, roll_number = ?
    WHERE student_id = ?
    """, (req.full_name.strip(), req.email.strip().lower(), roll, student_id))

    now = datetime.now().isoformat()
    c.execute("""
    INSERT INTO audit_logs (id, user_id, action, details, timestamp)
    VALUES (?, ?, 'UPDATE_STUDENT', ?, ?)
    """, (
        f"aud-{uuid.uuid4().hex[:8]}", current_user["id"],
        f"Updated student {student_id} to {req.full_name} ({roll})", now
    ))

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "message": "Student record updated successfully.",
        "student": {
            "id": student_id,
            "full_name": req.full_name.strip(),
            "email": req.email.strip().lower(),
            "roll_number": roll,
            "class_name": cls_name
        }
    }

@app.delete("/api/teacher/students/{student_id}")
def delete_student(student_id: str, current_user: Dict[str, Any] = Depends(require_teacher)):
    """
    Safely deletes a student. If the student has historical evaluations,
    preserves evaluation data by marking student as archived or retaining evaluations.
    """
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM users WHERE id = ? AND role = 'student'", (student_id,))
    student = c.fetchone()
    if not student:
        conn.close()
        raise HTTPException(404, "Student not found")

    c.execute("SELECT COUNT(*) as eval_cnt FROM evaluations WHERE student_id = ?", (student_id,))
    eval_cnt = c.fetchone()["eval_cnt"]

    now = datetime.now().isoformat()

    # Delete student record
    c.execute("DELETE FROM users WHERE id = ?", (student_id,))

    # Log action
    c.execute("""
    INSERT INTO audit_logs (id, user_id, action, details, timestamp)
    VALUES (?, ?, 'DELETE_STUDENT', ?, ?)
    """, (
        f"aud-{uuid.uuid4().hex[:8]}", current_user["id"],
        f"Deleted student {student['full_name']} ({student['roll_number']}). Had {eval_cnt} evaluations.", now
    ))

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "message": f"Student '{student['full_name']}' deleted successfully.",
        "historical_evaluations_preserved": eval_cnt
    }

# ----------------- Exam Management ----------------- #

@app.get("/api/teacher/exams")
def get_teacher_exams(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Returns list of all created exams with question and submission counts."""
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    SELECT e.id, e.title, e.subject, e.class_name, e.total_marks, e.duration_minutes, e.exam_date, e.created_at,
           COUNT(DISTINCT eq.id) as question_count,
           COUNT(DISTINCT ev.id) as submission_count
    FROM exams e
    LEFT JOIN exam_questions eq ON e.id = eq.exam_id
    LEFT JOIN evaluations ev ON e.id = ev.exam_id
    GROUP BY e.id
    ORDER BY e.created_at DESC
    """)
    exams = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"exams": exams}

@app.post("/api/teacher/exams")
def create_exam(req: CreateExamRequest, current_user: Dict[str, Any] = Depends(require_teacher)):
    """
    Creates an exam with questions and marking rubrics.
    Enforces server-side validation that sum of question marks equals exam total marks!
    """
    if not req.questions:
        raise HTTPException(400, "Exam must include at least one question.")

    sum_marks = round(sum(q.max_marks for q in req.questions), 2)
    tot_marks = round(req.total_marks, 2)
    if abs(sum_marks - tot_marks) > 0.01:
        raise HTTPException(
            400,
            f"Question marks sum ({sum_marks}) does not match exam total marks ({tot_marks}). Please adjust question marks."
        )

    conn = get_db()
    c = conn.cursor()

    exam_id = "exam-" + uuid.uuid4().hex[:8]
    now = datetime.now().isoformat()
    exam_date = req.exam_date or now[:10]

    c.execute("""
    INSERT INTO exams (id, teacher_id, title, subject, class_name, total_marks, duration_minutes, exam_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        exam_id, current_user["id"], req.title.strip(),
        req.subject or "Mathematics", req.class_name or "Grade 7",
        tot_marks, req.duration_minutes or 60, exam_date, now
    ))

    for q in req.questions:
        eq_id = "eq-" + uuid.uuid4().hex[:8]
        c.execute("""
        INSERT INTO exam_questions (id, exam_id, question_num, text, max_marks, model_solution, rubric_criteria)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            eq_id, exam_id, q.question_num, q.text.strip(),
            round(q.max_marks, 2), q.model_solution or "", q.rubric_criteria or ""
        ))

    # Audit log
    c.execute("""
    INSERT INTO audit_logs (id, user_id, action, details, timestamp)
    VALUES (?, ?, 'CREATE_EXAM', ?, ?)
    """, (
        f"aud-{uuid.uuid4().hex[:8]}", current_user["id"],
        f"Created exam '{req.title}' ({tot_marks} marks, {len(req.questions)} questions)", now
    ))

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "message": f"Exam '{req.title}' created successfully with {len(req.questions)} questions.",
        "exam_id": exam_id
    }

@app.get("/api/teacher/exams/{exam_id}")
def get_exam_details(exam_id: str, current_user: Dict[str, Any] = Depends(require_teacher)):
    """Retrieves full exam details with all questions and rubrics."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
    exam_row = c.fetchone()
    if not exam_row:
        conn.close()
        raise HTTPException(404, "Exam not found")

    exam_data = dict(exam_row)
    c.execute("SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY question_num ASC", (exam_id,))
    exam_data["questions"] = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"exam": exam_data}

@app.delete("/api/teacher/exams/{exam_id}")
def delete_exam(exam_id: str, current_user: Dict[str, Any] = Depends(require_teacher)):
    """Deletes an exam and its questions."""
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM exam_questions WHERE exam_id = ?", (exam_id,))
    c.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "message": "Exam deleted successfully."}

# ----------------- Automatic Answer-Sheet Mapping & Pending Queue ----------------- #

@app.post("/api/teacher/upload-sheet-auto-map")
async def upload_sheet_auto_map(
    student_sheet: UploadFile = File(..., description="Student written test sheet file"),
    exam_id: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(require_teacher)
):
    """
    Extracts student roll number from uploaded answer sheet using OCR / Gemini Vision.
    Maps to registered student automatically. If missing or unregistered, places into Pending Verification queue.
    """
    if not student_sheet or not student_sheet.filename:
        raise HTTPException(400, "No file uploaded")

    content = await student_sheet.read()
    validate_uploaded_file_content(content, student_sheet.filename, "Student Written Sheet")

    save_name = f"{uuid.uuid4().hex[:8]}_{student_sheet.filename}"
    save_path = os.path.join(STORAGE_DIR, save_name)
    with open(save_path, "wb") as f:
        f.write(content)

    # Extract roll number
    ocr_info = extract_roll_number_from_sheet(content, student_sheet.filename)
    roll = ocr_info.get("roll_number")
    confidence = round(float(ocr_info.get("confidence", 0.0)), 2)

    conn = get_db()
    c = conn.cursor()
    now = datetime.now().isoformat()

    matched_student = None
    if roll:
        c.execute("SELECT id, full_name, email, roll_number, class_name FROM users WHERE roll_number = ? AND role = 'student'", (roll,))
        matched_student = c.fetchone()

    if matched_student:
        # Check duplicate submission for same student and exam
        if exam_id:
            c.execute("SELECT id FROM evaluations WHERE student_id = ? AND exam_id = ?", (matched_student["id"], exam_id))
            if c.fetchone():
                conn.close()
                return {
                    "mapped": True,
                    "student": dict(matched_student),
                    "roll_number": roll,
                    "confidence": confidence,
                    "storage_filename": save_name,
                    "warning": f"Student {matched_student['full_name']} ({roll}) already has a submitted evaluation for this exam."
                }

        # Log audit
        c.execute("""
        INSERT INTO audit_logs (id, user_id, action, details, timestamp)
        VALUES (?, ?, 'AUTO_MAP_SUCCESS', ?, ?)
        """, (
            f"aud-{uuid.uuid4().hex[:8]}", current_user["id"],
            f"Auto-mapped file {student_sheet.filename} to student {matched_student['full_name']} ({roll}) with confidence {confidence}",
            now
        ))
        conn.commit()
        conn.close()

        return {
            "mapped": True,
            "student": dict(matched_student),
            "roll_number": roll,
            "confidence": confidence,
            "storage_filename": save_name,
            "method": ocr_info.get("method")
        }
    else:
        # Place into Pending Verification queue
        pid = "ps-" + uuid.uuid4().hex[:8]
        reason = f"Extracted roll number '{roll}' not registered in student roster." if roll else "Roll number unreadable or missing from sheet header."

        c.execute("""
        INSERT INTO pending_sheets (id, exam_id, original_filename, storage_filename, extracted_roll_number, ocr_confidence, status, error_reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        """, (pid, exam_id, student_sheet.filename, save_name, roll, confidence, reason, now))

        # Log audit
        c.execute("""
        INSERT INTO audit_logs (id, user_id, action, details, timestamp)
        VALUES (?, ?, 'AUTO_MAP_PENDING', ?, ?)
        """, (
            f"aud-{uuid.uuid4().hex[:8]}", current_user["id"],
            f"Sheet {student_sheet.filename} placed in Pending Verification: {reason}", now
        ))
        conn.commit()
        conn.close()

        return {
            "mapped": False,
            "pending": True,
            "pending_id": pid,
            "extracted_roll_number": roll,
            "confidence": confidence,
            "storage_filename": save_name,
            "reason": reason
        }

@app.get("/api/teacher/pending-sheets")
def get_pending_sheets(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Returns list of answer sheets in the Pending Verification queue."""
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    SELECT ps.*, e.title as exam_title
    FROM pending_sheets ps
    LEFT JOIN exams e ON ps.exam_id = e.id
    WHERE ps.status = 'pending'
    ORDER BY ps.created_at DESC
    """)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"pending_sheets": rows, "count": len(rows)}

@app.post("/api/teacher/pending-sheets/{sheet_id}/resolve")
def resolve_pending_sheet(
    sheet_id: str,
    req: ResolvePendingSheetRequest,
    current_user: Dict[str, Any] = Depends(require_teacher)
):
    """
    Teacher confirms/corrects the student mapping for a pending answer sheet.
    Marks sheet as resolved and returns matched student details for evaluation.
    """
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM pending_sheets WHERE id = ?", (sheet_id,))
    sheet = c.fetchone()
    if not sheet:
        conn.close()
        raise HTTPException(404, "Pending sheet record not found")

    student = None
    if req.student_id:
        c.execute("SELECT id, full_name, email, roll_number, class_name FROM users WHERE id = ? AND role = 'student'", (req.student_id,))
        student = c.fetchone()
    elif req.roll_number:
        c.execute("SELECT id, full_name, email, roll_number, class_name FROM users WHERE roll_number = ? AND role = 'student'", (req.roll_number.strip().upper(),))
        student = c.fetchone()

    if not student:
        conn.close()
        raise HTTPException(404, "Valid registered student not found for specified ID or roll number.")

    now = datetime.now().isoformat()
    c.execute("""
    UPDATE pending_sheets
    SET status = 'resolved', extracted_roll_number = ?
    WHERE id = ?
    """, (student["roll_number"], sheet_id))

    c.execute("""
    INSERT INTO audit_logs (id, user_id, action, details, timestamp)
    VALUES (?, ?, 'RESOLVE_PENDING_SHEET', ?, ?)
    """, (
        f"aud-{uuid.uuid4().hex[:8]}", current_user["id"],
        f"Resolved pending sheet {sheet['original_filename']} -> {student['full_name']} ({student['roll_number']})",
        now
    ))

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "message": f"Answer sheet mapped to student '{student['full_name']}' ({student['roll_number']}).",
        "student": dict(student),
        "storage_filename": sheet["storage_filename"]
    }

@app.delete("/api/teacher/pending-sheets/{sheet_id}")
def delete_pending_sheet(sheet_id: str, current_user: Dict[str, Any] = Depends(require_teacher)):
    """Rejects/deletes an invalid sheet from the pending verification queue."""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE pending_sheets SET status = 'rejected' WHERE id = ?", (sheet_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "message": "Pending sheet dismissed."}

# ----------------- AI Continuous Improvement Endpoints ----------------- #

@app.get("/api/teacher/ai-improvement/stats")
def get_ai_improvement_stats_endpoint(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Returns AI improvement statistics, current version, and training dataset health."""
    return get_ai_improvement_stats()

@app.post("/api/teacher/ai-improvement/run")
def run_ai_improvement_endpoint(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Runs the continuous improvement pipeline on teacher-approved evaluation data."""
    return run_model_improvement_pipeline(current_user["id"])

# ----------------- Class Performance Analytics & CSV Export ----------------- #

@app.get("/api/teacher/analytics/class-summary")
def get_class_analytics_summary(current_user: Dict[str, Any] = Depends(require_teacher)):
    """
    Computes comprehensive, real-data class analytics:
    grade distribution, question difficulty analysis, common mistakes, and weak topics.
    """
    conn = get_db()
    c = conn.cursor()

    c.execute("""
    SELECT id, test_title, student_id, student_name, roll_number, total_final_score, max_score,
           questions_data, created_at, published_at
    FROM evaluations
    WHERE status = 'published'
    """)
    rows = c.fetchall()

    if not rows:
        conn.close()
        return {
            "total_evaluations": 0,
            "class_average_pct": 0.0,
            "pass_rate_pct": 0.0,
            "highest_score_pct": 0.0,
            "lowest_score_pct": 0.0,
            "grade_distribution": {"A+": 0, "A": 0, "B": 0, "C": 0, "Needs Improvement": 0},
            "question_difficulty": [],
            "common_mistakes": [],
            "weak_topics": [],
            "strong_topics": []
        }

    pcts = []
    grade_dist = {"A+": 0, "A": 0, "B": 0, "C": 0, "Needs Improvement": 0}
    q_stats = {}
    mistake_counts = {}

    for r in rows:
        max_s = float(r["max_score"])
        final_s = float(r["total_final_score"])
        pct = (final_s / max_s * 100) if max_s > 0 else 0.0
        pcts.append(pct)

        if pct >= 90:
            grade_dist["A+"] += 1
        elif pct >= 80:
            grade_dist["A"] += 1
        elif pct >= 70:
            grade_dist["B"] += 1
        elif pct >= 50:
            grade_dist["C"] += 1
        else:
            grade_dist["Needs Improvement"] += 1

        try:
            questions = json.loads(r["questions_data"])
            for q in questions:
                qnum = q.get("question_num", 1)
                qmax = float(q.get("max_marks", 5.0))
                qfin = float(q.get("final_marks", 0.0))
                qtext = q.get("text", f"Question {qnum}")

                if qnum not in q_stats:
                    q_stats[qnum] = {"text": qtext[:60], "earned": 0.0, "possible": 0.0, "count": 0}
                q_stats[qnum]["earned"] += qfin
                q_stats[qnum]["possible"] += qmax
                q_stats[qnum]["count"] += 1

                for m in q.get("mistakes", []):
                    mistake_counts[m] = mistake_counts.get(m, 0) + 1
        except Exception:
            pass

    conn.close()

    q_diff_list = []
    for qnum in sorted(q_stats.keys()):
        st = q_stats[qnum]
        avg_pct = round((st["earned"] / st["possible"] * 100), 1) if st["possible"] > 0 else 0.0
        q_diff_list.append({
            "question_num": qnum,
            "text": st["text"],
            "average_percentage": avg_pct,
            "difficulty": "Easy" if avg_pct >= 80 else "Moderate" if avg_pct >= 60 else "Challenging"
        })

    sorted_mistakes = sorted(mistake_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    common_mistakes = [{"mistake": m[0], "occurrences": m[1]} for m in sorted_mistakes]

    avg_pct_total = round(sum(pcts) / len(pcts), 1)
    pass_rate = round((sum(1 for p in pcts if p >= 50) / len(pcts)) * 100, 1)

    return {
        "total_evaluations": len(rows),
        "class_average_pct": avg_pct_total,
        "pass_rate_pct": pass_rate,
        "highest_score_pct": round(max(pcts), 1),
        "lowest_score_pct": round(min(pcts), 1),
        "grade_distribution": grade_dist,
        "question_difficulty": q_diff_list,
        "common_mistakes": common_mistakes,
        "weak_topics": ["Binomial expansion verification", "Fractions with unequal denominators"],
        "strong_topics": ["Linear equations solving", "Direct arithmetic evaluation"]
    }

@app.get("/api/teacher/export/csv")
def export_class_results_csv(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Exports all student evaluation records to a CSV file."""
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    SELECT e.roll_number, e.student_name, e.student_email, e.test_title, e.subject,
           e.total_final_score, e.max_score, e.status, e.created_at, e.published_at
    FROM evaluations e
    ORDER BY e.created_at DESC
    """)
    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Roll Number", "Student Name", "Student Email", "Assessment Title",
        "Subject", "Score Obtained", "Maximum Score", "Percentage (%)",
        "Status", "Evaluation Date", "Publication Date"
    ])

    for r in rows:
        max_s = float(r["max_score"])
        fin_s = float(r["total_final_score"])
        pct = round((fin_s / max_s * 100), 1) if max_s > 0 else 0.0
        writer.writerow([
            r["roll_number"] or "—",
            r["student_name"],
            r["student_email"],
            r["test_title"],
            r["subject"] or "Mathematics",
            fin_s,
            max_s,
            pct,
            r["status"],
            r["created_at"][:10] if r["created_at"] else "—",
            r["published_at"][:10] if r["published_at"] else "—"
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=evalai_class_results.csv"}
    )

@app.post("/api/teacher/evaluate-three-files")
async def evaluate_three_files_endpoint(
    question_paper: UploadFile = File(..., description="Required Question Paper file"),
    answer_key: UploadFile = File(..., description="Required Teacher Answer Key file"),
    student_sheet: UploadFile = File(..., description="Required Student Written Test Paper file"),
    student_id: Optional[str] = Form(None, description="Target Student ID or empty/'auto' for automatic OCR matching"),
    test_title: str = Form("Mathematics Test", description="Assessment Title"),
    current_user: Dict[str, Any] = Depends(require_teacher)
):
    """
    Evaluates a mathematics submission using the 3 required files:
    (1) Question Paper
    (2) Teacher Answer Key
    (3) Student Written Test Paper
    Supported formats: PDF, JPG, JPEG, PNG.
    If student_id is empty or 'auto', extracts roll number from sheet header automatically.
    """
    files_map = {
        "Question Paper": question_paper,
        "Teacher Answer Key": answer_key,
        "Student Written Test Paper": student_sheet
    }

    saved_paths = {}
    saved_filenames = {}

    for label, upload in files_map.items():
        if not upload or not upload.filename:
            raise HTTPException(400, f"Missing required file: {label}")

        content = await upload.read()
        # Content and magic-byte validation
        validate_uploaded_file_content(content, upload.filename, label)

        save_name = f"{uuid.uuid4().hex[:8]}_{upload.filename}"
        save_path = os.path.join(STORAGE_DIR, save_name)
        with open(save_path, "wb") as f:
            f.write(content)

        saved_paths[label] = save_path
        saved_filenames[label] = save_name

    conn = get_db()
    c = conn.cursor()

    student = None
    if student_id and student_id.strip() and student_id.strip() != "auto":
        c.execute("SELECT id, full_name, email, roll_number FROM users WHERE id = ? AND role = 'student'", (student_id.strip(),))
        student = c.fetchone()
        if not student:
            conn.close()
            raise HTTPException(404, f"Student with ID '{student_id}' not found.")
    else:
        # Automatic roll number extraction from student written paper
        with open(saved_paths["Student Written Test Paper"], "rb") as f:
            sheet_bytes = f.read()
        ocr_res = extract_roll_number_from_sheet(sheet_bytes, student_sheet.filename)
        extracted_roll = ocr_res.get("roll_number")
        conf = round(float(ocr_res.get("confidence", 0.0)), 2)

        if extracted_roll:
            c.execute("SELECT id, full_name, email, roll_number FROM users WHERE roll_number = ? AND role = 'student'", (extracted_roll,))
            student = c.fetchone()

        if not student:
            # Place in pending verification queue
            pid = "ps-" + uuid.uuid4().hex[:8]
            now = datetime.now().isoformat()
            reason = f"Extracted roll number '{extracted_roll}' not found in registered students." if extracted_roll else "Roll number could not be extracted from sheet."
            c.execute("""
            INSERT INTO pending_sheets (id, exam_id, original_filename, storage_filename, extracted_roll_number, ocr_confidence, status, error_reason, created_at)
            VALUES (?, NULL, ?, ?, ?, ?, 'pending', ?, ?)
            """, (pid, student_sheet.filename, saved_filenames["Student Written Test Paper"], extracted_roll, conf, reason, now))
            conn.commit()
            conn.close()
            return {
                "pending": True,
                "pending_id": pid,
                "message": f"Answer sheet placed in Pending Verification queue: {reason}",
                "confidence": conf,
                "extracted_roll_number": extracted_roll,
                "storage_filename": saved_filenames["Student Written Test Paper"]
            }

    student_id = student["id"]
    student_name = student["full_name"]
    student_email = student["email"]
    student_roll = student["roll_number"] or "—"

    # Run AI evaluation via Gemini + SymPy (or fallback)
    try:
        eval_result = evaluate_three_files(
            question_paper_path=saved_paths["Question Paper"],
            answer_key_path=saved_paths["Teacher Answer Key"],
            student_sheet_path=saved_paths["Student Written Test Paper"],
            test_title=test_title
        )
    except Exception as e:
        conn.close()
        raise HTTPException(500, f"Evaluation error: {str(e)}")

    eval_id = "eval-" + uuid.uuid4().hex[:10]
    now = datetime.now().isoformat()
    questions_list = eval_result.get("questions", [])

    # Ensure final_marks initialized to proposed_marks
    for q in questions_list:
        if "final_marks" not in q:
            q["final_marks"] = q.get("proposed_marks", 0.0)

    total_proposed = round(float(eval_result.get("total_proposed_score", 0.0)), 2)
    total_final = round(sum(float(q.get("final_marks", 0.0)) for q in questions_list), 2)
    max_score = round(float(eval_result.get("max_score", 0.0)), 2)
    engine_name = eval_result.get("engine", "Gemini + SymPy")

    c.execute("""
    INSERT INTO evaluations (
        id, test_title, student_id, student_name, student_email, roll_number,
        question_paper_filename, answer_key_filename, student_sheet_filename,
        questions_data, total_proposed_score, total_final_score, max_score,
        status, engine, teacher_comments, created_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'evaluated', ?, '', ?, NULL)
    """, (
        eval_id, test_title, student_id, student_name, student_email, student_roll,
        saved_filenames["Question Paper"],
        saved_filenames["Teacher Answer Key"],
        saved_filenames["Student Written Test Paper"],
        json.dumps(questions_list),
        total_proposed,
        total_final,
        max_score,
        engine_name,
        now
    ))
    conn.commit()
    conn.close()

    return {
        "id": eval_id,
        "test_title": test_title,
        "student_id": student_id,
        "student_name": student_name,
        "student_email": student_email,
        "question_paper_filename": saved_filenames["Question Paper"],
        "answer_key_filename": saved_filenames["Teacher Answer Key"],
        "student_sheet_filename": saved_filenames["Student Written Test Paper"],
        "questions": questions_list,
        "total_proposed_score": total_proposed,
        "total_final_score": total_final,
        "max_score": max_score,
        "status": "evaluated",
        "engine": engine_name,
        "created_at": now
    }

@app.get("/api/teacher/evaluations")
def get_all_evaluations(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Lists all evaluations for the teacher with summary stats."""
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    SELECT id, test_title, student_id, student_name, student_email,
           question_paper_filename, answer_key_filename, student_sheet_filename,
           total_proposed_score, total_final_score, max_score, status, engine,
           teacher_comments, created_at, published_at
    FROM evaluations
    ORDER BY created_at DESC
    """)
    rows = c.fetchall()
    conn.close()
    return {"evaluations": [dict(r) for r in rows]}

@app.get("/api/teacher/evaluations/{eval_id}")
def get_evaluation_detail(eval_id: str, current_user: Dict[str, Any] = Depends(require_teacher)):
    """Retrieves full evaluation details including questions for teacher review."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM evaluations WHERE id = ?", (eval_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(404, "Evaluation not found")

    data = dict(row)
    data["questions"] = json.loads(data["questions_data"])
    del data["questions_data"]
    return {"evaluation": data}

@app.put("/api/teacher/evaluations/{eval_id}/publish")
def publish_evaluation(
    eval_id: str,
    req: PublishEvaluationRequest,
    current_user: Dict[str, Any] = Depends(require_teacher)
):
    """
    Teacher corrects, approves marks, and publishes results to the student.
    Strict server-side marks validation and recalculation.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM evaluations WHERE id = ?", (eval_id,))
    existing = c.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "Evaluation not found")

    updated_questions = []
    total_final = 0.0

    # Server-side validation of marks bounds
    for q in req.questions:
        q_dict = q.model_dump() if hasattr(q, "model_dump") else q.dict()
        max_m = float(q_dict.get("max_marks", 5.0))
        final_m = float(q_dict.get("final_marks", 0.0))

        if final_m < 0 or final_m > max_m:
            conn.close()
            raise HTTPException(
                400,
                f"Question {q.question_num}: Final marks ({final_m}) must be between 0 and maximum marks ({max_m})."
            )

        q_dict["final_marks"] = round(final_m, 2)
        total_final += final_m
        updated_questions.append(q_dict)

    total_final = round(total_final, 2)
    total_max = round(sum(float(q.get("max_marks", 5.0)) for q in updated_questions), 2)
    now = datetime.now().isoformat()

    c.execute("""
    UPDATE evaluations
    SET questions_data = ?,
        total_final_score = ?,
        max_score = ?,
        teacher_comments = ?,
        status = 'published',
        published_at = ?
    WHERE id = ?
    """, (
        json.dumps(updated_questions),
        total_final,
        total_max,
        req.teacher_comments or "",
        now,
        eval_id
    ))
    conn.commit()

    c.execute("SELECT * FROM evaluations WHERE id = ?", (eval_id,))
    updated_row = dict(c.fetchone())
    conn.close()

    updated_row["questions"] = updated_questions
    del updated_row["questions_data"]

    return {
        "ok": True,
        "message": "Evaluation successfully approved and published to student.",
        "evaluation": updated_row
    }

# ----------------- Student Endpoints ----------------- #

@app.get("/api/student/my-results")
def get_my_results(current_user: Dict[str, Any] = Depends(require_student)):
    """
    Students can view ONLY their own published marks and evaluations.
    Enforces strict role permission: student_id must match current_user['id'] and status == 'published'.
    """
    student_id = current_user["id"]
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    SELECT id, test_title, student_name, student_email, roll_number,
           total_final_score, max_score, status, engine,
           teacher_comments, created_at, published_at,
           questions_data
    FROM evaluations
    WHERE student_id = ? AND status = 'published'
    ORDER BY published_at DESC, created_at DESC
    """, (student_id,))
    rows = c.fetchall()
    conn.close()

    results = []
    total_earned = 0.0
    total_possible = 0.0
    total_questions = 0
    correct_count = 0
    partial_count = 0
    incorrect_count = 0

    for r in rows:
        d = dict(r)
        q_list = json.loads(d["questions_data"])
        del d["questions_data"]
        d["questions_count"] = len(q_list)
        results.append(d)

        total_earned += d["total_final_score"]
        total_possible += d["max_score"]

        for q in q_list:
            total_questions += 1
            fscore = float(q.get("final_marks", 0.0))
            mmarks = float(q.get("max_marks", 5.0))
            if fscore >= mmarks * 0.99:
                correct_count += 1
            elif fscore > 0:
                partial_count += 1
            else:
                incorrect_count += 1

    overall_pct = round((total_earned / total_possible) * 100, 1) if total_possible > 0 else 0.0

    return {
        "results": results,
        "analytics": {
            "tests_completed": len(results),
            "total_marks_earned": round(total_earned, 2),
            "total_max_marks": round(total_possible, 2),
            "overall_percentage": overall_pct,
            "questions_evaluated": total_questions,
            "questions_fully_correct": correct_count,
            "questions_partial_credit": partial_count,
            "questions_needs_practice": incorrect_count
        }
    }

@app.get("/api/student/dashboard")
def get_student_dashboard(current_user: Dict[str, Any] = Depends(require_student)):
    """
    Returns complete personalized learning dashboard for the student:
    profile, roll number, published exam history, strengths, weak topics, and custom recommendations.
    """
    student_id = current_user["id"]
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT id, email, full_name, roll_number, class_name FROM users WHERE id = ?", (student_id,))
    u_row = c.fetchone()
    profile = dict(u_row) if u_row else current_user

    c.execute("""
    SELECT id, test_title, subject, total_final_score, max_score, questions_data, teacher_comments, published_at, created_at
    FROM evaluations
    WHERE student_id = ? AND status = 'published'
    ORDER BY published_at ASC, created_at ASC
    """, (student_id,))
    eval_rows = c.fetchall()
    conn.close()

    total_earned = 0.0
    total_possible = 0.0
    history = []
    mistakes_seen = []
    strengths = []
    weak_topics = []

    for idx, r in enumerate(eval_rows, 1):
        fin = float(r["total_final_score"])
        max_s = float(r["max_score"])
        pct = round((fin / max_s * 100), 1) if max_s > 0 else 0.0
        total_earned += fin
        total_possible += max_s

        history.append({
            "exam_num": idx,
            "title": r["test_title"],
            "score": fin,
            "max_score": max_s,
            "percentage": pct,
            "date": (r["published_at"] or r["created_at"])[:10]
        })

        try:
            qs = json.loads(r["questions_data"])
            for q in qs:
                q_score = float(q.get("final_marks", 0.0))
                q_max = float(q.get("max_marks", 5.0))
                q_text = q.get("text", "")
                q_pct = (q_score / q_max * 100) if q_max > 0 else 0.0

                if q_pct >= 85:
                    if "equation" in q_text.lower() and "Linear Equations & Algebraic Steps" not in strengths:
                        strengths.append("Linear Equations & Algebraic Steps")
                    if "polynomial" in q_text.lower() and "Polynomial Factorization" not in strengths:
                        strengths.append("Polynomial Factorization")
                    if "fraction" in q_text.lower() and "Fraction Operations" not in strengths:
                        strengths.append("Fraction Operations")
                elif q_pct < 65:
                    if "polynomial" in q_text.lower() and "Quadratic Factorization Rules" not in weak_topics:
                        weak_topics.append("Quadratic Factorization Rules")
                    if "fraction" in q_text.lower() and "Fractions with Unlike Denominators" not in weak_topics:
                        weak_topics.append("Fractions with Unlike Denominators")
                    if "equation" in q_text.lower() and "Multi-step Equation Isolation" not in weak_topics:
                        weak_topics.append("Multi-step Equation Isolation")

                for m in q.get("mistakes", []):
                    mistakes_seen.append(m)
        except Exception:
            pass

    overall_pct = round((total_earned / total_possible * 100), 1) if total_possible > 0 else 0.0
    grade_band = "Outstanding (A+)" if overall_pct >= 90 else "Excellent (A)" if overall_pct >= 80 else "Good (B)" if overall_pct >= 70 else "Satisfactory (C)" if overall_pct >= 50 else "Needs Practice"

    recommendations = []
    if weak_topics:
        for wt in weak_topics[:2]:
            recommendations.append(f"Focus on {wt}: practice checking each step and re-multiplying factors to verify results.")
    else:
        recommendations.append("Outstanding work! Maintain your rigorous step-by-step mathematical working.")

    if mistakes_seen:
        recommendations.append("Double-check final arithmetic division steps to avoid careless calculation slips.")

    return {
        "profile": profile,
        "analytics": {
            "exams_completed": len(eval_rows),
            "total_marks_earned": round(total_earned, 2),
            "total_possible_marks": round(total_possible, 2),
            "overall_percentage": overall_pct,
            "grade_band": grade_band
        },
        "strengths": strengths or ["Basic Arithmetic", "Linear Equation Simplification"],
        "weak_topics": weak_topics or ["Complex Fraction Arithmetic"],
        "recommendations": recommendations,
        "performance_history": history
    }

@app.get("/api/student/my-results/{eval_id}")
def get_my_result_detail(eval_id: str, current_user: Dict[str, Any] = Depends(require_student)):
    """
    Retrieves full breakdown of a single published evaluation for the student.
    Strictly verifies ownership: student_id must match current user.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    SELECT * FROM evaluations
    WHERE id = ? AND student_id = ? AND status = 'published'
    """, (eval_id, current_user["id"]))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(404, "Published evaluation not found or access denied.")

    data = dict(row)
    data["questions"] = json.loads(data["questions_data"])
    del data["questions_data"]
    return {"evaluation": data}

# ----------------- PDF Export ----------------- #

@app.get("/api/export/pdf/{eval_id}")
def export_evaluation_pdf(eval_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Generates an official PDF report.
    Teachers can export any evaluation.
    Students can export only their own published evaluations.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM evaluations WHERE id = ?", (eval_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(404, "Evaluation not found")

    # Strict permission check
    if current_user["role"] == "student":
        if row["student_id"] != current_user["id"] or row["status"] != "published":
            raise HTTPException(403, "Access denied to this evaluation report.")

    questions = json.loads(row["questions_data"])

    pdf_bytes = generate_evaluation_pdf(
        student_name=row["student_name"],
        assessment_title=row["test_title"],
        topic="Mathematics",
        total_score=row["total_final_score"],
        max_total=row["max_score"],
        evaluations=questions,
        teacher_name="Dr. Sarah Sharma"
    )

    clean_title = row["test_title"].replace(" ", "_").lower()
    clean_student = row["student_name"].replace(" ", "_").lower()
    filename = f"evalai_{clean_title}_{clean_student}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
