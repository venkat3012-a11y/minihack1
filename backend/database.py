import sqlite3
import os
import re
import json
import hashlib
import binascii
from typing import Dict, List, Optional, Any
from datetime import datetime

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "evalai.db"))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    pwdhash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return binascii.hexlify(salt).decode("ascii") + "$" + binascii.hexlify(pwdhash).decode("ascii")

def verify_password(stored_password: str, provided_password: str) -> bool:
    try:
        salt_hex, hash_hex = stored_password.split("$")
        salt = binascii.unhexlify(salt_hex.encode("ascii"))
        pwdhash = hashlib.pbkdf2_hmac("sha256", provided_password.encode("utf-8"), salt, 100000)
        return binascii.hexlify(pwdhash).decode("ascii") == hash_hex
    except Exception:
        return False

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('teacher', 'student')),
        roll_number TEXT UNIQUE,
        class_name TEXT DEFAULT 'Grade 7',
        created_by TEXT,
        created_at TEXT NOT NULL
    )""")

    # Safe migration for users table if columns don't exist
    c.execute("PRAGMA table_info(users)")
    user_cols = [r["name"] for r in c.fetchall()]
    if "roll_number" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN roll_number TEXT")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_roll_number ON users(roll_number) WHERE roll_number IS NOT NULL")
    if "class_name" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN class_name TEXT DEFAULT 'Grade 7'")
    if "created_by" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN created_by TEXT")

    c.execute("""
    CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        test_title TEXT NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        student_email TEXT NOT NULL,
        roll_number TEXT,
        exam_id TEXT,
        subject TEXT DEFAULT 'Mathematics',
        class_name TEXT DEFAULT 'Grade 7',
        question_paper_filename TEXT,
        answer_key_filename TEXT,
        student_sheet_filename TEXT,
        questions_data TEXT NOT NULL,
        total_proposed_score REAL NOT NULL,
        total_final_score REAL NOT NULL,
        max_score REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('evaluated', 'published')),
        engine TEXT,
        teacher_comments TEXT,
        created_at TEXT NOT NULL,
        published_at TEXT,
        FOREIGN KEY (student_id) REFERENCES users(id)
    )""")

    # Safe migration for evaluations table
    c.execute("PRAGMA table_info(evaluations)")
    eval_cols = [r["name"] for r in c.fetchall()]
    if "roll_number" not in eval_cols:
        c.execute("ALTER TABLE evaluations ADD COLUMN roll_number TEXT")
    if "exam_id" not in eval_cols:
        c.execute("ALTER TABLE evaluations ADD COLUMN exam_id TEXT")
    if "subject" not in eval_cols:
        c.execute("ALTER TABLE evaluations ADD COLUMN subject TEXT DEFAULT 'Mathematics'")
    if "class_name" not in eval_cols:
        c.execute("ALTER TABLE evaluations ADD COLUMN class_name TEXT DEFAULT 'Grade 7'")

    # Exams table
    c.execute("""
    CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT 'Mathematics',
        class_name TEXT NOT NULL DEFAULT 'Grade 7',
        total_marks REAL NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        exam_date TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")

    # Exam questions table
    c.execute("""
    CREATE TABLE IF NOT EXISTS exam_questions (
        id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        question_num INTEGER NOT NULL,
        text TEXT NOT NULL,
        max_marks REAL NOT NULL,
        model_solution TEXT,
        rubric_criteria TEXT,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    )""")

    # Pending Sheets Queue (for OCR unreadable or ambiguous roll numbers)
    c.execute("""
    CREATE TABLE IF NOT EXISTS pending_sheets (
        id TEXT PRIMARY KEY,
        exam_id TEXT,
        original_filename TEXT NOT NULL,
        storage_filename TEXT NOT NULL,
        extracted_roll_number TEXT,
        ocr_confidence REAL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved', 'rejected')),
        error_reason TEXT,
        student_id TEXT,
        student_name TEXT,
        is_duplicate INTEGER DEFAULT 0,
        duplicate_reason TEXT,
        correction_history TEXT,
        created_at TEXT NOT NULL
    )""")

    # Safe migrations for pending_sheets table
    c.execute("PRAGMA table_info(pending_sheets)")
    ps_cols = [r["name"] for r in c.fetchall()]
    if "student_id" not in ps_cols:
        c.execute("ALTER TABLE pending_sheets ADD COLUMN student_id TEXT")
    if "student_name" not in ps_cols:
        c.execute("ALTER TABLE pending_sheets ADD COLUMN student_name TEXT")
    if "is_duplicate" not in ps_cols:
        c.execute("ALTER TABLE pending_sheets ADD COLUMN is_duplicate INTEGER DEFAULT 0")
    if "duplicate_reason" not in ps_cols:
        c.execute("ALTER TABLE pending_sheets ADD COLUMN duplicate_reason TEXT")
    if "correction_history" not in ps_cols:
        c.execute("ALTER TABLE pending_sheets ADD COLUMN correction_history TEXT")

    # Model Training / Improvement Examples (Teacher-verified ground truth)
    c.execute("""
    CREATE TABLE IF NOT EXISTS model_training_examples (
        id TEXT PRIMARY KEY,
        evaluation_id TEXT NOT NULL,
        question_num INTEGER NOT NULL,
        subject TEXT NOT NULL DEFAULT 'Mathematics',
        topic TEXT NOT NULL DEFAULT 'General Mathematics',
        question_text TEXT NOT NULL,
        model_solution TEXT NOT NULL,
        student_working TEXT NOT NULL,
        ai_proposed_marks REAL NOT NULL,
        teacher_final_marks REAL NOT NULL,
        max_marks REAL NOT NULL,
        teacher_correction TEXT,
        is_validated INTEGER NOT NULL DEFAULT 1,
        split TEXT NOT NULL DEFAULT 'train' CHECK(split IN ('train', 'val', 'test')),
        created_at TEXT NOT NULL
    )""")

    # Model Versions table
    c.execute("""
    CREATE TABLE IF NOT EXISTS model_versions (
        id TEXT PRIMARY KEY,
        version_tag TEXT UNIQUE NOT NULL,
        base_model TEXT NOT NULL,
        total_examples INTEGER NOT NULL DEFAULT 0,
        train_count INTEGER NOT NULL DEFAULT 0,
        val_count INTEGER NOT NULL DEFAULT 0,
        test_count INTEGER NOT NULL DEFAULT 0,
        benchmark_mae REAL NOT NULL DEFAULT 0.0,
        benchmark_accuracy REAL NOT NULL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL
    )""")

    # Audit Logs
    c.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL
    )""")

    conn.commit()
    conn.close()

def extract_numeric_roll(roll: Optional[str]) -> Optional[int]:
    """
    Extracts the numeric sequence from a roll number (e.g. '25ALR002' -> 2, '25ALR010' -> 10).
    Returns None if no numeric sequence is present.
    """
    if not roll or not str(roll).strip():
        return None
    cleaned = str(roll).strip().upper()
    m = re.search(r"ALR\s*[-_.]?\s*(\d+)", cleaned)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    digits = re.findall(r"\d+", cleaned)
    if digits:
        try:
            return int(digits[-1])
        except ValueError:
            pass
    return None

def roll_number_sort_key(roll: Optional[str]) -> Tuple[int, int, str]:
    """
    Natural numeric sort key for roll numbers.
    - Identifiable roll numbers (Category 0) sort strictly by numeric integer value (2 before 10).
    - Unidentifiable / missing roll numbers (Category 1) are placed after all identifiable ones.
    """
    num = extract_numeric_roll(roll)
    if num is not None:
        return (0, num, str(roll).strip().upper())
    return (1, 999999999, "")

def get_next_roll_number() -> str:
    """
    Generates the next available roll number in sequence: 25ALR001, 25ALR002, 25ALR003...
    Guarantees no duplicate roll number is ever assigned.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT roll_number FROM users WHERE roll_number LIKE '25ALR%'")
    rows = c.fetchall()
    conn.close()

    max_num = 0
    for r in rows:
        rn = r["roll_number"]
        if rn and len(rn) >= 8 and rn[:5] == "25ALR":
            try:
                num = int(rn[5:])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass

    return f"25ALR{max_num + 1:03d}"

