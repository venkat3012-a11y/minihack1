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
        self.assertEqual(data["model"], "gemini-2.5-flash")

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

if __name__ == "__main__":
    unittest.main()
