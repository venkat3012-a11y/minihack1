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
        self.assertIn(data["model"], ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-2.5-flash"])

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

    def test_student_roster_and_auto_roll_number(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # 1. Next roll number should be 25ALR004 (since 001, 002, 003 seeded)
        nr_res = self.client.get("/api/teacher/students/next-roll-number", headers=headers)
        self.assertEqual(nr_res.status_code, 200)
        self.assertEqual(nr_res.json()["next_roll_number"], "25ALR004")

        # 2. Add student with auto roll number
        add_res = self.client.post("/api/teacher/students", headers=headers, json={
            "full_name": "Divya Nair",
            "email": "divya@evalai.edu",
            "class_name": "Grade 7"
        })
        self.assertEqual(add_res.status_code, 200)
        st_data = add_res.json()["student"]
        self.assertEqual(st_data["roll_number"], "25ALR004")
        st_id = st_data["id"]

        # 3. Attempt duplicate roll number
        dup_res = self.client.post("/api/teacher/students", headers=headers, json={
            "full_name": "Duplicate Student",
            "email": "dup@evalai.edu",
            "roll_number": "25ALR004"
        })
        self.assertEqual(dup_res.status_code, 400)
        self.assertIn("already assigned", dup_res.json()["detail"])

        # 4. Attempt invalid roll number format
        inv_res = self.client.post("/api/teacher/students", headers=headers, json={
            "full_name": "Invalid Roll",
            "email": "inv@evalai.edu",
            "roll_number": "INVALID-123"
        })
        self.assertEqual(inv_res.status_code, 400)

        # 5. Update student
        up_res = self.client.put(f"/api/teacher/students/{st_id}", headers=headers, json={
            "full_name": "Divya N. Nair",
            "email": "divya.nair@evalai.edu",
            "class_name": "Grade 7-A",
            "roll_number": "25ALR004"
        })
        self.assertEqual(up_res.status_code, 200)

        # 6. Delete student
        del_res = self.client.delete(f"/api/teacher/students/{st_id}", headers=headers)
        self.assertEqual(del_res.status_code, 200)

    def test_exam_creation_and_marks_validation(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # 1. Invalid marks sum: total is 20, but question is 10 -> 400
        bad_exam = self.client.post("/api/teacher/exams", headers=headers, json={
            "title": "Mismatched Marks Exam",
            "subject": "Mathematics",
            "total_marks": 20.0,
            "questions": [
                {"question_num": 1, "text": "Solve 2x=10", "max_marks": 10.0}
            ]
        })
        self.assertEqual(bad_exam.status_code, 400)
        self.assertIn("does not match", bad_exam.json()["detail"])

        # 2. Valid exam creation: total 10, question marks 5 + 5 = 10 -> 200
        good_exam = self.client.post("/api/teacher/exams", headers=headers, json={
            "title": "Algebra Unit Exam",
            "subject": "Mathematics",
            "class_name": "Grade 7",
            "total_marks": 10.0,
            "duration_minutes": 30,
            "questions": [
                {"question_num": 1, "text": "Solve 3x + 1 = 10", "max_marks": 5.0, "model_solution": "x = 3"},
                {"question_num": 2, "text": "Simplify 4/8", "max_marks": 5.0, "model_solution": "1/2"}
            ]
        })
        self.assertEqual(good_exam.status_code, 200)
        exam_id = good_exam.json()["exam_id"]

        # 3. Retrieve exam details
        det_res = self.client.get(f"/api/teacher/exams/{exam_id}", headers=headers)
        self.assertEqual(det_res.status_code, 200)
        self.assertEqual(len(det_res.json()["exam"]["questions"]), 2)

    def test_auto_mapping_and_pending_queue(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # 1. Upload sheet containing 25ALR001 in header -> auto-mapped to Aarav Patel!
        mapped_res = self.client.post(
            "/api/teacher/upload-sheet-auto-map",
            headers=headers,
            files={
                "student_sheet": ("student_sheet_25ALR001.pdf", io.BytesIO(b"%PDF-1.4\nRoll No: 25ALR001\nAns 1: x=5"), "application/pdf")
            }
        )
        self.assertEqual(mapped_res.status_code, 200)
        self.assertTrue(mapped_res.json()["mapped"])
        self.assertEqual(mapped_res.json()["student"]["roll_number"], "25ALR001")
        self.assertEqual(mapped_res.json()["student"]["full_name"], "Aarav Patel")

        # 2. Upload sheet with unregistered roll number 25ALR999 -> placed in pending queue!
        unreg_res = self.client.post(
            "/api/teacher/upload-sheet-auto-map",
            headers=headers,
            files={
                "student_sheet": ("unregistered_25ALR999.pdf", io.BytesIO(b"%PDF-1.4\nRoll No: 25ALR999"), "application/pdf")
            }
        )
        self.assertEqual(unreg_res.status_code, 200)
        self.assertFalse(unreg_res.json()["mapped"])
        self.assertTrue(unreg_res.json()["pending"])
        pending_id = unreg_res.json()["pending_id"]

        # 3. Teacher fetches pending queue
        pq_res = self.client.get("/api/teacher/pending-sheets", headers=headers)
        self.assertEqual(pq_res.status_code, 200)
        p_ids = [p["id"] for p in pq_res.json()["pending_sheets"]]
        self.assertIn(pending_id, p_ids)

        # 4. Teacher resolves pending sheet mapping to Rohan (25ALR003)
        res_solve = self.client.post(
            f"/api/teacher/pending-sheets/{pending_id}/resolve",
            headers=headers,
            json={"roll_number": "25ALR003"}
        )
        self.assertEqual(res_solve.status_code, 200)
        self.assertEqual(res_solve.json()["student"]["roll_number"], "25ALR003")

    def test_ai_improvement_pipeline(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # 1. Fetch AI stats
        stats_res = self.client.get("/api/teacher/ai-improvement/stats", headers=headers)
        self.assertEqual(stats_res.status_code, 200)
        data = stats_res.json()
        self.assertIn("current_version", data)
        self.assertGreaterEqual(data["total_examples"], 1)

        # 2. Run model improvement
        run_res = self.client.post("/api/teacher/ai-improvement/run", headers=headers)
        self.assertEqual(run_res.status_code, 200)
        self.assertTrue(run_res.json()["ok"])
        self.assertIn("v1.", run_res.json()["new_version"])

    def test_class_analytics_and_csv_export(self):
        t_res = self.client.post("/api/auth/login", json={"email": "teacher@evalai.edu", "password": "teacher123"})
        t_token = t_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {t_token}"}

        # 1. Class analytics summary
        ana_res = self.client.get("/api/teacher/analytics/class-summary", headers=headers)
        self.assertEqual(ana_res.status_code, 200)
        a_data = ana_res.json()
        self.assertGreaterEqual(a_data["total_evaluations"], 2)
        self.assertIn("grade_distribution", a_data)
        self.assertIn("question_difficulty", a_data)

        # 2. CSV Export
        csv_res = self.client.get("/api/teacher/export/csv", headers=headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("text/csv", csv_res.headers["Content-Type"])
        self.assertIn("Roll Number", csv_res.text)
        self.assertIn("25ALR001", csv_res.text)

    def test_student_dashboard(self):
        s_res = self.client.post("/api/auth/login", json={"email": "aarav@evalai.edu", "password": "student123"})
        s_token = s_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {s_token}"}

        res = self.client.get("/api/student/dashboard", headers=headers)
        self.assertEqual(res.status_code, 200)
        d = res.json()
        self.assertEqual(d["profile"]["roll_number"], "25ALR001")
        self.assertEqual(d["profile"]["full_name"], "Aarav Patel")
        self.assertIn("analytics", d)
        self.assertIn("strengths", d)
        self.assertIn("weak_topics", d)
        self.assertIn("recommendations", d)
        self.assertIn("performance_history", d)

if __name__ == "__main__":
    unittest.main()
