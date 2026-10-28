import sqlite3
import os
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
        created_at TEXT NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        test_title TEXT NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        student_email TEXT NOT NULL,
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

    conn.commit()
    conn.close()

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
        ("s1", "aarav@evalai.edu", "student123", "Aarav Patel"),
        ("s2", "priya@evalai.edu", "student123", "Priya Singh"),
        ("s3", "rohan@evalai.edu", "student123", "Rohan Verma")
    ]
    for sid, semail, spass, sname in students:
        c.execute("""
        INSERT INTO users (id, email, password_hash, full_name, role, created_at)
        VALUES (?, ?, ?, ?, 'student', ?)""",
        (sid, semail, hash_password(spass), sname, now))

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
    INSERT INTO evaluations (id, test_title, student_id, student_name, student_email, question_paper_filename, answer_key_filename, student_sheet_filename, questions_data, total_proposed_score, total_final_score, max_score, status, engine, teacher_comments, created_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'SymPy + Gemini Mathematical Core', 'Excellent comprehensive working across all questions.', ?, ?)""",
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
    INSERT INTO evaluations (id, test_title, student_id, student_name, student_email, question_paper_filename, answer_key_filename, student_sheet_filename, questions_data, total_proposed_score, total_final_score, max_score, status, engine, teacher_comments, created_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'SymPy + Gemini Mathematical Core', 'Solid algebraic foundation. Review quadratic factorization rules.', ?, ?)""",
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
    INSERT INTO evaluations (id, test_title, student_id, student_name, student_email, question_paper_filename, answer_key_filename, student_sheet_filename, questions_data, total_proposed_score, total_final_score, max_score, status, engine, teacher_comments, created_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'evaluated', 'SymPy + Gemini Mathematical Core', '', ?, NULL)""",
    ("eval-3", "Quadratic Equations Diagnostic Test", "s3", "Rohan Verma", "rohan@evalai.edu",
     "Quadratic_Exam.pdf", "Quadratic_Key.pdf", "Rohan_Handwritten.png",
     json.dumps(sample_rohan_questions), 10.0, 10.0, 10.0, now))

    conn.commit()
    conn.close()

def reset_all_data():
    conn = get_db()
    c = conn.cursor()
    # Drop all legacy and new tables
    tables = ["evaluations", "users", "submissions", "assessments", "questions", "criteria", "practice_problems", "classes"]
    for t in tables:
        c.execute(f"DROP TABLE IF EXISTS {t}")
    conn.commit()
    conn.close()
    init_db()
    seed_db(force=True)
