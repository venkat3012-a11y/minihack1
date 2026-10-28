import os
import io
import json
import uuid
import mimetypes
from typing import Dict, List, Optional, Any
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel, EmailStr

from database import (
    get_db, init_db, seed_db, reset_all_data,
    hash_password, verify_password
)
from auth import (
    create_access_token, get_current_user,
    require_teacher, require_student
)
from pdf_service import generate_evaluation_pdf
from gemini_service import (
    is_gemini_configured, get_gemini_config,
    evaluate_three_files
)

# Ensure storage directory exists
STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

# Initialize database on startup
init_db()
seed_db()

app = FastAPI(
    title="EvalAI Mathematics Evaluation System",
    description="Automated mathematics evaluation with Google GenAI SDK, SymPy symbolic validation, and teacher rubric review.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
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
    role: str # 'teacher' or 'student'

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
        "model": cfg.get("model", "gemini-2.5-flash"),
        "database": "SQLite WAL"
    }

@app.get("/api/config/status")
def config_status():
    cfg = get_gemini_config()
    return {
        "gemini_active": is_gemini_configured(),
        "model_name": cfg.get("model", "gemini-2.5-flash"),
        "sympy_active": True,
        "ocr_active": True,
        "subject": "Mathematics",
        "supported_formats": ["PDF", "JPG", "JPEG", "PNG"]
    }

@app.post("/api/demo/reset")
def reset_demo():
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
            "role": user["role"]
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

    user_id = "u-" + uuid.uuid4().hex[:8]
    now = datetime.now().isoformat()
    role = "student" if req.role != "teacher" else "teacher"

    c.execute("""
    INSERT INTO users (id, email, password_hash, full_name, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)""",
    (user_id, req.email.strip().lower(), hash_password(req.password), req.full_name.strip(), role, now))
    
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
            "role": role
        }
    }

@app.get("/api/auth/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": current_user}

# ----------------- File Storage & Previews ----------------- #

@app.get("/api/storage/{filename}")
def get_storage_file(filename: str):
    # Prevent directory traversal
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(STORAGE_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "File not found")
    
    mime_type, _ = mimetypes.guess_type(file_path)
    return FileResponse(file_path, media_type=mime_type or "application/octet-stream")

# ----------------- Teacher Endpoints ----------------- #

@app.get("/api/teacher/students")
def get_students(current_user: Dict[str, Any] = Depends(require_teacher)):
    """Returns list of students for selection during test evaluation."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, email, full_name, created_at FROM users WHERE role = 'student' ORDER BY full_name ASC")
    students = [dict(row) for row in c.fetchall()]
    conn.close()
    return {"students": students}

@app.post("/api/teacher/evaluate-three-files")
async def evaluate_three_files_endpoint(
    question_paper: UploadFile = File(..., description="Required Question Paper file"),
    answer_key: UploadFile = File(..., description="Required Teacher Answer Key file"),
    student_sheet: UploadFile = File(..., description="Required Student Written Test Paper file"),
    student_id: str = Form(..., description="Target Student ID"),
    test_title: str = Form("Mathematics Test", description="Assessment Title"),
    current_user: Dict[str, Any] = Depends(require_teacher)
):
    """
    Evaluates a mathematics submission using exactly the 3 required files:
    (1) Question Paper
    (2) Teacher Answer Key
    (3) Student Written Test Paper
    Supported formats: PDF, JPG, JPEG, PNG.
    """
    allowed_exts = {".pdf", ".jpg", ".jpeg", ".png"}

    # Validate that all 3 files are present
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
        
        ext = os.path.splitext(upload.filename)[1].lower()
        if ext not in allowed_exts:
            raise HTTPException(400, f"Unsupported file type '{ext}' for {label}. Allowed: PDF, JPG, JPEG, PNG")
        
        content = await upload.read()
        if len(content) == 0:
            raise HTTPException(400, f"{label} is empty (0 bytes)")
        if len(content) > 30 * 1024 * 1024:
            raise HTTPException(400, f"{label} exceeds 30MB limit")
        
        save_name = f"{uuid.uuid4().hex[:8]}_{upload.filename}"
        save_path = os.path.join(STORAGE_DIR, save_name)
        with open(save_path, "wb") as f:
            f.write(content)
        
        saved_paths[label] = save_path
        saved_filenames[label] = save_name

    # Validate student exists
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, full_name, email FROM users WHERE id = ? AND role = 'student'", (student_id,))
    student = c.fetchone()
    if not student:
        conn.close()
        raise HTTPException(404, f"Student with ID '{student_id}' not found.")

    student_name = student["full_name"]
    student_email = student["email"]

    # Run Evaluation via Gemini + SymPy
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
    
    # Ensure every question has final_marks initialized to proposed_marks
    for q in questions_list:
        if "final_marks" not in q:
            q["final_marks"] = q.get("proposed_marks", 0.0)

    total_proposed = float(eval_result.get("total_proposed_score", 0.0))
    total_final = sum(float(q.get("final_marks", 0.0)) for q in questions_list)
    max_score = float(eval_result.get("max_score", 0.0))
    engine_name = eval_result.get("engine", "Gemini + SymPy")

    c.execute("""
    INSERT INTO evaluations (
        id, test_title, student_id, student_name, student_email,
        question_paper_filename, answer_key_filename, student_sheet_filename,
        questions_data, total_proposed_score, total_final_score, max_score,
        status, engine, teacher_comments, created_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'evaluated', ?, '', ?, NULL)
    """, (
        eval_id, test_title, student_id, student_name, student_email,
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
    Once published, the student can view their marks and feedback.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM evaluations WHERE id = ?", (eval_id,))
    existing = c.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "Evaluation not found")

    # Convert Pydantic objects to dicts
    updated_questions = [q.model_dump() if hasattr(q, "model_dump") else q.dict() for q in req.questions]
    total_final = sum(float(q.get("final_marks", 0.0)) for q in updated_questions)
    now = datetime.now().isoformat()

    c.execute("""
    UPDATE evaluations
    SET questions_data = ?,
        total_final_score = ?,
        teacher_comments = ?,
        status = 'published',
        published_at = ?
    WHERE id = ?
    """, (
        json.dumps(updated_questions),
        total_final,
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
    Enforces role permission: student_id must match current_user['id'] and status == 'published'.
    """
    student_id = current_user["id"]
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    SELECT id, test_title, student_name, student_email,
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
            "total_marks_earned": total_earned,
            "total_max_marks": total_possible,
            "overall_percentage": overall_pct,
            "questions_evaluated": total_questions,
            "questions_fully_correct": correct_count,
            "questions_partial_credit": partial_count,
            "questions_needs_practice": incorrect_count
        }
    }

@app.get("/api/student/my-results/{eval_id}")
def get_my_result_detail(eval_id: str, current_user: Dict[str, Any] = Depends(require_student)):
    """
    Retrieves full breakdown of a single published evaluation for the student.
    Strictly verifies ownership: student_id must match current user.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM evaluations WHERE id = ? AND student_id = ? AND status = 'published'", (eval_id, current_user["id"]))
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
    Generates a PDF report.
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

    # Permission check
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
