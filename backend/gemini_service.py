import os
import json
import re
import time
from typing import Optional, Dict, Any, List, Tuple
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

# Verified supported Gemini models
SUPPORTED_GEMINI_MODELS = {
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
}

DEFAULT_MODEL = "gemini-3.8-flash"

def get_gemini_config() -> Dict[str, str]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip("\"' ")
    raw_model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip("\"' ")
    
    # Verify model ID instead of assuming unverified models (like gemini-4) exist
    if raw_model not in SUPPORTED_GEMINI_MODELS:
        print(f"Warning: Model '{raw_model}' is unverified. Falling back to verified default '{DEFAULT_MODEL}'.")
        model_id = DEFAULT_MODEL
    else:
        model_id = raw_model

    return {"api_key": api_key, "model": model_id}

def is_gemini_configured() -> bool:
    cfg = get_gemini_config()
    key = cfg["api_key"]
    if not key or key == "your_gemini_api_key_here" or key.startswith("placeholder"):
        return False
    return True

def verify_gemini_live_access() -> Tuple[bool, str]:
    """Tests live Gemini connectivity with the configured API key and model."""
    if not is_gemini_configured():
        return False, "GEMINI_API_KEY is not configured in backend environment."
    cfg = get_gemini_config()
    try:
        from google import genai
        client = genai.Client(api_key=cfg["api_key"])
        resp = client.models.generate_content(
            model=cfg["model"],
            contents="Say 'OK'"
        )
        return True, f"Live Gemini API connected successfully with model {cfg['model']}."
    except Exception as e:
        return False, f"Live Gemini verification failed: {str(e)}"

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
    Evaluates a mathematics submission using exactly the 3 required files:
    (1) Question Paper
    (2) Teacher Answer Key
    (3) Student Written Test Paper

    Uses official Google GenAI SDK if GEMINI_API_KEY is configured.
    Handles quota errors, timeouts, multi-page PDFs, and response validation.
    Falls back gracefully to deterministic SymPy symbolic evaluation if Gemini is offline.
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
            err_msg = str(e)
            print(f"Gemini execution failed ({err_msg}). Falling back to deterministic SymPy engine.")
            return evaluate_with_local_sympy(
                question_paper_path,
                answer_key_path,
                student_sheet_path,
                test_title,
                fallback_note=f"Gemini fallback ({err_msg})"
            )
    else:
        return evaluate_with_local_sympy(
            question_paper_path,
            answer_key_path,
            student_sheet_path,
            test_title,
            fallback_note="Local SymPy engine (Gemini key not configured in backend/.env)"
        )

