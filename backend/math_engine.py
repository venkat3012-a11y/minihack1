import re
import math
from typing import Dict, List, Tuple, Optional, Any
import sympy
from sympy import (
    Symbol, symbols, sympify, simplify, factor, expand, Eq, solve,
    Rational, Integer, Float, Number, Mul, Add, Pow, sqrt
)
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor
)

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application, convert_xor)

def normalize_math_input(text: str) -> str:
    """
    Normalizes handwritten or OCR math text, resolving common OCR symbol confusions
    (e.g., 'x' vs '*', 'l'/'I' vs '1', 'O' vs '0', fractions, powers, and unicode operators).
    """
    if not text:
        return ""
    
    t = text.strip()
    
    # 1. Unicode replacements
    replacements = {
        "×": "*",
        "÷": "/",
        "−": "-",
        "—": "-",
        "–": "-",
        "·": "*",
        "•": "*",
        "²": "^2",
        "³": "^3",
        "⁴": "^4",
        "½": "1/2",
        "¼": "1/4",
        "¾": "3/4",
        "√": "sqrt",
        "≠": "!=",
        "≤": "<=",
        "≥": ">=",
        "\\implies": "=>",
        "\\to": "=>",
        "->": "=>",
    }
    for k, v in replacements.items():
        t = t.replace(k, v)

    # 2. LaTeX fraction normalization: \frac{a}{b} -> ((a)/(b))
    t = re.sub(r"\\frac\s*\{([^}]+)\}\s*\{([^}]+)\}", r"((\1)/(\2))", t)
    t = re.sub(r"\\dfrac\s*\{([^}]+)\}\s*\{([^}]+)\}", r"((\1)/(\2))", t)
    t = re.sub(r"\\sqrt\s*\{([^}]+)\}", r"sqrt(\1)", t)

    # 3. Standalone OCR confusion repairs:
    # A standalone 'l' or 'I' or '|' (not part of an English word like 'let') is the digit '1'
    t = re.sub(r"(?<![a-zA-Z])[lI|](?![a-zA-Z])", "1", t)

    # 'O' or 'o' confused with '0' inside numbers (e.g., "1O" -> "10", "2O2" -> "202")
    t = re.sub(r"(?<=\d)[oO](?=\d|\b)", "0", t)
    t = re.sub(r"(?<=[+\-*/=])[oO](?=\d|\b)", "0", t)

    # Contextual 'x': '4 x 5' (arithmetic multiplication) vs '4x' (variable)
    t = re.sub(r"(\d+)\s+[xX]\s+(\d+)", r"\1 * \2", t)

    # Clean double spaces
    t = re.sub(r"[ \t]+", " ", t)
    return t

def safe_parse_expr(expr_str: str) -> Optional[Any]:
    """Safely parse expression using SymPy with implicit multiplication."""
    s = normalize_math_input(expr_str).replace("^", "**")
    # Clean leading/trailing syntax
    s = re.sub(r"^[=>\s]+", "", s)
    if not s:
        return None
    try:
        return parse_expr(s, transformations=TRANSFORMATIONS, evaluate=True)
    except Exception:
        try:
            return sympify(s)
        except Exception:
            return None

def parse_equation_or_expr(line: str) -> Tuple[Optional[Any], str]:
    """
    Parses a string into either a SymPy Equation (if contains '=' and not '=>') or Expression.
    Returns (parsed_object, type: 'eq' | 'expr' | 'unknown').
    """
    line = normalize_math_input(line)
    if "=>" in line:
        parts = line.split("=>")
        line = parts[-1].strip()

    if "=" in line and not line.startswith("="):
        eq_parts = line.split("=")
        if len(eq_parts) == 2:
            lhs_str, rhs_str = eq_parts[0].strip(), eq_parts[1].strip()
            lhs = safe_parse_expr(lhs_str)
            rhs = safe_parse_expr(rhs_str)
            if lhs is not None and rhs is not None:
                return Eq(lhs, rhs), "eq"

    expr = safe_parse_expr(line)
    if expr is not None:
        return expr, "expr"

    return None, "unknown"

def are_expressions_equivalent(expr1_str: str, expr2_str: str) -> bool:
    """Check algebraic equivalence of two expressions."""
    e1 = safe_parse_expr(expr1_str)
    e2 = safe_parse_expr(expr2_str)
    if e1 is None or e2 is None:
        return False
    try:
        diff = simplify(e1 - e2)
        return diff == 0
    except Exception:
        return False

