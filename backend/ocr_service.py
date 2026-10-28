import io
import re
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
from PIL import Image
from pypdf import PdfReader
from math_engine import normalize_math_input

_ocr_cache: Dict[str, Any] = {}

def get_easyocr_reader():
    if "easyocr" not in _ocr_cache:
        try:
            import easyocr
            _ocr_cache["easyocr"] = easyocr.Reader(["en"], gpu=False)
        except Exception as e:
            print(f"Warning: EasyOCR could not be loaded: {e}")
            _ocr_cache["easyocr"] = None
    return _ocr_cache["easyocr"]

def get_trocr_model():
    if "trocr" not in _ocr_cache:
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
            model_name = "microsoft/trocr-base-handwritten"
            proc = TrOCRProcessor.from_pretrained(model_name)
            model = VisionEncoderDecoderModel.from_pretrained(model_name)
            _ocr_cache["trocr"] = (proc, model)
        except Exception as e:
            print(f"Warning: TrOCR could not be loaded: {e}")
            _ocr_cache["trocr"] = None
    return _ocr_cache["trocr"]

def run_easyocr(image: Image.Image) -> str:
    """Runs EasyOCR with geometric line grouping."""
    reader = get_easyocr_reader()
    if reader is None:
        return "OCR engine not available."
    
    img_rgb = np.array(image.convert("RGB"))
    results = reader.readtext(img_rgb)
    if not results:
        return ""

    items = []
    for box, text, conf in results:
        ys = [p[1] for p in box]
        yc = float(np.mean(ys))
        h = max(ys) - min(ys)
        xc = box[0][0]
        items.append((yc, h, xc, text, conf))

    # Group into lines by vertical coordinate
    items.sort(key=lambda x: x[0])
    lines, cur_line, last_y = [], [], None
    for yc, h, xc, text, conf in items:
        if last_y is not None and abs(yc - last_y) > 0.6 * max(h, 12):
            lines.append(cur_line)
            cur_line = []
        cur_line.append((xc, text))
        last_y = yc
    if cur_line:
        lines.append(cur_line)

    raw_lines = [" ".join(t for _, t in sorted(l, key=lambda p: p[0])) for l in lines]
    return "\n".join(raw_lines)

def run_trocr(image: Image.Image) -> str:
    """Runs TrOCR line-by-line using ink horizontal projection."""
    trocr_tuple = get_trocr_model()
    if trocr_tuple is None:
        # Fallback to easyocr if trocr is not loaded
        return run_easyocr(image)

    import cv2
    import torch
    proc, model = trocr_tuple

    img_rgb = np.array(image.convert("RGB"))
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    # Horizontal projection
    proj = bw.sum(axis=1) / 255
    thresh = max(2, 0.015 * bw.shape[1])
    line_slices, start = [], None

    for y, val in enumerate(proj):
        if val > thresh and start is None:
            start = y
        elif val <= thresh and start is not None:
            if y - start > 12:
                line_slices.append((start, y))
            start = None
    if start is not None and len(proj) - start > 12:
        line_slices.append((start, len(proj)))

    if not line_slices:
        # Fallback to full image
        line_slices = [(0, len(proj))]

    output_lines = []
    for top, bottom in line_slices:
        pad_top = max(0, top - 4)
        pad_bot = min(gray.shape[0], bottom + 4)
        crop = Image.fromarray(gray[pad_top:pad_bot]).convert("RGB")
        with torch.no_grad():
            pixel_values = proc(images=crop, return_tensors="pt").pixel_values
            ids = model.generate(pixel_values, max_new_tokens=64)
        line_text = proc.batch_decode(ids, skip_special_tokens=True)[0]
        output_lines.append(line_text)

    return "\n".join(output_lines)

def ocr_image(image_bytes: bytes, engine: str = "easyocr") -> Dict[str, Any]:
    """Processes uploaded image bytes and returns raw & normalized math text."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        return {"error": f"Invalid image file: {str(e)}", "text": "", "answers_by_question": {}}

    if engine == "trocr":
        raw_text = run_trocr(img)
    else:
        raw_text = run_easyocr(img)

    normalized_text = normalize_math_input(raw_text)
    answers_by_q = split_answers_by_question(normalized_text)

    return {
        "raw_text": raw_text,
        "normalized_text": normalized_text,
        "answers_by_question": answers_by_q,
        "engine": engine
    }

def extract_pdf_content(pdf_bytes: bytes) -> Dict[str, Any]:
    """Extracts text and embedded images from a PDF file."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        num_pages = len(reader.pages)
        extracted_text = []

        for page_idx, page in enumerate(reader.pages):
            txt = page.extract_text()
            if txt and txt.strip():
                extracted_text.append(txt.strip())

        full_text = "\n".join(extracted_text)
        
        # If no direct digital text found, try extracting images from pages for OCR
        if not full_text.strip():
            images_found = []
            for page in reader.pages:
                for img_obj in page.images:
                    images_found.append(img_obj.data)
            
            if images_found:
                ocr_results = [ocr_image(img_data)["normalized_text"] for img_data in images_found]
                full_text = "\n".join(ocr_results)

        normalized_text = normalize_math_input(full_text)
        answers_by_q = split_answers_by_question(normalized_text)

        return {
            "num_pages": num_pages,
            "text": normalized_text,
            "answers_by_question": answers_by_q,
            "has_digital_text": bool(extracted_text)
        }
    except Exception as e:
        return {
            "error": f"Failed to parse PDF: {str(e)}",
            "text": "",
            "answers_by_question": {},
            "num_pages": 0
        }

Q_PATTERN = re.compile(
    r"^\s*(?:(?:Q|Question|Ans|Answer|Problem)\s*[:.\-]?\s*)?(\d{1,2})\s*[\).:\-]\s*(.*)",
    re.IGNORECASE
)

def split_answers_by_question(text: str) -> Dict[str, str]:
    """
    Splits mathematical text into questions by number (e.g., '1.', 'Q2)', '3 -').
    """
    answers = {}
    current_q = None

    for line in text.splitlines():
        l_str = line.strip()
        if not l_str:
            continue
        m = Q_PATTERN.match(l_str)
        if m:
            current_q = str(int(m.group(1)))
            answers[current_q] = m.group(2).strip()
        elif current_q is not None:
            if answers[current_q]:
                answers[current_q] += "\n" + l_str
            else:
                answers[current_q] = l_str

    return answers
