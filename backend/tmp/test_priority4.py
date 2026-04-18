"""Smoke test for Priority 4 changes."""
import os

# Test 1: requirements.lock exists and has pinned versions
lock_path = "requirements.lock"
assert os.path.exists(lock_path), "requirements.lock not found"
lock_content = open(lock_path).read()
assert "==" in lock_content, "requirements.lock should have pinned versions"
assert "fastapi==0.135.3" in lock_content, "fastapi not pinned correctly"
print("PASS: requirements.lock exists with pinned versions")

# Test 2: .dockerignore exists
assert os.path.exists(".dockerignore"), ".dockerignore not found"
dockerignore = open(".dockerignore").read()
assert "__pycache__" in dockerignore
assert ".env" in dockerignore
print("PASS: .dockerignore exists")

# Test 3: Dockerfile has best practices
dockerfile = open("Dockerfile").read()
assert "USER appuser" in dockerfile, "Missing non-root user"
assert "HEALTHCHECK" in dockerfile, "Missing health check"
assert "LABEL" in dockerfile, "Missing labels"
assert "requirements.lock" in dockerfile, "Not using pinned deps"
print("PASS: Dockerfile has non-root user, healthcheck, labels, pinned deps")

# Test 4: conftest.py exists with fixtures
assert os.path.exists("tests/conftest.py"), "conftest.py not found"
conftest = open("tests/conftest.py").read()
assert "DummyAgent" in conftest
assert "test_client" in conftest
assert "patch_dependencies" in conftest
print("PASS: conftest.py has DummyAgent, test_client, patch_dependencies")

# Test 5: tests/__init__.py exists
assert os.path.exists("tests/__init__.py"), "tests/__init__.py not found"
print("PASS: tests/__init__.py exists")

# Test 6: pyproject.toml has pytest config and dev deps
pyproject = open("pyproject.toml").read()
assert "[tool.pytest.ini_options]" in pyproject
assert 'testpaths = ["tests"]' in pyproject
assert "pytest>=8.0" in pyproject
assert "pytest-asyncio" in pyproject
print("PASS: pyproject.toml has pytest config and dev deps")

# Test 7: Logging module exists and has both formatters
from app.core.logging import setup_logging, JSONFormatter, DevFormatter
assert JSONFormatter is not None
assert DevFormatter is not None
print("PASS: app.core.logging has JSONFormatter and DevFormatter")

# Test 8: main.py imports setup_logging
main_source = open("app/main.py").read()
assert "setup_logging" in main_source
assert "logging.basicConfig" not in main_source, "Still using basicConfig"
print("PASS: main.py uses setup_logging, not basicConfig")

# Test 9: setup_logging works without errors
setup_logging()
import logging
logger = logging.getLogger("test")
logger.info("Test message from smoke test")
print("PASS: setup_logging() runs without errors")

print("\n=== All Priority 4 smoke tests passed ===")