def are_equations_equivalent(eq1_str: str, eq2_str: str, var_name: str = "x") -> bool:
    """Check if two equations have identical solution sets."""
    obj1, t1 = parse_equation_or_expr(eq1_str)
    obj2, t2 = parse_equation_or_expr(eq2_str)
    
    var = Symbol(var_name)
    try:
        sol1 = solve(obj1, var) if t1 == "eq" else solve(Eq(obj1, 0), var)
        sol2 = solve(obj2, var) if t2 == "eq" else solve(Eq(obj2, 0), var)
        if sol1 is not None and sol2 is not None:
            set1 = {simplify(s) for s in sol1}
            set2 = {simplify(s) for s in sol2}
            return set1 == set2
    except Exception:
        pass
    return False

def check_factored_form(student_str: str, expanded_target_str: str) -> Tuple[bool, bool, str]:
    """
    Verifies if student answer is:
    1. Algebraically equivalent to target.
    2. Written in factored form (e.g. (x+2)(x+3)).
    """
    s_expr = safe_parse_expr(student_str)
    t_expr = safe_parse_expr(expanded_target_str)
    if s_expr is None or t_expr is None:
        return False, False, "Could not parse expression."
    
    try:
        equiv = simplify(s_expr - t_expr) == 0
        if not equiv:
            return False, False, "Expression is not algebraically equivalent to the polynomial."
        
        # Check if factored: Must be a Mul of Add terms or powers
        is_factored = False
        if isinstance(s_expr, Mul):
            args = s_expr.args
            poly_factors = [a for a in args if any(s in a.free_symbols for s in t_expr.free_symbols)]
            if len(poly_factors) >= 2 or any(isinstance(a, Pow) for a in poly_factors):
                is_factored = True
        elif isinstance(s_expr, Pow) and isinstance(s_expr.base, Add):
            is_factored = True
            
        if is_factored:
            return True, True, "Correctly factored and algebraically equivalent."
        else:
            return True, False, "Equivalent, but left in expanded/unfactored form."
    except Exception as e:
        return False, False, f"Factor verification error: {str(e)}"

