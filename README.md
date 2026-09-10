# Termsinator

Evidence-backed, multi-model risk assessments of public terms and privacy policies.

**Live POC:** https://termsinator.46-62-240-211.sslip.io

Termsinator is a risk-screening tool, not legal advice.

## Current capabilities

- Anonymous URL submission with normalization and queued-job deduplication
- PostgreSQL-leased private processing worker
- Deterministic bounded policy discovery and smolagents/OpenRouter evaluator
- Versioned report and public-summary contracts
- Multi-model aggregation design with visible disagreement
- Service taxonomy covering SaaS, physical products, sectors, subcategories, and facets
- Category-filtered ranking API
- Minimal static Astro interface
- Manifest V3 extension with click-only/automatic switch
- Hardened TLS edge and blue/green API/web/worker layout

The production processing profile remains disabled while the Qwen benchmark findings are addressed. Submitted URLs remain queued meanwhile; see [`processor/README.md`](processor/README.md) and the [ten-site benchmark](docs/BENCHMARK_QWEN_3_7.md).

## Development

Requirements: Go 1.19+, Node 22, pnpm 10, PostgreSQL 16.

```bash
# Start a test database
docker run --rm --name termsinator-test-db \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=termsinator_test \
  -p 127.0.0.1:55432:5432 postgres:16-alpine

TEST_DATABASE_URL='postgres://postgres:test@127.0.0.1:55432/termsinator_test?sslmode=disable' go test ./...
pnpm --dir frontend install
pnpm --dir frontend build
```

Run the API with `DATABASE_URL` and `LISTEN_ADDR=:8080`. Run the worker with `DATABASE_URL`, `PROCESSOR_EXECUTABLE`, and optional `PROCESSOR_TIMEOUT`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Evaluation matrix v1.0.0](docs/EVALUATION_MATRIX.md)
- [Multi-model aggregation](docs/AGGREGATION.md)
- [Service taxonomy and ranking](docs/TAXONOMY_AND_RANKING.md)
- [Gaps and red–green TDD plan](docs/GAPS_AND_PLAN.md)
- [Qwen 3.7 ten-site benchmark](docs/BENCHMARK_QWEN_3_7.md)
- [Discovery and consistency benchmark](docs/CONSISTENCY_BENCHMARK.md)
- [Security model and residual risks](docs/SECURITY.md)
- [Agent report JSON Schema](schemas/report-v1.schema.json)
- [Public multi-model summary JSON Schema](schemas/public-summary-v1.schema.json)

## Deployment

`compose.production.yml` defines singleton PostgreSQL/Caddy and blue/green API, web, and worker services. `scripts/deploy.sh` builds the inactive color, waits for health, switches Caddy, performs a public smoke test, then stops the old color. Only ports 80/443 are publicly bound.

## Open-source status

CI and `CODEOWNERS` are prepared for a protected `main` branch. A license must be selected before publishing the GitHub repository.
