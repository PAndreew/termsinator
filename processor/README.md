# Policy processor

The worker combines deterministic legal-page discovery with a bounded smolagents evaluator using OpenRouter.

## Pipeline

1. Validate the public URL and resolved addresses before every request and redirect hop.
2. Inspect the root, robots file, sitemap, footer links, and conservative known legal paths.
3. Fetch at most eight candidate documents within byte/time limits.
4. Split normalized text into immutable evidence passages.
5. Run two structured Qwen passes covering all 44 matrix criteria.
6. Expand passage IDs into exact citations, recompute scores, apply conservative critical-flag gates, and validate both JSON schemas.

Run locally:

```bash
export OPENROUTER_API_KEY=...
export PYTHONPATH="$PWD/processor"
printf '%s' '{"id":"<uuid>","url":"https://example.com"}' | \
  processor/.venv/bin/python -m termsinator_processor.main
```

The executable contract still receives `{id,url}` on stdin and emits one JSON object on stdout. Diagnostics go to stderr. The production processing profile remains disabled until benchmark quality gates are met.
