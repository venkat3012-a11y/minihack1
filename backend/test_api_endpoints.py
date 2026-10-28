import io
import unittest
from fastapi.testclient import TestClient
from main import app
from database import reset_all_data

class TestApiEndpoints(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        reset_all_data()
        cls.client = TestClient(app)

    def setUp(self):
        # Ensure fresh state for each test method
        reset_all_data()

    def test_health(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["subject"], "Mathematics")
        self.assertEqual(data["symbolic_engine"], "SymPy 1.14.0")
        self.assertIn(data["model"], ["gemini-3.8-flash", "gemini-2.5-flash"])

    def test_teacher_login(self):
        res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "teacher")
        self.assertEqual(data["user"]["email"], "teacher@evalai.edu")

    def test_student_login(self):
        res = self.client.post("/api/auth/login", json={"email": "aarav@evalai.edu", "password": "student123"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "student")
        self.assertEqual(data["user"]["email"], "aarav@evalai.edu")

    def test_role_authorization_guard(self):
        # 1. Login as student
        s_res = self.client.post("/api/auth/login", json={"email": "aarav@evalai.edu", "password": "student123"})
        s_token = s_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {s_token}"}

        # 2. Student attempts to access teacher endpoints -> must be 403 Forbidden!
        t_res = self.client.get("/api/teacher/evaluations", headers=headers)
        self.assertEqual(t_res.status_code, 403)
        self.assertIn("Access restricted to authorized teachers", t_res.json()["detail"])

        t_res2 = self.client.get("/api/teacher/students", headers=headers)
        self.assertEqual(t_res2.status_code, 403)

    def test_teacher_list_students(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        res = self.client.get("/api/teacher/students", headers=headers)
        self.assertEqual(res.status_code, 200)
        students = res.json()["students"]
        self.assertGreaterEqual(len(students), 3)
        emails = [s["email"] for s in students]
        self.assertIn("aarav@evalai.edu", emails)
        self.assertIn("priya@evalai.edu", emails)
        self.assertIn("rohan@evalai.edu", emails)

    def test_teacher_list_evaluations(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        res = self.client.get("/api/teacher/evaluations", headers=headers)
        self.assertEqual(res.status_code, 200)
        evaluations = res.json()["evaluations"]
        self.assertGreaterEqual(len(evaluations), 1)

    def test_student_my_results_privacy(self):
        # Aarav logs in
        s_res = self.client.post("/api/auth/login", json={"email": "aarav@evalai.edu", "password": "student123"})
        s_token = s_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {s_token}"}

        res = self.client.get("/api/student/my-results", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        results = data["results"]
        # All returned evaluations must belong exclusively to Aarav
        for r in results:
            self.assertEqual(r["student_name"], "Aarav Patel")
            self.assertEqual(r["student_email"], "aarav@evalai.edu")
            self.assertEqual(r["status"], "published")

        self.assertIn("analytics", data)
        self.assertGreaterEqual(data["analytics"]["tests_completed"], 1)

    def test_student_cannot_access_unreleased_or_other_student_eval(self):
        # Rohan has eval-3 in 'evaluated' (unreleased) status
        # Aarav logs in and tries to access eval-3 directly -> must be 404/403
        s_res = self.client.post("/api/auth/login", json={"email": "aarav@evalai.edu", "password": "student123"})
        s_token = s_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {s_token}"}

        res = self.client.get("/api/student/my-results/eval-3", headers=headers)
        self.assertEqual(res.status_code, 404)

        # Rohan tries to access eval-3 before it is published -> must also be 404 (not published yet)
        r_res = self.client.post("/api/auth/login", json={"email": "rohan@evalai.edu", "password": "student123"})
        r_token = r_res.json()["access_token"]
        r_headers = {"Authorization": f"Bearer {r_token}"}

        res2 = self.client.get("/api/student/my-results/eval-3", headers=r_headers)
        self.assertEqual(res2.status_code, 404)

    def test_teacher_publish_flow(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # Fetch eval-3 details
        detail_res = self.client.get("/api/teacher/evaluations/eval-3", headers=headers)
        self.assertEqual(detail_res.status_code, 200)
        ev_data = detail_res.json()["evaluation"]
        questions = ev_data["questions"]

        # Adjust score on question 1
        questions[0]["final_marks"] = 4.5
        questions[0]["teacher_note"] = "Good steps, minor notation slip."

        # Teacher publishes
        pub_res = self.client.put(
            "/api/teacher/evaluations/eval-3/publish",
            headers=headers,
            json={
                "questions": questions,
                "teacher_comments": "Well done overall."
            }
        )
        self.assertEqual(pub_res.status_code, 200)
        self.assertEqual(pub_res.json()["evaluation"]["status"], "published")

        # Now Rohan logs in and CAN view eval-3
        r_res = self.client.post("/api/auth/login", json={"email": "rohan@evalai.edu", "password": "student123"})
        r_token = r_res.json()["access_token"]
        r_headers = {"Authorization": f"Bearer {r_token}"}

        rohan_res = self.client.get("/api/student/my-results/eval-3", headers=r_headers)
        self.assertEqual(rohan_res.status_code, 200)
        self.assertEqual(rohan_res.json()["evaluation"]["questions"][0]["final_marks"], 4.5)

    def test_evaluation_missing_files_validation(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # Attempt to post without all 3 files
        res = self.client.post(
            "/api/teacher/evaluate-three-files",
            headers=headers,
            data={"student_id": "s1", "test_title": "Test Title"},
            files={
                "question_paper": ("qp.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")
                # Missing answer_key and student_sheet
            }
        )
        self.assertIn(res.status_code, [400, 422])

    def test_teacher_registration_code_guard(self):
        # 1. Attempt teacher registration without code -> 403
        bad_res1 = self.client.post("/api/auth/register", json={
            "email": "intruder_teacher1@evalai.edu",
            "password": "pass12345Password",
            "full_name": "Intruder Teacher",
            "role": "teacher"
        })
        self.assertEqual(bad_res1.status_code, 403)
        self.assertIn("Valid teacher authorization code is required", bad_res1.json()["detail"])

        # 2. Attempt teacher registration with wrong code -> 403
        bad_res2 = self.client.post("/api/auth/register", json={
            "email": "intruder_teacher2@evalai.edu",
            "password": "pass12345Password",
            "full_name": "Intruder Teacher",
            "role": "teacher",
            "teacher_code": "INVALID-CODE"
        })
        self.assertEqual(bad_res2.status_code, 403)

        # 3. Valid teacher code -> 200 and teacher role granted
        good_res = self.client.post("/api/auth/register", json={
            "email": "valid_teacher@evalai.edu",
            "password": "pass12345Password",
            "full_name": "Verified Teacher",
            "role": "teacher",
            "teacher_code": "EVALAI-TEACHER-2026"
        })
        self.assertEqual(good_res.status_code, 200)
        self.assertEqual(good_res.json()["user"]["role"], "teacher")

    def test_demo_reset_auth_guard(self):
        # 1. Anonymous user cannot reset demo
        res_anon = self.client.post("/api/demo/reset")
        self.assertEqual(res_anon.status_code, 401)

        # 2. Student cannot reset demo
        s_res = self.client.post("/api/auth/login", json={"email": "aarav@evalai.edu", "password": "student123"})
        s_token = s_res.json()["access_token"]
        res_student = self.client.post("/api/demo/reset", headers={"Authorization": f"Bearer {s_token}"})
        self.assertEqual(res_student.status_code, 403)

        # 3. Teacher can reset demo
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        res_teacher = self.client.post("/api/demo/reset", headers={"Authorization": f"Bearer {t_token}"})
        self.assertEqual(res_teacher.status_code, 200)
        self.assertTrue(res_teacher.json()["ok"])

    def test_storage_file_authorization(self):
        import os
        # 1. Anonymous download attempt -> 401
        res_anon = self.client.get("/api/storage/nonexistent.pdf")
        self.assertEqual(res_anon.status_code, 401)

        # 2. Student Aarav attempts to download Rohan's test sheet -> 403
        storage_dir = os.path.join(os.path.dirname(__file__), "storage")
        os.makedirs(storage_dir, exist_ok=True)
        test_file = os.path.join(storage_dir, "rohan_test_sheet.pdf")
        with open(test_file, "wb") as f:
            f.write(b"%PDF-1.4 sample content")

        try:
            s_res = self.client.post("/api/auth/login", json={"email": "aarav@evalai.edu", "password": "student123"})
            s_token = s_res.json()["access_token"]
            res_cross = self.client.get(
                "/api/storage/rohan_test_sheet.pdf",
                headers={"Authorization": f"Bearer {s_token}"}
            )
            self.assertEqual(res_cross.status_code, 403)
            self.assertIn("Access denied", res_cross.json()["detail"])
        finally:
            if os.path.exists(test_file):
                os.remove(test_file)

    def test_magic_bytes_file_validation(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # Upload a file with .pdf extension but plain text content (not %PDF magic bytes)
        fake_pdf = io.BytesIO(b"NOT A REAL PDF FILE CONTENT AT ALL")
        valid_pdf1 = io.BytesIO(b"%PDF-1.4 test")
        valid_pdf2 = io.BytesIO(b"%PDF-1.4 test")

        res = self.client.post(
            "/api/teacher/evaluate-three-files",
            headers=headers,
            data={"student_id": "s1", "test_title": "Test Title"},
            files={
                "question_paper": ("qp.pdf", fake_pdf, "application/pdf"),
                "answer_key": ("ak.pdf", valid_pdf1, "application/pdf"),
                "student_sheet": ("ss.pdf", valid_pdf2, "application/pdf")
            }
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("not a valid PDF", res.json()["detail"])

    def test_server_side_marks_bounds_validation(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # Fetch eval-3
        detail_res = self.client.get("/api/teacher/evaluations/eval-3", headers=headers)
        questions = detail_res.json()["evaluation"]["questions"]

        # 1. Attempt to give 15 marks when max_marks is 5 -> 400
        questions[0]["final_marks"] = 15.0
        bad_res = self.client.put(
            "/api/teacher/evaluations/eval-3/publish",
            headers=headers,
            json={"questions": questions, "teacher_comments": "Attempting invalid marks"}
        )
        self.assertEqual(bad_res.status_code, 400)
        self.assertIn("Final marks", bad_res.json()["detail"])

        # 2. Attempt negative marks -> 400
        questions[0]["final_marks"] = -2.0
        bad_res2 = self.client.put(
            "/api/teacher/evaluations/eval-3/publish",
            headers=headers,
            json={"questions": questions, "teacher_comments": "Attempting negative marks"}
        )
        self.assertEqual(bad_res2.status_code, 400)

if __name__ == "__main__":
    unittest.main()
