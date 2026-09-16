import json
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError, ExpiredSignatureError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.users import User

from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from app.core.database import get_db, AsyncSessionLocal

logger = logging.getLogger(__name__)

import bcrypt
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPBearer

bearer_scheme = HTTPBearer()

def _hash_password_sync(password: str) -> str:
    # Use 10 rounds for faster auth while maintaining security (default 12 takes ~300ms, 10 takes ~75ms)
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def _verify_password_sync(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False

async def hash_password(password: str) -> str:
    return await run_in_threadpool(_hash_password_sync, password)

async def verify_password(password: str, hashed_password: str) -> bool:
    return await run_in_threadpool(_verify_password_sync, password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None)-> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(token: HTTPAuthorizationCredentials = Depends(bearer_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token.credentials)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.execute(select(User).where(User.id == user_id))
    user = user.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

async def require_recruiter(current_user: User = Depends(get_current_user)):
    if current_user.role not in ("recruiter", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )
    return current_user

async def require_candidate(current_user: User = Depends(get_current_user)):
    if not current_user.is_candidate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )
    return current_user

async def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )
    return current_user


async def authenticate_websocket_token(websocket: WebSocket) -> User | None:
    """
    Authenticate a WebSocket connection using a JWT token from query params.

    WebSocket connections cannot use FastAPI's Depends() injection for auth,
    so this standalone helper extracts the token from ?token=<jwt>, validates
    it, loads the User from the database, and returns it.

    Returns the User on success, or None after closing the socket with an
    appropriate error code on failure.

    WebSocket close codes used:
        4001 — Missing token
        4003 — Token invalid, expired, or user not found
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.accept()
        await websocket.send_text(json.dumps({"error": "Missing authentication token. Please log in again.", "code": 4001}))
        await websocket.close(code=4001, reason="Missing authentication token")
        logger.warning("WebSocket rejected: no token provided")
        return None

    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            await websocket.accept()
            await websocket.send_text(json.dumps({"error": "Invalid token. Please log in again.", "code": 4003}))
            await websocket.close(code=4003, reason="Invalid token payload")
            logger.warning("WebSocket rejected: token missing 'sub' claim")
            return None
    except HTTPException:
        await websocket.accept()
        await websocket.send_text(json.dumps({"error": "Session expired. Please log in again.", "code": 4003}))
        await websocket.close(code=4003, reason="Invalid or expired token")
        logger.warning("WebSocket rejected: token decode failed")
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if user is None:
        await websocket.accept()
        await websocket.send_text(json.dumps({"error": "User not found. Please log in again.", "code": 4003}))
        await websocket.close(code=4003, reason="User not found")
        logger.warning("WebSocket rejected: user %s not found", user_id)
        return None

    return user