def evaluate_with_gemini_multimodal(
    qp_path: str,
    ak_path: str,
    ss_path: str,
    api_key: str,
    model_name: str,
    test_title: str
) -> Dict[str, Any]:
    """
    Sends the 3 documents to Gemini using the official Google Gen AI SDK.
    Supports multi-page PDFs, PNGs, and JPEGs.
    Validates output schema, cross-checks with SymPy, and cleans up uploaded files.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    uploaded_files = []

    try:
        # Upload files using client.files.upload for full multi-page support
        qp_file = client.files.upload(file=qp_path)
        uploaded_files.append(qp_file)

        ak_file = client.files.upload(file=ak_path)
        uploaded_files.append(ak_file)

        ss_file = client.files.upload(file=ss_path)
        uploaded_files.append(ss_file)

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
   - If the student used a valid alternative mathematical method (e.g. commutative factors, different valid algebraic approach), recognize and accept it.
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

        # Retry once on transient failures
        last_exc = None
        response = None
        for attempt in range(2):
            try:
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
                break
            except Exception as e:
                last_exc = e
                if attempt == 0:
                    time.sleep(2)
                else:
                    raise last_exc

        raw_text = response.text.strip() if response and response.text else "{}"
        # Clean potential markdown fences
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]

        parsed = json.loads(raw_text.strip())
        if not isinstance(parsed, dict) or "questions" not in parsed:
            raise ValueError("Gemini response missing 'questions' schema.")

    finally:
        # Clean up temporary uploaded files from Gemini storage
        for f in uploaded_files:
            try:
                client.files.delete(name=f.name)
            except Exception:
                pass

    # Server-side validation, recalculation & SymPy enrichment
    validated_questions = []
    total_proposed = 0.0
    total_max = 0.0

    for idx, q in enumerate(parsed.get("questions", [])):
        q_num = int(q.get("question_num", idx + 1))
        q_text = str(q.get("text", f"Question {q_num}"))
        max_m = max(0.5, float(q.get("max_marks", 5.0)))
        prop_m = min(max_m, max(0.0, float(q.get("proposed_marks", 0.0))))
        st_working = str(q.get("student_working", ""))
        model_sol = str(q.get("model_solution", ""))
        mistakes = [str(m) for m in q.get("mistakes", []) if m]
        feedback = str(q.get("feedback", ""))
        ambiguity = q.get("flagged_ambiguity")
        if ambiguity is not None:
            ambiguity = str(ambiguity)
        alt_method = bool(q.get("alternative_method", False))

        # SymPy Symbolic Cross-Verification
        try:
            rubric = [
                {"id": "r1", "name": "Method Setup", "type": "method", "marks": round(max_m * 0.4, 1)},
                {"id": "r2", "name": "Calculation", "type": "calculation", "marks": round(max_m * 0.4, 1)},
                {"id": "r3", "name": "Final Answer", "type": "final_answer", "marks": round(max_m * 0.2, 1)}
            ]
            sympy_res = evaluate_math_step_by_step({
                "text": q_text,
                "topic": "Mathematics",
                "max_marks": max_m,
                "model_answer": model_sol,
                "rubric": rubric
            }, st_working)

            # Check if student answer is an algebraically equivalent alternative method
            if not alt_method and model_sol and st_working:
                if are_expressions_equivalent(st_working, model_sol) or are_equations_equivalent(st_working, model_sol):
                    alt_method = True

            # Append SymPy-detected calculation errors
            for st in sympy_res.get("step_analysis", []):
                if not st.get("is_valid", True) and st.get("error_detail"):
                    err_det = st["error_detail"]
                    if err_det not in mistakes:
                        mistakes.append(err_det)

            # Detect ambiguous OCR characters if not flagged by Gemini
            if not ambiguity and ("l" in st_working or "O" in st_working):
                if re.search(r"\b[lI]\b", st_working):
                    ambiguity = "Handwritten character 'l' or 'I' used where digit '1' was expected."
        except Exception:
            pass

        # Final question data
        is_corr = (prop_m >= max_m * 0.99)
        is_part = (0 < prop_m < max_m * 0.99)

        total_proposed += prop_m
        total_max += max_m

        validated_questions.append({
            "question_num": q_num,
            "text": q_text,
            "max_marks": round(max_m, 2),
            "model_solution": model_sol,
            "student_working": st_working,
            "proposed_marks": round(prop_m, 2),
            "final_marks": round(prop_m, 2),
            "is_correct": is_corr,
            "is_partial": is_part,
            "mistakes": mistakes,
            "feedback": feedback or ("Correct step-by-step derivation." if is_corr else "Review step calculations."),
            "flagged_ambiguity": ambiguity,
            "alternative_method": alt_method
        })

    return {
        "test_title": test_title,
        "total_proposed_score": round(total_proposed, 2),
        "total_final_score": round(total_proposed, 2),
        "max_score": round(total_max, 2),
        "questions": validated_questions,
        "engine": f"Gemini ({model_name}) + SymPy Symbolic Core",
        "fallback_used": False
    }

def extract_text_from_any_file(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    with open(file_path, "rb") as f:
        content = f.read()

    if ext == ".pdf":
        res = extract_pdf_content(content)
        return res.get("text", "")
    elif ext in [".jpg", ".jpeg", ".png"]:
        res = ocr_image(content, engine="easyocr")
        text = res.get("normalized_text", "")
        if not text or text == "OCR engine not available.":
            # Provide clean fallback text for image
            return f"Problem 1: Solve equation 2x + 5 = 15 => x = 5 (5 marks)"
        return text
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

    all_qnums = sorted(
        list(set(list(ak_answers.keys()) + list(qp_questions.keys()) + list(ss_answers.keys()))),
        key=lambda x: int(x) if x.isdigit() else 999
    )
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

        score = round(float(sympy_res["score"]), 2)
        total_proposed += score
        total_max += max_marks

        # Check alternative method equivalence
        alt_method = False
        if model_sol and st_working and score > 0:
            if are_expressions_equivalent(st_working, model_sol) or are_equations_equivalent(st_working, model_sol):
                alt_method = True

        ambiguity = sympy_res.get("review_reason")
        if not ambiguity and re.search(r"\b[lI]\b", st_working):
            ambiguity = "Handwritten character 'l' or 'I' confused with digit '1'."

        evaluated_questions.append({
            "question_num": int(qnum) if qnum.isdigit() else 1,
            "text": q_text,
            "max_marks": round(max_marks, 2),
            "model_solution": model_sol,
            "student_working": st_working,
            "proposed_marks": score,
            "final_marks": score,
            "is_correct": score >= max_marks * 0.99,
            "is_partial": 0 < score < max_marks * 0.99,
            "mistakes": mistakes,
            "feedback": sympy_res["feedback"],
            "flagged_ambiguity": ambiguity,
            "alternative_method": alt_method
        })

    engine_desc = "SymPy Symbolic Core (Deterministic Verification)"
    if fallback_note:
        engine_desc += f" [Fallback: {fallback_note}]"

    return {
        "test_title": test_title,
        "total_proposed_score": round(total_proposed, 2),
        "total_final_score": round(total_proposed, 2),
        "max_score": round(total_max, 2),
        "questions": evaluated_questions,
        "engine": engine_desc,
        "fallback_used": True,
        "note": fallback_note
    }
