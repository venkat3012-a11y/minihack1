import os
import hmac
import hashlib
import base64
import json
import time
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, Depends, status
from database import get_db, verify_password

SECRET_KEY = os.environ.get("SECRET_KEY", "evalai-maths-super-secret-key-change-in-production-2026").encode("utf-8")
TOKEN_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days

def b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def b64_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding and padding < 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))

def create_access_token(user_id: str, role: str, email: str, full_name: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "email": email,
        "name": full_name,
        "exp": int(time.time()) + TOKEN_EXPIRY_SECONDS,
        "iat": int(time.time())
    }
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = b64_encode(json.dumps(header).encode("utf-8"))
    payload_b64 = b64_encode(json.dumps(payload).encode("utf-8"))
    signature = hmac.new(SECRET_KEY, f"{header_b64}.{payload_b64}".encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = b64_encode(signature)
    return f"{header_b64}.{payload_b64}.{sig_b64}"

def verify_access_token(token: str) -> Dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")
        header_b64, payload_b64, sig_b64 = parts
        expected_sig = hmac.new(SECRET_KEY, f"{header_b64}.{payload_b64}".encode("utf-8"), hashlib.sha256).digest()
        actual_sig = b64_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")
        payload = json.loads(b64_decode(payload_b64).decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Authentication failed: {str(e)}")

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    token = authorization[7:].strip()
    payload = verify_access_token(token)
    user_id = payload.get("sub")
    
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, email, full_name, role FROM users WHERE id = ?", (user_id,))
    user = c.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        
    return dict(user)

def require_teacher(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted to authorized teachers")
    return current_user

def require_student(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted to enrolled students")
    return current_user
