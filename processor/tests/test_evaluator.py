import json
import unittest
from pathlib import Path
from types import SimpleNamespace

from jsonschema import Draft202012Validator, FormatChecker

from termsinator_processor.discovery import Document
from termsinator_processor.evaluator import CRITERION_IDS, Evaluator


class EvaluatorTest(unittest.TestCase):
    def test_builds_schema_valid_report_and_rejects_fabricated_quote(self):
        text = "Users retain ownership. We collect account data to provide the service."
        document = Document("doc-1", "terms", "Terms", "https://example.com/terms", text, "a" * 64, "2026-09-08T00:00:00Z")
        discovery = SimpleNamespace(
            root_url="https://example.com/", final_root_url="https://example.com/", hostname="example.com",
            documents=[document], candidate_urls=[document.url], pages_visited=3, bytes_downloaded=1000,
            robots_respected=True, truncated=False, root_text="Example software service",
        )
        assessments = []
        for index, criterion_id in enumerate(CRITERION_IDS):
            quote = "Users retain ownership." if index else "This quote was fabricated."
            assessments.append({"criterion_id": criterion_id, "score": 3, "evidence_status": "supported",
                                "confidence": "high", "summary": criterion_id, "reasoning": "Evidence reviewed.",
                                "citations": [{"document_id": "doc-1", "quote": quote, "heading": None}]})
        raw = {
            "classification": {"primary_offering_type": "saas", "primary_sector": "business_software",
                               "primary_subcategory": "productivity", "secondary_subcategories": [],
                               "monetization": ["subscription"], "audiences": ["business"],
                               "data_sensitivity": ["ordinary"], "relationship_facets": ["account_required"],
                               "confidence": "high", "reasoning": "The root describes software.", "citations": []},
            "assessments": assessments, "critical_flags": [], "actions": [], "limitations": [],
        }
        output = Evaluator().build_output("00000000-0000-4000-8000-000000000001", discovery, raw)
        self.assertEqual(output["report"]["assessments"][0]["evidence_status"], "not_found")
        self.assertIsNone(output["report"]["assessments"][0]["score"])
        root = Path(__file__).parents[2]
        for name, value in [("report-v1.schema.json", output["report"]), ("public-summary-v1.schema.json", output["summary"])]:
            schema = json.loads((root / "schemas" / name).read_text())
            errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(value))
            self.assertEqual(errors, [], "\n".join(error.message for error in errors))

    def test_critical_flag_requires_clause_that_supports_the_trigger(self):
        evaluator = Evaluator()
        document = Document("doc-1", "terms", "Terms", "https://example.com/terms", "You must not use content to train any machine learning model.", "b" * 64, "2026-09-08T00:00:00Z")
        evaluator._passage_cache["doc-1:p0001"] = (document, document.text, 0)
        flag = evaluator._flag({"code": "uncontrolled_ai_training", "confidence": "high", "explanation": "Training allowed", "citations": ["doc-1:p0001"]}, {"doc-1": document})
        self.assertIsNone(flag)


if __name__ == "__main__":
    unittest.main()
