import os
import re
import io
from textwrap import wrap

from app.config import REPORTS_DIR, GCP_REPORTS_BUCKET
from app.reports.gcs import upload_pdf_to_gcs


def _safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "session"


def _ensure_space(pdf, y: int, required_height: int = 40) -> int:
    if y > required_height:
        return y
    pdf.showPage()
    pdf.setFont("Helvetica", 11)
    return 800


def _write_wrapped_text(pdf, text: str, x: int, y: int, width: int = 95, step: int = 14) -> int:
    for line in wrap(text or "", width=width):
        y = _ensure_space(pdf, y)
        pdf.drawString(x, y, line)
        y -= step
    return y


def build_candidate_report_pdf(
    session_id: str,
    report: dict,
    summary: str,
    recommendation: str,
    transcript_lines: list[str] | None = None,
) -> str:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    pdf_buffer = io.BytesIO()
    pdf = canvas.Canvas(pdf_buffer, pagesize=A4)
    width, height = A4
    y = height - 50

    pdf.setTitle("Candidate Interview Report")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(40, y, "Candidate Interview Report")
    y -= 28

    pdf.setFont("Helvetica", 11)
    pdf.drawString(40, y, f"Session ID: {session_id}")
    y -= 18
    pdf.drawString(40, y, f"Recommendation: {recommendation.replace('_', ' ').title()}")
    y -= 18
    pdf.drawString(40, y, f"Overall Score: {report.get('overall_score', 'N/A')}/10")
    y -= 28

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(40, y, "Metric Scores")
    y -= 18
    pdf.setFont("Helvetica", 11)
    for key, value in (report.get("scores") or {}).items():
        y = _ensure_space(pdf, y)
        pdf.drawString(50, y, f"{key.replace('_', ' ').title()}: {value}/10")
        y -= 16

    y -= 12
    y = _ensure_space(pdf, y)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(40, y, "Summary")
    y -= 18
    pdf.setFont("Helvetica", 11)
    y = _write_wrapped_text(pdf, summary, 50, y)

    y -= 12
    y = _ensure_space(pdf, y)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(40, y, "Strengths")
    y -= 18
    pdf.setFont("Helvetica", 11)
    for strength in report.get("strengths") or []:
        y = _write_wrapped_text(pdf, f"- {strength}", 50, y)
        y -= 2

    y -= 12
    y = _ensure_space(pdf, y)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(40, y, "Concerns")
    y -= 18
    pdf.setFont("Helvetica", 11)
    for concern in report.get("concerns") or []:
        y = _write_wrapped_text(pdf, f"- {concern}", 50, y)
        y -= 2

    transcript_lines = transcript_lines or []
    if transcript_lines:
        y -= 12
        y = _ensure_space(pdf, y, required_height=80)
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(40, y, "Interview Transcript")
        y -= 18
        pdf.setFont("Helvetica", 11)
        for transcript_line in transcript_lines:
            y = _write_wrapped_text(pdf, transcript_line, 50, y, width=90)
            y -= 4

    pdf.save()
    pdf_bytes = pdf_buffer.getvalue()

    if GCP_REPORTS_BUCKET:
        blob_name = upload_pdf_to_gcs(session_id, pdf_bytes)
        if blob_name:
            return f"gcs:{blob_name}"

    # Fallback to local file system
    os.makedirs(REPORTS_DIR, exist_ok=True)
    filename = f"{_safe_name(session_id)}-candidate-report.pdf"
    file_path = os.path.join(REPORTS_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    return file_path