def seed_db(force: bool = False):
    init_db()
    conn = get_db()
    c = conn.cursor()

    # Check if users already seeded
    if not force:
        c.execute("SELECT COUNT(*) as cnt FROM users")
        if c.fetchone()["cnt"] > 0:
            conn.close()
            return

    now = datetime.now().isoformat()

    # Teacher
    c.execute("""
    INSERT INTO users (id, email, password_hash, full_name, role, created_at)
    VALUES (?, ?, ?, ?, 'teacher', ?)""",
    ("t1", "teacher@evalai.edu", hash_password("teacher123"), "Dr. Sarah Sharma", now))

    # Students
    students = [
        ("s1", "aarav@evalai.edu", "student123", "Aarav Patel", "25ALR001", "Grade 7"),
        ("s2", "priya@evalai.edu", "student123", "Priya Singh", "25ALR002", "Grade 7"),
        ("s3", "rohan@evalai.edu", "student123", "Rohan Verma", "25ALR003", "Grade 7")
    ]
    for sid, semail, spass, sname, sroll, sclass in students:
        c.execute("""
        INSERT INTO users (id, email, password_hash, full_name, role, roll_number, class_name, created_at)
        VALUES (?, ?, ?, ?, 'student', ?, ?, ?)""",
        (sid, semail, hash_password(spass), sname, sroll, sclass, now))

    # Seed Sample Exam
    c.execute("""
    INSERT INTO exams (id, teacher_id, title, subject, class_name, total_marks, duration_minutes, exam_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
    ("exam-1", "t1", "Grade 7 Mathematics Mid-Term Assessment", "Mathematics", "Grade 7", 15.0, 45, now[:10], now))

    exam_qs = [
        ("eq-1", "exam-1", 1, "Solve the linear equation: 2x + 5 = 15. Show all algebraic steps.", 5.0,
         "2x + 5 = 15 => 2x = 10 => x = 5", "Step 1: Subtract 5 (2 marks). Step 2: Divide by 2 (3 marks)."),
        ("eq-2", "exam-1", 2, "Factorize the quadratic polynomial completely: x^2 + 5x + 6.", 5.0,
         "(x + 2)(x + 3)", "Step 1: Find factors of 6 adding to 5 (2 marks). Step 2: Write factored form (3 marks)."),
        ("eq-3", "exam-1", 3, "Evaluate the fraction expression: 3/4 - 5/6.", 5.0,
         "9/12 - 10/12 = -1/12", "Step 1: Common denominator 12 (2 marks). Step 2: Subtract numerators (3 marks).")
    ]
    for eq_id, ex_id, q_num, q_txt, q_max, q_mod, q_rub in exam_qs:
        c.execute("""
        INSERT INTO exam_questions (id, exam_id, question_num, text, max_marks, model_solution, rubric_criteria)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (eq_id, ex_id, q_num, q_txt, q_max, q_mod, q_rub))

    # Sample Published Evaluation for Aarav Patel (15/15)
    sample_aarav_questions = [
        {
            "question_num": 1,
            "text": "Solve the linear equation: 2x + 5 = 15. Show all algebraic steps.",
            "max_marks": 5.0,
            "model_solution": "2x + 5 = 15 => 2x = 10 => x = 5",
            "student_working": "2x + 5 = 15\n2x = 10\nx = 5",
            "proposed_marks": 5.0,
            "final_marks": 5.0,
            "is_correct": True,
            "is_partial": False,
            "mistakes": [],
            "feedback": "Perfect algebraic derivation and solution.",
            "flagged_ambiguity": None,
            "alternative_method": False
        },
        {
            "question_num": 2,
            "text": "Factorize the quadratic polynomial completely: x^2 + 5x + 6.",
            "max_marks": 5.0,
            "model_solution": "(x + 2)(x + 3)",
            "student_working": "Factors of 6 adding to 5 are 2 and 3\n(x + 2)(x + 3)",
            "proposed_marks": 5.0,
            "final_marks": 5.0,
            "is_correct": True,
            "is_partial": False,
            "mistakes": [],
            "feedback": "Correct factors identified and written in complete factored form.",
            "flagged_ambiguity": None,
            "alternative_method": False
        },
        {
            "question_num": 3,
            "text": "Evaluate the fraction expression: 3/4 - 5/6.",
            "max_marks": 5.0,
            "model_solution": "9/12 - 10/12 = -1/12",
            "student_working": "3/4 - 5/6 = 9/12 - 10/12 = -1/12",
            "proposed_marks": 5.0,
            "final_marks": 5.0,
            "is_correct": True,
            "is_partial": False,
            "mistakes": [],
            "feedback": "Accurate common denominator and subtraction with negative result.",
            "flagged_ambiguity": None,
            "alternative_method": False
        }
    ]

    c.execute("""
    INSERT INTO evaluations (id, test_title, student_id, student_name, student_email, roll_number, exam_id, question_paper_filename, answer_key_filename, student_sheet_filename, questions_data, total_proposed_score, total_final_score, max_score, status, engine, teacher_comments, created_at, published_at)
    VALUES (?, ?, ?, ?, ?, '25ALR001', 'exam-1', ?, ?, ?, ?, ?, ?, ?, 'published', 'SymPy + Gemini Mathematical Core', 'Excellent comprehensive working across all questions.', ?, ?)""",
    ("eval-1", "Linear Equations & Polynomial Algebra Test", "s1", "Aarav Patel", "aarav@evalai.edu",
     "Sample_Question_Paper.pdf", "Sample_Teacher_Key.pdf", "Aarav_Student_Test.pdf",
     json.dumps(sample_aarav_questions), 15.0, 15.0, 15.0, now, now))

    # Sample Published Evaluation for Priya Singh (10/15 - Partial Credit)
    sample_priya_questions = [
        {
            "question_num": 1,
            "text": "Solve the linear equation: 2x + 5 = 15. Show all algebraic steps.",
            "max_marks": 5.0,
            "model_solution": "2x + 5 = 15 => 2x = 10 => x = 5",
            "student_working": "2x + 5 = 15\n2x = 10\nx = 10 / 2 = 4",
            "proposed_marks": 4.0,
            "final_marks": 4.0,
            "is_correct": False,
            "is_partial": True,
            "mistakes": ["Arithmetic slip on final line: 10 / 2 = 5, but wrote 4."],
            "feedback": "Method and steps are completely correct (4/5 marks). Check final arithmetic division.",
            "flagged_ambiguity": None,
            "alternative_method": False
        },
        {
            "question_num": 2,
            "text": "Factorize the quadratic polynomial completely: x^2 + 5x + 6.",
            "max_marks": 5.0,
            "model_solution": "(x + 2)(x + 3)",
            "student_working": "(x + 1)(x + 6)",
            "proposed_marks": 1.0,
            "final_marks": 1.0,
            "is_correct": False,
            "is_partial": True,
            "mistakes": ["(x+1)(x+6) expands to x^2 + 7x + 6, not x^2 + 5x + 6."],
            "feedback": "Look for numbers that multiply to 6 AND add to 5 (2 and 3).",
            "flagged_ambiguity": None,
            "alternative_method": False
        },
        {
            "question_num": 3,
            "text": "Evaluate the fraction expression: 3/4 - 5/6.",
            "max_marks": 5.0,
            "model_solution": "9/12 - 10/12 = -1/12",
            "student_working": "9/12 - 10/12 = -1/12",
            "proposed_marks": 5.0,
            "final_marks": 5.0,
            "is_correct": True,
            "is_partial": False,
            "mistakes": [],
            "feedback": "Great work on negative fractions.",
            "flagged_ambiguity": None,
            "alternative_method": False
        }
    ]

    c.execute("""
    INSERT INTO evaluations (id, test_title, student_id, student_name, student_email, roll_number, exam_id, question_paper_filename, answer_key_filename, student_sheet_filename, questions_data, total_proposed_score, total_final_score, max_score, status, engine, teacher_comments, created_at, published_at)
    VALUES (?, ?, ?, ?, ?, '25ALR002', 'exam-1', ?, ?, ?, ?, ?, ?, ?, 'published', 'SymPy + Gemini Mathematical Core', 'Solid algebraic foundation. Review quadratic factorization rules.', ?, ?)""",
    ("eval-2", "Linear Equations & Polynomial Algebra Test", "s2", "Priya Singh", "priya@evalai.edu",
     "Sample_Question_Paper.pdf", "Sample_Teacher_Key.pdf", "Priya_Student_Test.pdf",
     json.dumps(sample_priya_questions), 10.0, 10.0, 15.0, now, now))

    # Sample Pending Review for Rohan Verma (Flagged Ambiguity)
    sample_rohan_questions = [
        {
            "question_num": 1,
            "text": "Solve the linear equation: 2x + 5 = 15. Show all algebraic steps.",
            "max_marks": 5.0,
            "model_solution": "2x + 5 = 15 => 2x = 10 => x = 5",
            "student_working": "2x + 5 = 15\n2x = 10\nx = l0/2 = 5",
            "proposed_marks": 5.0,
            "final_marks": 5.0,
            "is_correct": True,
            "is_partial": False,
            "mistakes": [],
            "feedback": "Correct solution. Check handwriting for digit 1.",
            "flagged_ambiguity": "Unclear handwritten character 'l' in place of digit '1' in '10/2'.",
            "alternative_method": False
        },
        {
            "question_num": 2,
            "text": "Factorize the quadratic polynomial completely: x^2 + 5x + 6.",
            "max_marks": 5.0,
            "model_solution": "(x + 2)(x + 3)",
            "student_working": "(x + 3)(x + 2)",
            "proposed_marks": 5.0,
            "final_marks": 5.0,
            "is_correct": True,
            "is_partial": False,
            "mistakes": [],
            "feedback": "Correct commutative factored form.",
            "flagged_ambiguity": None,
            "alternative_method": True
        }
    ]

    c.execute("""
    INSERT INTO evaluations (id, test_title, student_id, student_name, student_email, roll_number, question_paper_filename, answer_key_filename, student_sheet_filename, questions_data, total_proposed_score, total_final_score, max_score, status, engine, teacher_comments, created_at, published_at)
    VALUES (?, ?, ?, ?, ?, '25ALR003', ?, ?, ?, ?, ?, ?, ?, 'evaluated', 'SymPy + Gemini Mathematical Core', '', ?, NULL)""",
    ("eval-3", "Quadratic Equations Diagnostic Test", "s3", "Rohan Verma", "rohan@evalai.edu",
     "Quadratic_Exam.pdf", "Quadratic_Key.pdf", "Rohan_Handwritten.png",
     json.dumps(sample_rohan_questions), 10.0, 10.0, 10.0, now))

    # Seed Initial Model Version & Training Examples Pipeline
    c.execute("""
    INSERT OR REPLACE INTO model_versions (id, version_tag, base_model, total_examples, train_count, val_count, test_count, benchmark_mae, benchmark_accuracy, status, notes, created_at)
    VALUES ('mv-1', 'v1.0.0-baseline', 'gemini-3.5-flash', 6, 4, 1, 1, 0.25, 94.2, 'active', 'Initial validated exemplar memory seeded from teacher-approved Grade 7 assessments.', ?)
    """, (now,))

    # Seed validated training exemplars from Aarav & Priya evaluations
    exemplars = [
        ("mte-1", "eval-1", 1, "Mathematics", "Linear Equations",
         "Solve the linear equation: 2x + 5 = 15. Show all algebraic steps.",
         "2x + 5 = 15 => 2x = 10 => x = 5",
         "2x + 5 = 15\n2x = 10\nx = 5",
         5.0, 5.0, 5.0, "Full marks awarded for rigorous step-by-step derivation.", 1, "train", now),
        ("mte-2", "eval-1", 2, "Mathematics", "Polynomial Factorization",
         "Factorize the quadratic polynomial completely: x^2 + 5x + 6.",
         "(x + 2)(x + 3)",
         "Factors of 6 adding to 5 are 2 and 3\n(x + 2)(x + 3)",
         5.0, 5.0, 5.0, "Correct factors identified and written in complete factored form.", 1, "train", now),
        ("mte-3", "eval-1", 3, "Mathematics", "Fraction Arithmetic",
         "Evaluate the fraction expression: 3/4 - 5/6.",
         "9/12 - 10/12 = -1/12",
         "3/4 - 5/6 = 9/12 - 10/12 = -1/12",
         5.0, 5.0, 5.0, "Accurate common denominator and subtraction with negative result.", 1, "val", now),
        ("mte-4", "eval-2", 1, "Mathematics", "Linear Equations",
         "Solve the linear equation: 2x + 5 = 15. Show all algebraic steps.",
         "2x + 5 = 15 => 2x = 10 => x = 5",
         "2x + 5 = 15\n2x = 10\nx = 10 / 2 = 4",
         4.0, 4.0, 5.0, "Awarded 4/5 step marks for correct algebraic isolation; 1 mark deducted for arithmetic slip (10/2=4).", 1, "train", now),
        ("mte-5", "eval-2", 2, "Mathematics", "Polynomial Factorization",
         "Factorize the quadratic polynomial completely: x^2 + 5x + 6.",
         "(x + 2)(x + 3)",
         "(x + 1)(x + 6)",
         1.0, 1.0, 5.0, "Awarded 1/5 partial credit for attempted binomial factorization. Expansion check failed.", 1, "train", now),
        ("mte-6", "eval-2", 3, "Mathematics", "Fraction Arithmetic",
         "Evaluate the fraction expression: 3/4 - 5/6.",
         "9/12 - 10/12 = -1/12",
         "9/12 - 10/12 = -1/12",
         5.0, 5.0, 5.0, "Correct answer and valid simplification.", 1, "test", now)
    ]
    for ex in exemplars:
        c.execute("""
        INSERT OR REPLACE INTO model_training_examples (
            id, evaluation_id, question_num, subject, topic, question_text,
            model_solution, student_working, ai_proposed_marks, teacher_final_marks,
            max_marks, teacher_correction, is_validated, split, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", ex)

    conn.commit()
    conn.close()

def reset_all_data():
    conn = get_db()
    c = conn.cursor()
    # Drop all legacy and new tables
    tables = [
        "evaluations", "users", "exams", "exam_questions",
        "pending_sheets", "model_training_examples", "model_versions",
        "audit_logs", "submissions", "assessments", "questions",
        "criteria", "practice_problems", "classes", "question_bank"
    ]
    for t in tables:
        c.execute(f"DROP TABLE IF EXISTS {t}")
    conn.commit()
    conn.close()
    init_db()
    seed_db(force=True)
