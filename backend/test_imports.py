"""Quick test of all backend module imports."""
import sys
print('Python:', sys.version)

try:
    from database import init_db, seed_db, get_db, hash_password, verify_password
    print('database: OK')
except Exception as e:
    print('database FAILED:', e)

try:
    from auth import create_access_token, get_current_user, require_teacher, require_student
    print('auth: OK')
except Exception as e:
    print('auth FAILED:', e)

try:
    from math_engine import normalize_math_input, safe_parse_expr, are_expressions_equivalent, evaluate_math_step_by_step
    print('math_engine: OK')
except Exception as e:
    print('math_engine FAILED:', e)

try:
    from ocr_service import extract_pdf_content, split_answers_by_question
    print('ocr_service: OK')
except Exception as e:
    print('ocr_service FAILED:', e)

try:
    from pdf_service import generate_evaluation_pdf
    print('pdf_service: OK')
except Exception as e:
    print('pdf_service FAILED:', e)

try:
    from gemini_service import is_gemini_configured, get_gemini_config, evaluate_three_files
    cfg = get_gemini_config()
    configured = is_gemini_configured()
    model_name = cfg['model']
    print(f'gemini_service: OK | configured={configured} | model={model_name}')
except Exception as e:
    print('gemini_service FAILED:', e)

try:
    import fastapi, uvicorn, sympy, PIL, pypdf
    print(f'fastapi={fastapi.__version__} sympy={sympy.__version__} OK')
except Exception as e:
    print('core packages FAILED:', e)

try:
    import google.genai as genai
    print(f'google-genai: OK v{genai.__version__}')
except Exception as e:
    print('google-genai FAILED:', e)

print('--- Import check done ---')

