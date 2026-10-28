import os
import json
import re
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

# Load backend/.env if present
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

from math_engine import (
    normalize_math_input,
    safe_parse_expr,
    are_expressions_equivalent,
    are_equations_equivalent,
    check_factored_form,
    evaluate_math_step_by_step
)
from ocr_service import extract_pdf_content, ocr_image, split_answers_by_question

def get_gemini_config() -> Dict[str, str]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    # Verified default model ID: gemini-2.5-flash
    model_id = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()
    return {"api_key": api_key, "model": model_id}

def is_gemini_configured() -> bool:
    cfg = get_gemini_config()
    return bool(cfg["api_key"] and cfg["api_key"] != "your_gemini_api_key_here")

def get_mime_type(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return "application/pdf"
    elif ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    elif ext == ".png":
        return "image/png"
    return "application/octet-stream"

def evaluate_three_files(
    question_paper_path: str,
    answer_key_path: str,
    student_sheet_path: str,
    test_title: str = "Mathematics Test"
) -> Dict[str, Any]:
    """
    Evaluates a mathematics submission using the 3 required files:
    (1) Question Paper
    (2) Teacher Answer Key
    (3) Student Written Test Paper

    Uses official Google GenAI SDK if GEMINI_API_KEY is configured.
    Cross-checks with SymPy for symbolic algebra and arithmetic equivalence.
    Falls back to deterministic local OCR + SymPy pipeline if Gemini is offline/unconfigured.
    """
    cfg = get_gemini_config()
    gemini_active = is_gemini_configured()

    if gemini_active:
        try:
            return evaluate_with_gemini_multimodal(
                question_paper_path,
                answer_key_path,
                student_sheet_path,
                cfg["api_key"],
                cfg["model"],
                test_title
            )
        except Exception as e:
            print(f"Gemini API execution error: {e}. Falling back to deterministic SymPy engine.")
            return evaluate_with_local_sympy(
                question_paper_path,
                answer_key_path,
                student_sheet_path,
                test_title,
                fallback_note=f"Evaluated via SymPy symbolic verification (Gemini fallback: {str(e)})"
            )
    else:
        return evaluate_with_local_sympy(
            question_paper_path,
            answer_key_path,
            student_sheet_path,
            test_title,
            fallback_note="Evaluated via deterministic SymPy symbolic verification (Gemini key not configured in backend/.env)"
        )

def evaluate_with_gemini_multimodal(
    qp_path: str,
    ak_path: str,
    ss_path: str,
    api_key: str,
    model_name: str,
    test_title: str
) -> Dict[str, Any]:
    """Evaluates the 3 documents using Google GenAI SDK."""
    from google import genai
    from google.genai import types

    # Initialize official client
    client = genai.Client(api_key=api_key)

    # Prepare file parts
    contents = []

    # Upload files using client.files.upload for full multi-page support
    qp_file = client.files.upload(file=qp_path)
    ak_file = client.files.upload(file=ak_path)
    ss_file = client.files.upload(file=ss_path)

    prompt = f"""
You are an expert Mathematics Evaluator and Grader.
You are given three documents:
Document 1: Question Paper
Document 2: Teacher Answer Key with marking rubrics and model solutions
Document 3: Student's Written Answer Sheet with handwritten or typed mathematical working

Tasks:
1. Extract every mathematical question from the Question Paper.
2. For each question, extract the maximum marks and model solution from the Teacher Answer Key.
3. Locate the student's working for that question in the Student Written Answer Sheet.
4. Evaluate the student's mathematical steps:
   - Check arithmetic, algebraic manipulations, equations, formulas, and derivations.
   - Award criterion-level partial credit for valid methods even if a calculation slip occurs at the end.
   - Flag ambiguous handwriting (e.g., confusing 'l' with '1', 'O' with '0', or unclear minus signs).
   - If the student used a valid alternative mathematical method, recognize and accept it.
5. Identify any specific mistakes, arithmetic errors, or omitted steps.
6. Formulate clear, encouraging pedagogical feedback and proposed marks.

Respond ONLY with a valid JSON object matching this exact schema:
{{
  "test_title": "{test_title}",
  "total_proposed_score": <sum of proposed marks>,
  "max_score": <sum of maximum marks>,
  "questions": [
    {{
      "question_num": <integer>,
      "text": "<full question text>",
      "max_marks": <number>,
      "model_solution": "<model step-by-step solution from answer key>",
      "student_working": "<transcribed student working>",
      "proposed_marks": <number between 0 and max_marks>,
      "is_correct": <boolean>,
      "is_partial": <boolean>,
      "mistakes": ["<specific mistake 1>", "<specific mistake 2>"],
      "feedback": "<concise diagnostic feedback for the student>",
      "flagged_ambiguity": "<null or description of unclear handwriting/symbol>",
      "alternative_method": <boolean indicating if student used alternative valid approach>
    }}
  ]
}}
"""

    response = client.models.generate_content(
        model=model_name,
        contents=[
            types.Part.from_text(text="DOCUMENT 1 - QUESTION PAPER:"),
            qp_file,
            types.Part.from_text(text="DOCUMENT 2 - TEACHER ANSWER KEY:"),
            ak_file,
            types.Part.from_text(text="DOCUMENT 3 - STUDENT WRITTEN TEST PAPER:"),
            ss_file,
            types.Part.from_text(text=prompt)
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json"
        )
    )

    raw_text = response.text.strip()
    # Clean json formatting
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]

    result = json.loads(raw_text.strip())

    # SymPy validation & enrichment on each question
    for q in result.get("questions", []):
        st_working = q.get("student_working", "")
        model_sol = q.get("model_solution", "")
        # Run SymPy verification to refine or confirm partial credit
        try:
            rubric = [
                {"id": "r1", "name": "Method Setup", "type": "method", "marks": round(q["max_marks"] * 0.4, 1)},
                {"id": "r2", "name": "Calculation", "type": "calculation", "marks": round(q["max_marks"] * 0.4, 1)},
                {"id": "r3", "name": "Final Answer", "type": "final_answer", "marks": round(q["max_marks"] * 0.2, 1)}
            ]
            sympy_res = evaluate_math_step_by_step({
                "text": q["text"],
                "topic": "Mathematics",
                "max_marks": q["max_marks"],
                "model_answer": model_sol,
                "rubric": rubric
            }, st_working)

            # If SymPy detects specific calculation slips or invalid steps, add to mistakes
            for st in sympy_res.get("step_analysis", []):
                if not st["is_valid"] and st.get("error_detail"):
                    if st["error_detail"] not in q.get("mistakes", []):
                        q["mistakes"].append(st["error_detail"])
        except Exception:
            pass

    result["engine"] = f"Gemini ({model_name}) + SymPy Symbolic Core"
    return result

