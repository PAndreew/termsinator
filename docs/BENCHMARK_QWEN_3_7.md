# Qwen 3.7 Flash ten-site benchmark

Date: 2026-09-08

Model: `qwen/qwen3.7-flash` through OpenRouter

Harness: deterministic bounded crawler followed by two bounded smolagents `OpenAIModel` structured-output passes. Reasoning disabled. Evidence is supplied as immutable passage IDs; the processor expands selected IDs back to exact citations and validates both public schemas.

## Sites and observed outputs

| Site | Documents | Coverage | Score | Verdict | Classification | Runtime |
|---|---:|---:|---:|---|---|---:|
| OpenAI | 8 | 100% | 89.8 | user respecting | SaaS / AI services / general assistant | 73s |
| Google | 3 | 98.8% | 78.6 | low concern | SaaS / internet services / email | 40s |
| Microsoft | 8 | 88.5% | 81.4 | low concern | SaaS / business software / productivity | 73s |
| Apple | 8 | 76.5% | 49.9 capped | high concern | connected device / consumer utilities / smart home | 45s |
| Amazon | 5 | 75.5% | 61.5 | caution | marketplace / commerce / marketplace | 71s |
| Meta | 6 | 71.0% | 55.5 | caution | connected device / health and wellness / fitness | 79s |
| Netflix | 2 | 98.0% | 49.9 capped | high concern | content service / media / video | 50s |
| Spotify | 6 | 98.5% | 49.9 capped | high concern | SaaS / media / music | 56s |
| Adobe | 8 | 96.8% | 73.2 | low concern | SaaS / business software / productivity | 72s |
| LG Smart TVs | 2 | 51.0% | not published | insufficient evidence | connected device / consumer utilities / smart TV | 74s |

OpenAI returned HTTP 403 during the concurrent batch and succeeded on a later retry. Successful runtime median was approximately 71 seconds. The figures above are diagnostic outputs, not approved public ratings.

## What worked

- Nine of ten eventual runs crossed the 70% structural coverage threshold.
- Passage-ID evidence raised exact-citation acceptance from 0–42 citations per report to 28–44; OpenAI reached 44/44.
- Outputs pass the report and public-summary JSON schemas.
- Qwen followed the 44-criterion split reliably after reasoning was disabled and each response was bounded to half the matrix.
- LG correctly returned `insufficient_evidence` instead of publishing a numeric score because its JavaScript privacy portal was not extracted.
- Deterministic discovery kept model calls out of crawling and limited model processing to two calls per successful site.

## What failed or is not trustworthy yet

### Scores are too model-dependent

Qwen scored OpenAI 89.8 and gave 27 of 44 criteria the maximum score. Google received 30 maximum scores in an earlier diagnostic run. These may reflect relatively protective EU text, but a single inexpensive model is too lenient and inconsistent to establish a public ranking.

### Product scope is ambiguous

A corporate root is not one product. Apple discovery mixed store, iCloud, iTunes, website, assistant, and replacement-service terms. Google was classified as email; Meta as a fitness connected device. Those labels reflect whichever documents dominated, not a defensible classification of the submitted root.

### Jurisdictions were mixed

The VPS often received Hungarian or EU policy variants. OpenAI discovery mixed EU and general policies. A jurisdiction-neutral report must not average conflicting regional contracts. Locale must become part of the policy-bundle identity and ranking cohort.

### Discovery still misses rendered policies

LG's US privacy link redirects to a Transcend JavaScript application. Static extraction found purchase/use terms but not the privacy text. A renderer is needed, but must run in a separate egress-only sandbox so page JavaScript cannot reach PostgreSQL, metadata endpoints, or private networks.

### Structural citation validity is not semantic validity

Before a conservative lexical gate was added, Qwen raised eight critical flags across Apple, Netflix, Spotify, and LG. Manual inspection found unsupported examples: a Netflix prohibition on AI training was interpreted as permission, and an LG equipment clause was cited for AI training. Passage IDs prove what text was selected, not that the model interpreted it correctly.

### Document selection can over-collect

The eight-document cap selected historical or product-specific documents for broad roots. Current/effective version and service scope still need deterministic selection before evaluation.

## Safeguards added after this run

- Redirect aliases and duplicate final policy URLs are collapsed.
- Final URL/title/content determines document kind instead of the discovery link alone.
- Privacy text can no longer support terms-only criteria, or vice versa; a missing required document class reduces coverage and blocks publication.
- Mixed explicit regional URL contexts force `insufficient_evidence` rather than one combined score.
- Critical verdict caps require conservative lexical support in the cited clause.

These safeguards have unit coverage but the full ten-site benchmark has not yet been rerun, so they are not evidence that the quality gate passes.

## Decision

Do not enable production workers or publish these ten ratings yet. The processing path is operational, but the results are suitable only as a benchmark.

Required gates before publication:

1. Resolve one product, locale, and current policy revision per bundle.
2. Add isolated rendering for JavaScript-only legal pages.
3. Reject criteria evaluated against the wrong document class.
4. Run a second independent model for critical flags and low-confidence criteria.
5. Build a manually reviewed gold set before setting verdict thresholds.
6. Record actual input/output tokens and cost for every run.
7. Publish only reports that pass structural, semantic, scope, locale, and freshness gates.
