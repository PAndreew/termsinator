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

## Focused post-safeguard validation

Five problematic sites were rerun while the safeguards were being finalized:

- Amazon: privacy-only discovery now yields 59.2% coverage and `insufficient_evidence`, rather than a caution score based partly on the wrong document class.
- Microsoft: privacy-only, mixed `en-us`/`hu-hu` discovery yields 59.8% coverage and `insufficient_evidence`.
- Netflix: the unsupported AI-training critical flag disappeared; the uncapped output was 78.5 with 88.4% coverage. This is structurally improved, not a human endorsement of the score.
- Spotify: document-class validation produced 96.7% coverage and removed the unsupported content-appropriation cap. The run occurred before two-letter locale paths were included in the regional detector; its `hu` and `us` documents would now be rejected as a mixed bundle.
- LG: privacy content became reachable on retry, but Qwen supported only 16.3% of the matrix, so the report remained `insufficient_evidence`. The surviving critical citations were lexically consistent with their trigger clauses, but product scope remains unresolved.

These runs used 36,205–165,391 input tokens and 4,394–4,864 output tokens each. The five-site mean was about 86,000 input and 4,600 output tokens. At illustrative rates of $0.03/M input and $0.13/M output, that is about $3,180 per million universal evaluations before OpenRouter fees, retries, discovery, and escalation. With a 5.5% fee and 15% retry/oversize allowance, it is roughly $3,850 per million. Actual billing must be recorded rather than inferred from token counts.

## Manual Amazon follow-up

Amazon's primary policies are public but use opaque help-center query identifiers:

- Conditions of Use: `https://www.amazon.com/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM`
- Privacy Notice: `https://www.amazon.com/gp/help/customer/display.html?nodeId=GX7NJQ4ZB8MHFRNJ`

Discovery had incorrectly removed the meaningful `nodeId` while removing tracking query parameters. It then fetched a generic help page and concluded that terms were missing. The crawler now preserves allowlisted policy identifiers, prioritizes links from the submitted root, and has a narrow Amazon fallback for bot/locale-dependent footers. A rerun found exactly the primary Terms and Privacy Notice, reached 91.1% coverage, and produced a raw score of 58.0 capped to 49.9 (`high_concern`). The cap came from directly cited perpetual, irrevocable, fully sublicensable user-content rights. The terms also directly disclose mandatory arbitration and a class-action waiver. This remains a single-model result, but the earlier Amazon `insufficient_evidence` result was a discovery defect and has been replaced.

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