def extract_steps_from_text(text: str) -> List[str]:
    """Splits student answer into sequential reasoning lines/steps."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    steps = []
    for l in lines:
        # Split chained steps like "2x+5=15 => 2x=10 => x=5"
        if "=>" in l:
            sub = [s.strip() for s in l.split("=>") if s.strip()]
            steps.extend(sub)
        else:
            steps.append(l)
    return steps

def evaluate_math_step_by_step(
    question: Dict[str, Any],
    student_answer: str
) -> Dict[str, Any]:
    """
    Main evaluation pipeline for a mathematics question:
    1. Normalizes OCR input.
    2. Parses steps.
    3. Evaluates criteria-based rubrics.
    4. Computes confidence score and flags uncertain reasoning.
    5. Returns fully structured evaluation object.
    """
    q_text = question.get("text", "")
    q_topic = question.get("topic", "General Mathematics")
    max_marks = float(question.get("max_marks", 5.0))
    model_ans = question.get("model_answer", "")
    rubric = question.get("rubric", [])
    if isinstance(rubric, str):
        import json
        rubric = json.loads(rubric)

    acceptable_alts = question.get("acceptable_alternatives", [])
    if isinstance(acceptable_alts, str):
        import json
        try:
            acceptable_alts = json.loads(acceptable_alts)
        except Exception:
            acceptable_alts = []

    # Clean and extract steps
    normalized_raw = normalize_math_input(student_answer)
    raw_steps = extract_steps_from_text(normalized_raw)
    
    if not raw_steps:
        # Empty submission
        crit_scores = []
        for c in rubric:
            crit_scores.append({
                "criterion_id": c.get("id", ""),
                "name": c.get("name", ""),
                "marks": float(c.get("marks", 1.0)),
                "earned": 0.0,
                "reason": "No work submitted for this criterion.",
                "matched": False
            })
        return {
            "score": 0.0,
            "max": max_marks,
            "confidence": 1.0,
            "requires_review": False,
            "review_reason": None,
            "criteria_scores": crit_scores,
            "step_analysis": [],
            "feedback": "No answer or working was submitted for this question.",
            "corrected_solution": model_ans,
            "recognized_latex": ""
        }

    # Step-by-step mathematical verification
    step_analysis = []
    has_parse_error = False
    has_math_error = False
    first_error_step = None
    recognized_latex_list = []

    for idx, s in enumerate(raw_steps):
        parsed_obj, obj_type = parse_equation_or_expr(s)
        if parsed_obj is None:
            # Check if it is a descriptive text line (e.g., "Factors of 6 adding to 5 are 2 and 3")
            if any(w in s.lower() for w in ["factor", "let", "substitute", "using", "root", "denominator", "common", "step"]):
                step_analysis.append({
                    "step_index": idx + 1,
                    "raw_step": s,
                    "parsed_latex": f"\\text{{{s}}}",
                    "is_valid": True,
                    "error_detail": None
                })
                recognized_latex_list.append(f"\\text{{{s}}}")
            else:
                has_parse_error = True
                step_analysis.append({
                    "step_index": idx + 1,
                    "raw_step": s,
                    "parsed_latex": f"\\text{{{s}}}",
                    "is_valid": False,
                    "error_detail": "Mathematical expression could not be parsed."
                })
        else:
            try:
                lat = sympy.latex(parsed_obj)
            except Exception:
                lat = str(parsed_obj)
            recognized_latex_list.append(lat)

            # Check deductive correctness for equation steps
            is_valid = True
            err_detail = None
            if idx > 0 and obj_type == "eq" and step_analysis[-1]["is_valid"]:
                prev_raw = raw_steps[idx - 1]
                prev_obj, prev_type = parse_equation_or_expr(prev_raw)
                if prev_obj is not None and prev_type == "eq":
                    # Check if previous equation implies current equation
                    if not are_equations_equivalent(s, prev_raw):
                        is_valid = False
                        has_math_error = True
                        err_detail = f"Step does not logically or algebraically follow from previous step '{prev_raw}'."
                        if first_error_step is None:
                            first_error_step = idx + 1

            step_analysis.append({
                "step_index": idx + 1,
                "raw_step": s,
                "parsed_latex": lat,
                "is_valid": is_valid,
                "error_detail": err_detail
            })

    # Evaluate final answer vs alternatives
    last_step = raw_steps[-1]
    final_matches = False
    
    # 1. Exact string or normalized string match
    norm_last = normalize_math_input(last_step).replace(" ", "")
    for alt in [model_ans] + acceptable_alts:
        norm_alt = normalize_math_input(alt).replace(" ", "")
        if norm_last == norm_alt or norm_alt in norm_last:
            final_matches = True
            break

    # 2. Factorization check if question asks for factoring
    if "factor" in q_text.lower() or "factor" in q_topic.lower():
        is_eq, is_fact, fmsg = check_factored_form(last_step, model_ans)
        if is_eq and is_fact:
            final_matches = True
        elif is_eq and not is_fact:
            final_matches = False

    # 3. Symbolic check for equations or arithmetic expressions
    if not final_matches:
        if are_expressions_equivalent(last_step, model_ans):
            final_matches = True
        elif are_equations_equivalent(last_step, model_ans):
            final_matches = True

    # Criterion-level scoring
    criteria_scores = []
    total_earned = 0.0

    for crit in rubric:
        cid = crit.get("id", "")
        cname = crit.get("name", "")
        ctype = crit.get("type", "method")
        cmarks = float(crit.get("marks", 1.0))
        cdesc = crit.get("description", "")

        earned = 0.0
        reason = ""
        matched = False

        if ctype == "final_answer":
            if final_matches and not has_math_error:
                earned = cmarks
                matched = True
                reason = "Final answer matches model solution and is algebraically correct."
            elif final_matches and has_math_error:
                # Right answer with faulty intermediate step (lucky guess or arithmetic accident)
                earned = round(cmarks * 0.5, 2)
                matched = True
                reason = "Final answer matches, but intermediate step contained an inconsistency."
            else:
                earned = 0.0
                matched = False
                reason = "Final answer did not match expected solution."
        
        elif ctype == "method":
            # Checks if student demonstrated correct strategy/formula in intermediate steps
            method_present = False
            for st in step_analysis:
                if st["is_valid"]:
                    # Check keywords or algebraic presence
                    if any(term in st["raw_step"].lower() for term in cname.lower().split() if len(term) > 3):
                        method_present = True
                        break
            if method_present or len(step_analysis) >= 2:
                earned = cmarks
                matched = True
                reason = "Valid mathematical method and setup identified."
            elif len(step_analysis) == 1 and final_matches:
                # Direct answer with no working
                earned = round(cmarks * 0.5, 2)
                matched = True
                reason = "Direct answer given; partial method credit awarded."
            else:
                earned = 0.0
                matched = False
                reason = "Appropriate method or formula setup was missing."

        elif ctype == "calculation":
            # Intermediate step calculation
            valid_steps = [st for st in step_analysis if st["is_valid"]]
            intermediate_error = (first_error_step is not None and first_error_step < len(step_analysis))
            if len(valid_steps) >= 2 and not intermediate_error:
                earned = cmarks
                matched = True
                reason = "Intermediate calculations executed accurately."
            elif len(valid_steps) >= 1:
                earned = round(cmarks * 0.5, 2)
                matched = True
                reason = "Partial intermediate calculation verified."
            else:
                earned = 0.0
                matched = False
                reason = "Intermediate calculation incomplete or incorrect."

        else:
            # Generic rubric criteria
            if final_matches:
                earned = cmarks
                matched = True
                reason = "Criteria satisfied."
            else:
                earned = round(cmarks * 0.5, 2)
                matched = False
                reason = "Partially satisfied based on submitted working."

        # Bound check
        earned = min(cmarks, max(0.0, earned))
        total_earned += earned
        criteria_scores.append({
            "criterion_id": cid,
            "name": cname,
            "marks": cmarks,
            "earned": earned,
            "reason": reason,
            "matched": matched
        })

    # Total score calculation: exactly equals sum of criteria and <= max_marks
    total_score = min(max_marks, round(total_earned * 2) / 2)

    # Confidence assessment & teacher review flagging
    confidence = 0.95
    requires_review = False
    review_reasons = []

    if has_parse_error:
        confidence -= 0.25
        requires_review = True
        review_reasons.append("Contains unparsed or ambiguous mathematical handwriting symbols.")

    if has_math_error and final_matches:
        confidence -= 0.20
        requires_review = True
        review_reasons.append("Final answer matches but an intermediate deduction step appeared invalid.")

    if not final_matches and total_score >= max_marks * 0.6:
        # High partial credit despite wrong final answer
        confidence -= 0.10
        requires_review = True
        review_reasons.append("High partial credit awarded on correct method with wrong final answer.")

    if len(raw_steps) == 1 and not final_matches:
        confidence -= 0.15
        requires_review = True
        review_reasons.append("Single-step answer without working.")

    confidence = round(max(0.40, min(0.99, confidence)), 2)

    # Feedback generation
    feedback_parts = []
    if total_score == max_marks:
        feedback_parts.append("Outstanding! All mathematical working, derivations, and final values are accurate.")
    elif total_score > 0 and final_matches:
        feedback_parts.append(f"Good work! You reached the correct final answer and earned {total_score}/{max_marks} marks.")
        if has_math_error:
            feedback_parts.append("Note: Review your intermediate steps to ensure every algebraic transition is strictly valid.")
    elif total_score > 0 and not final_matches:
        feedback_parts.append(f"Good method! You earned {total_score}/{max_marks} marks for valid initial working and setup.")
        if first_error_step:
            feedback_parts.append(f"Check Step {first_error_step} for a calculation or sign slip.")
        feedback_parts.append(f"Expected final solution: {model_ans}")
    else:
        feedback_parts.append(f"0/{max_marks} marks. The submitted response did not meet the criteria for this problem.")
        feedback_parts.append(f"Review the model solution: {model_ans}")

    feedback = " ".join(feedback_parts)
    recognized_latex = " \\\\ ".join(recognized_latex_list)

    return {
        "score": total_score,
        "max": max_marks,
        "confidence": confidence,
        "requires_review": requires_review,
        "review_reason": "; ".join(review_reasons) if review_reasons else None,
        "criteria_scores": criteria_scores,
        "step_analysis": step_analysis,
        "feedback": feedback,
        "corrected_solution": model_ans,
        "recognized_latex": recognized_latex
    }
