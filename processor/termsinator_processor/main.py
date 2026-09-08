from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from .discovery import Discoverer
from .evaluator import Evaluator


def run(request: dict) -> dict:
    started = time.monotonic()
    discovery = Discoverer().discover(request["url"])
    if not discovery.documents:
        raise RuntimeError("no legal-policy documents discovered")
    evaluator = Evaluator(model_id=os.getenv("OPENROUTER_MODEL", "qwen/qwen3.7-flash"))
    output = evaluator.evaluate(request["id"], discovery)
    root = Path(__file__).parents[2]
    for schema_name, value in (("report-v1.schema.json", output["report"]), ("public-summary-v1.schema.json", output["summary"])):
        schema = json.loads((root / "schemas" / schema_name).read_text())
        errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(value))
        if errors:
            raise ValueError(f"{schema_name}: {errors[0].message}")
    output["processing"] = {
        "duration_seconds": round(time.monotonic() - started, 3),
        "model": os.getenv("OPENROUTER_MODEL", "qwen/qwen3.7-flash"),
        "documents": len(discovery.documents),
        "pages_visited": discovery.pages_visited,
        "bytes_downloaded": discovery.bytes_downloaded,
        "input_tokens": evaluator.input_tokens,
        "output_tokens": evaluator.output_tokens,
    }
    return output


def main() -> None:
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict) or not request.get("id") or not request.get("url"):
            raise ValueError("stdin must contain id and url")
        json.dump(run(request), sys.stdout, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.write("\n")
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        print(f"processor error: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
