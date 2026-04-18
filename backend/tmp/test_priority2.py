"""Quick smoke test for Priority 2 changes."""
import asyncio
import inspect

# Test 1: database.py echo is environment-aware
from app.core.database import engine
echo_val = engine.echo
print(f"PASS: SQL echo = {echo_val} (should be True in dev)")

# Test 2: websocket.py uses asyncio.to_thread
import app.websocket as ws_mod
source = inspect.getsource(ws_mod.websocket_handler)
assert "asyncio.to_thread" in source, "agent.invoke not wrapped"
assert "asyncio.to_thread(stt.transcribe" in source or "asyncio.to_thread(stt.transcribe," in source, "STT not wrapped"
print("PASS: websocket_handler uses asyncio.to_thread for agent.invoke and STT")

# Test 3: _ensure_interview_context uses to_thread
source2 = inspect.getsource(ws_mod._ensure_interview_context)
assert "asyncio.to_thread" in source2, "_ensure_interview_context not using to_thread"
print("PASS: _ensure_interview_context uses asyncio.to_thread")

# Test 4: main.py admin endpoints are all async
import app.main as main_mod
assert asyncio.iscoroutinefunction(main_mod.list_conversations), "list_conversations not async"
assert asyncio.iscoroutinefunction(main_mod.get_conversation), "get_conversation not async"
assert asyncio.iscoroutinefunction(main_mod.download_conversation_report), "download_conversation_report not async"
assert asyncio.iscoroutinefunction(main_mod.health), "health not async"
assert asyncio.iscoroutinefunction(main_mod.health_llm), "health_llm not async"
print("PASS: All admin/health endpoints are async def")

# Test 5: list endpoints have pagination params
import inspect
sig = inspect.signature(main_mod.list_jobs)
params = list(sig.parameters.keys())
assert "page" in params, f"list_jobs missing page param: {params}"
assert "page_size" in params, f"list_jobs missing page_size param: {params}"
print("PASS: list_jobs has page and page_size params")

sig2 = inspect.signature(main_mod.list_candidates)
assert "page" in list(sig2.parameters.keys())
sig3 = inspect.signature(main_mod.list_interviews)
assert "page" in list(sig3.parameters.keys())
sig4 = inspect.signature(main_mod.recruiter_list_jobs)
assert "page" in list(sig4.parameters.keys())
sig5 = inspect.signature(main_mod.recruiter_list_job_candidates)
assert "page" in list(sig5.parameters.keys())
print("PASS: All 5 list endpoints have pagination params")

# Test 6: _read_conversation_payload is async
assert asyncio.iscoroutinefunction(main_mod._read_conversation_payload)
print("PASS: _read_conversation_payload is async")

# Test 7: Dead code removed
source_main = inspect.getsource(main_mod)
assert "_thread_channel_values" not in source_main, "Dead code _thread_channel_values still present"
assert "_initialize_thread_state" not in source_main, "Dead code _initialize_thread_state still present"
print("PASS: Dead commented-out code removed")

# Test 8: _build_paginated_response helper
result = main_mod._build_paginated_response(["a", "b"], total=5, page=1, page_size=2)
assert result == {"items": ["a", "b"], "total": 5, "page": 1, "page_size": 2, "pages": 3}
print("PASS: _build_paginated_response works correctly")

print("\n=== All Priority 2 smoke tests passed ===")
