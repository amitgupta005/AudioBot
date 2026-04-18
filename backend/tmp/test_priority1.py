"""Quick smoke test for Priority 1 changes."""
from app.schemas.user import UserRegister

# Test 1: Short password rejected
try:
    UserRegister(email="a@b.com", password="short", full_name="Test")
    print("FAIL: short password should have been rejected")
    exit(1)
except Exception as e:
    print(f"PASS: Short password rejected — {e.errors()[0]['msg']}")

# Test 2: Valid password accepted + email normalized
u = UserRegister(email="Test@EXAMPLE.com", password="longpassword123", full_name="Test")
assert u.email == "test@example.com", f"Email not normalized: {u.email}"
print(f"PASS: Valid password accepted, email normalized to '{u.email}'")

# Test 3: authenticate_websocket_token exists and is async
from app.core.security import authenticate_websocket_token
import asyncio
assert asyncio.iscoroutinefunction(authenticate_websocket_token)
print("PASS: authenticate_websocket_token is an async function")

# Test 4: slowapi imports
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
print("PASS: slowapi imports OK")

print("\n=== All Priority 1 smoke tests passed ===")
