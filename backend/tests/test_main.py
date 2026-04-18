"""
Tests for helper functions and shared utilities (app/helpers.py).

These tests cover the functions that were formerly inlined in main.py:
- extract_pdf_text
- parse_optional_json
- build_paginated_response
"""

import os
import sys
import unittest
from unittest.mock import patch

import dotenv

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False

from app.helpers import extract_pdf_text, parse_optional_json, build_paginated_response


class FakePdfPage:
    def __init__(self, text):
        self._text = text

    def extract_text(self):
        return self._text


class FakePdf:
    def __init__(self, texts):
        self.pages = [FakePdfPage(text) for text in texts]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestExtractPdfText(unittest.TestCase):
    def test_joins_non_empty_pages(self):
        with patch("app.helpers.pdfplumber.open", return_value=FakePdf(["Page 1", "", "Page 3"])):
            output = extract_pdf_text(b"fake-pdf")
        self.assertEqual(output, "Page 1\nPage 3")

    def test_raises_when_no_text_found(self):
        with patch("app.helpers.pdfplumber.open", return_value=FakePdf([None, ""])):
            with self.assertRaises(ValueError):
                extract_pdf_text(b"fake-pdf")


class TestParseOptionalJson(unittest.TestCase):
    def test_returns_none_for_none_input(self):
        self.assertIsNone(parse_optional_json(None, "field"))

    def test_returns_none_for_empty_string(self):
        self.assertIsNone(parse_optional_json("  ", "field"))

    def test_parses_valid_json(self):
        result = parse_optional_json('{"key": "value"}', "field")
        self.assertEqual(result, {"key": "value"})

    def test_raises_for_invalid_json(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            parse_optional_json("not-json", "field")
        self.assertEqual(ctx.exception.status_code, 422)


class TestBuildPaginatedResponse(unittest.TestCase):
    def test_single_page(self):
        result = build_paginated_response(["a", "b"], total=2, page=1, page_size=20)
        self.assertEqual(result, {
            "items": ["a", "b"],
            "total": 2,
            "page": 1,
            "page_size": 20,
            "pages": 1,
        })

    def test_multiple_pages(self):
        result = build_paginated_response(["x"], total=5, page=1, page_size=2)
        self.assertEqual(result["pages"], 3)

    def test_empty_results(self):
        result = build_paginated_response([], total=0, page=1, page_size=20)
        self.assertEqual(result["pages"], 1)
        self.assertEqual(result["items"], [])


if __name__ == "__main__":
    unittest.main()
