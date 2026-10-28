import unittest
import json
from math_engine import (
    normalize_math_input,
    safe_parse_expr,
    are_expressions_equivalent,
    are_equations_equivalent,
    check_factored_form,
    evaluate_math_step_by_step
)

class TestMathEngine(unittest.TestCase):

    def test_ocr_confusion_resolution(self):
        # l/I confused with 1
        self.assertEqual(normalize_math_input("x = l0 / 2"), "x = 10 / 2")
        self.assertEqual(normalize_math_input("l + 5 = 6"), "1 + 5 = 6")
        # O confused with 0
        self.assertEqual(normalize_math_input("2O + 5"), "20 + 5")
        # Contextual 'x' as multiplication in arithmetic
        self.assertEqual(normalize_math_input("4 x 5"), "4 * 5")
        # Unicode operators
        self.assertEqual(normalize_math_input("2 × 3 − 1 ÷ 4"), "2 * 3 - 1 / 4")
        # LaTeX fraction
        self.assertEqual(normalize_math_input(r"\frac{3}{4} - \frac{1}{2}"), "((3)/(4)) - ((1)/(2))")

    def test_fractions_and_negatives(self):
        e = safe_parse_expr("3/4 - 5/6")
        target = safe_parse_expr("-1/12")
        self.assertIsNotNone(e)
        self.assertIsNotNone(target)
        self.assertTrue(are_expressions_equivalent("3/4 - 5/6", "-1/12"))

    def test_algebraic_equivalence(self):
        # (x + 2)(x + 3) == x^2 + 5x + 6
        self.assertTrue(are_expressions_equivalent("(x+2)*(x+3)", "x**2 + 5*x + 6"))
        self.assertTrue(are_expressions_equivalent("2*(x + 3)", "2*x + 6"))
        # Commutative property of factorized polynomial
        self.assertTrue(are_expressions_equivalent("(x + 3)*(x + 2)", "(x + 2)*(x + 3)"))

    def test_factorization_form(self):
        is_eq, is_fact, _ = check_factored_form("(x+2)*(x+3)", "x^2 + 5*x + 6")
        self.assertTrue(is_eq)
        self.assertTrue(is_fact)

        # Expanded form is equivalent, but NOT factored
        is_eq, is_fact, _ = check_factored_form("x^2 + 5*x + 6", "x^2 + 5*x + 6")
        self.assertTrue(is_eq)
        self.assertFalse(is_fact)

    def test_equations_equivalence(self):
        self.assertTrue(are_equations_equivalent("2*x + 5 = 15", "x = 5"))
        self.assertFalse(are_equations_equivalent("2*x + 5 = 15", "x = 4"))

    def test_partial_credit_for_correct_method_wrong_final(self):
        question = {
            "text": "Solve 2x + 5 = 15",
            "topic": "Linear Equations",
            "max_marks": 5.0,
            "model_answer": "x = 5",
            "rubric": [
                {"id": "r1", "name": "Method & Isolation", "type": "method", "marks": 2.0},
                {"id": "r2", "name": "Calculation", "type": "calculation", "marks": 2.0},
                {"id": "r3", "name": "Final Answer", "type": "final_answer", "marks": 1.0}
            ]
        }
        # Student sets up method, but slips on final division: 10/2 = 4
        student_ans = "2x + 5 = 15\n2x = 10\nx = 4"
        res = evaluate_math_step_by_step(question, student_ans)
        
        # Must award partial marks > 0, but strictly less than 5.0
        self.assertGreater(res["score"], 0.0)
        self.assertLess(res["score"], 5.0)
        self.assertEqual(res["score"], 4.0)  # 2 + 2 + 0 = 4.0
        self.assertTrue(res["requires_review"])  # High partial credit flagged

    def test_full_credit_correct_working(self):
        question = {
            "text": "Solve 2x + 5 = 15",
            "topic": "Linear Equations",
            "max_marks": 5.0,
            "model_answer": "x = 5",
            "rubric": [
                {"id": "r1", "name": "Method & Isolation", "type": "method", "marks": 2.0},
                {"id": "r2", "name": "Calculation", "type": "calculation", "marks": 2.0},
                {"id": "r3", "name": "Final Answer", "type": "final_answer", "marks": 1.0}
            ]
        }
        student_ans = "2x + 5 = 15\n2x = 10\nx = 5"
        res = evaluate_math_step_by_step(question, student_ans)
        self.assertEqual(res["score"], 5.0)
        self.assertFalse(res["requires_review"])

    def test_missing_working_penalty(self):
        question = {
            "text": "Solve 2x + 5 = 15",
            "topic": "Linear Equations",
            "max_marks": 5.0,
            "model_answer": "x = 5",
            "rubric": [
                {"id": "r1", "name": "Method & Isolation", "type": "method", "marks": 2.0},
                {"id": "r2", "name": "Calculation", "type": "calculation", "marks": 2.0},
                {"id": "r3", "name": "Final Answer", "type": "final_answer", "marks": 1.0}
            ]
        }
        # Student wrote only "x = 5" without any intermediate working
        student_ans = "x = 5"
        res = evaluate_math_step_by_step(question, student_ans)
        # Should not get 5/5 full marks because working is missing!
        self.assertLess(res["score"], 5.0)

    def test_score_never_exceeds_max(self):
        question = {
            "text": "Factorize x^2 + 5x + 6",
            "topic": "Polynomials",
            "max_marks": 3.0,
            "model_answer": "(x+2)(x+3)",
            "rubric": [
                {"id": "r1", "name": "Factorization", "type": "final_answer", "marks": 3.0}
            ]
        }
        res = evaluate_math_step_by_step(question, "(x+2)(x+3)")
        self.assertLessEqual(res["score"], 3.0)
        self.assertGreaterEqual(res["score"], 0.0)

if __name__ == "__main__":
    unittest.main()
