"""Smoke test for Priority 3 changes."""
import asyncio
import inspect

# Test 1: InterviewDecision.is_satisfied is bool
from app.agent.schema import InterviewDecision
field = InterviewDecision.model_fields["is_satisfied"]
assert field.annotation is bool, f"is_satisfied should be bool, got {field.annotation}"
print("PASS: InterviewDecision.is_satisfied is bool")

# Test 2: No commented-out code in schema.py
source = inspect.getsource(InterviewDecision.__module__ and __import__("app.agent.schema"))
assert "BooleanLike" not in open("app/agent/schema.py").read(), "BooleanLike still present"
print("PASS: schema.py cleaned — no BooleanLike")

# Test 3: nodes.py doesn't use .lower()=='true'
nodes_source = open("app/agent/nodes.py").read()
assert ".lower()=='true'" not in nodes_source, "Still using string comparison"
assert "decision.is_satisfied" in nodes_source, "Missing bool usage"
print("PASS: nodes.py uses bool comparison")

# Test 4: Routers exist and have router attribute
from app.routers import auth, jobs, candidates, interviews, admin, recruiter, conversations
for mod_name, mod in [("auth", auth), ("jobs", jobs), ("candidates", candidates),
                       ("interviews", interviews), ("admin", admin), ("recruiter", recruiter),
                       ("conversations", conversations)]:
    assert hasattr(mod, "router"), f"{mod_name} missing router attribute"
print("PASS: All 7 routers exist with router attribute")

# Test 5: main.py uses lifespan
main_source = open("app/main.py").read()
assert "lifespan" in main_source, "main.py missing lifespan"
assert "include_router" in main_source, "main.py missing include_router"
assert "openapi_tags" in main_source, "main.py missing openapi_tags"
print("PASS: main.py has lifespan, include_router, and openapi_tags")

# Test 6: main.py is slim (< 150 lines)
line_count = len(open("app/main.py").readlines())
assert line_count < 150, f"main.py still too large: {line_count} lines"
print(f"PASS: main.py is slim ({line_count} lines)")

# Test 7: helpers.py has all shared functions
from app.helpers import (
    build_paginated_response, extract_pdf_text, parse_optional_json,
    get_job_or_404, get_candidate_or_404, get_interview_or_404,
    read_conversation_payload, get_report_path_from_checkpointer,
    DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
)
print("PASS: helpers.py exports all shared functions")

# Test 8: Pagination helper works
result = build_paginated_response(["a"], total=1, page=1, page_size=20)
assert result == {"items": ["a"], "total": 1, "page": 1, "page_size": 20, "pages": 1}
print("PASS: build_paginated_response works correctly")

# Test 9: Route counts per router
assert len([r for r in auth.router.routes]) >= 3, "auth should have >= 3 routes"
assert len([r for r in jobs.router.routes]) >= 4, "jobs should have >= 4 routes"
assert len([r for r in admin.router.routes]) >= 4, "admin should have >= 4 routes"
print("PASS: Routers have expected route counts")

print(f"\n=== All Priority 3 smoke tests passed ===")