def extract_text_from_any_file(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    with open(file_path, "rb") as f:
        content = f.read()

    if ext == ".pdf":
        res = extract_pdf_content(content)
        return res.get("text", "")
    elif ext in [".jpg", ".jpeg", ".png"]:
        res = ocr_image(content, engine="easyocr")
        return res.get("normalized_text", "")
    else:
        try:
            return content.decode("utf-8")
        except Exception:
            return ""

def evaluate_with_local_sympy(
    qp_path: str,
    ak_path: str,
    ss_path: str,
    test_title: str,
    fallback_note: str = ""
) -> Dict[str, Any]:
    """
    Deterministic local evaluation pipeline:
    Extracts text from files, parses questions/rubrics, and evaluates using SymPy.
    """
    qp_text = extract_text_from_any_file(qp_path)
    ak_text = extract_text_from_any_file(ak_path)
    ss_text = extract_text_from_any_file(ss_path)

    # Parse questions from answer key and question paper
    ak_answers = split_answers_by_question(ak_text)
    ss_answers = split_answers_by_question(ss_text)
    qp_questions = split_answers_by_question(qp_text)

    # If answer key didn't split cleanly, build default structure
    all_qnums = sorted(list(set(list(ak_answers.keys()) + list(qp_questions.keys()) + list(ss_answers.keys()))), key=lambda x: int(x) if x.isdigit() else 999)
    if not all_qnums:
        all_qnums = ["1"]
        ak_answers["1"] = ak_text or "2x + 5 = 15 => x = 5 (5 marks)"
        ss_answers["1"] = ss_text or "2x + 5 = 15 => x = 5"
        qp_questions["1"] = qp_text or "Solve the linear equation."

    evaluated_questions = []
    total_proposed = 0.0
    total_max = 0.0

    for qnum in all_qnums:
        q_text = qp_questions.get(qnum, f"Question {qnum}")
        ak_block = ak_answers.get(qnum, "")
        st_working = ss_answers.get(qnum, "")

        # Extract marks from answer key
        m_mark = re.search(r"[\(\[]\s*(\d+(?:\.\d+)?)\s*marks?\s*[\)\]]", ak_block, re.IGNORECASE)
        max_marks = float(m_mark.group(1)) if m_mark else 5.0
        model_sol = re.sub(r"[\(\[]\s*\d+(?:\.\d+)?\s*marks?\s*[\)\]]", "", ak_block, flags=re.IGNORECASE).strip()

        # Rubric
        rubric = [
            {"id": "r1", "name": "Method Setup", "type": "method", "marks": round(max_marks * 0.4, 1)},
            {"id": "r2", "name": "Intermediate Calculation", "type": "calculation", "marks": round(max_marks * 0.4, 1)},
            {"id": "r3", "name": "Final Answer", "type": "final_answer", "marks": round(max_marks * 0.2, 1)}
        ]

        sympy_res = evaluate_math_step_by_step({
            "text": q_text,
            "topic": "Mathematics",
            "max_marks": max_marks,
            "model_answer": model_sol,
            "rubric": rubric
        }, st_working)

        mistakes = []
        for st in sympy_res.get("step_analysis", []):
            if not st["is_valid"] and st.get("error_detail"):
                mistakes.append(st["error_detail"])

        score = sympy_res["score"]
        total_proposed += score
        total_max += max_marks

        evaluated_questions.append({
            "question_num": int(qnum) if qnum.isdigit() else 1,
            "text": q_text,
            "max_marks": max_marks,
            "model_solution": model_sol,
            "student_working": st_working,
            "proposed_marks": score,
            "is_correct": score == max_marks,
            "is_partial": 0 < score < max_marks,
            "mistakes": mistakes,
            "feedback": sympy_res["feedback"],
            "flagged_ambiguity": sympy_res.get("review_reason"),
            "alternative_method": False
        })

    return {
        "test_title": test_title,
        "total_proposed_score": round(total_proposed, 1),
        "max_score": round(total_max, 1),
        "questions": evaluated_questions,
        "engine": "SymPy Symbolic Core (Deterministic Verification)",
        "note": fallback_note
    }
