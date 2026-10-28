import io
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

def generate_evaluation_pdf(
    student_name: str,
    assessment_title: str,
    topic: str,
    total_score: float,
    max_total: float,
    evaluations: List[Dict[str, Any]],
    teacher_name: str = "Dr. Sarah Sharma"
) -> bytes:
    """Generates a professional PDF evaluation report for a student submission."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#1e1b4b')
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#475569')
    )
    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=10,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#334155')
    )
    bold_body = ParagraphStyle(
        'BoldBody',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    story = []

    # Header
    story.append(Paragraph("EvalAI — Mathematics Evaluation Report", title_style))
    subtitle = f"<b>Assessment:</b> {assessment_title}"
    if topic and topic.lower() != "mathematics":
        subtitle += f" &nbsp;|&nbsp; <b>Topic:</b> {topic}"
    story.append(Paragraph(subtitle, subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#312e81'), spaceAfter=12))

    # Student Summary Table
    pct = round((total_score / max_total) * 100, 1) if max_total else 0
    grade = "Excellent" if pct >= 85 else "Proficient" if pct >= 70 else "Developing" if pct >= 50 else "Needs Revision"
    
    summary_data = [
        [
            Paragraph("<b>Student:</b> " + student_name, body_style),
            Paragraph("<b>Teacher:</b> " + teacher_name, body_style),
            Paragraph(f"<b>Final Score:</b> {total_score} / {max_total} ({pct}%)", bold_body),
            Paragraph(f"<b>Outcome:</b> {grade}", bold_body)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[130, 130, 140, 100])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 14))

    # Questions and evaluations
    for idx, ev in enumerate(evaluations):
        q_num = ev.get("question_num", idx + 1)
        q_text = ev.get("text") or ev.get("question_text") or f"Question {q_num}"
        q_score = ev.get("final_marks") if "final_marks" in ev else ev.get("final_score", ev.get("proposed_marks", ev.get("ai_score", 0)))
        q_max = ev.get("max_marks", 5.0)
        feedback = ev.get("feedback", "")
        mistakes = ev.get("mistakes", [])
        ambiguity = ev.get("flagged_ambiguity")
        alt_method = ev.get("alternative_method", False)
        model_sol = ev.get("model_solution", "")
        student_work = ev.get("student_working") or ev.get("student_answer", "")

        story.append(Paragraph(f"<b>Question {q_num}:</b> {q_text} &nbsp;&nbsp;[{q_score} / {q_max} marks]", h2_style))
        
        # Student Answer & Steps
        story.append(Paragraph("<b>Student Recognized Working:</b>", bold_body))
        story.append(Paragraph(student_work.replace("\n", "<br/>") if student_work else "<i>No response detected</i>", body_style))
        story.append(Spacer(1, 4))

        # Model Solution
        if model_sol:
            story.append(Paragraph(f"<b>Answer Key / Rubric:</b> {model_sol}", body_style))
            story.append(Spacer(1, 4))

        # Flags & Alternative Methods
        if alt_method:
            story.append(Paragraph("<font color='#059669'><b>Note:</b> Valid alternative mathematical method accepted.</font>", body_style))
        if ambiguity:
            story.append(Paragraph(f"<font color='#d97706'><b>Ambiguity Flag:</b> {ambiguity}</font>", body_style))

        # Mistakes
        if mistakes and isinstance(mistakes, list) and len(mistakes) > 0:
            story.append(Paragraph("<b>Identified Mistakes / Gaps:</b>", bold_body))
            for m in mistakes:
                story.append(Paragraph(f"• {m}", body_style))
            story.append(Spacer(1, 4))

        # Feedback
        if feedback:
            story.append(Paragraph("<b>Diagnostic Feedback:</b> " + feedback, body_style))
        
        teacher_note = ev.get("teacher_note", "")
        if teacher_note:
            story.append(Paragraph("<font color='#4338ca'><b>Teacher Note:</b> " + teacher_note + "</font>", body_style))

        story.append(Spacer(1, 10))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0'), spaceAfter=10))

    # Footer note
    story.append(Spacer(1, 10))
    story.append(Paragraph("<i>Report generated automatically by EvalAI Mathematics Evaluation System. Powered by Google GenAI and SymPy symbolic verification.</i>", subtitle_style))

    doc.build(story)
    return buffer.getvalue()
