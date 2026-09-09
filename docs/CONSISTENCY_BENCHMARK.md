# Discovery and Qwen consistency benchmark

Date: 2026-09-09

## Discovery benchmark

`processor/benchmarks/discovery.py` checks the crawler against manually verified primary Terms and Privacy URLs in `discovery-gold-v1.json`.

Latest run:

- Required-document recall: **90%** (18/20)
- Complete sites: **9/10**
- OpenAI failed at the root with an intermittent HTTP 403.
- The other nine sites found both required primary documents in this run.
- Typical discovery time was 6–27 seconds; Meta took 53 seconds.

This benchmark exposed two deterministic defects before the final run:

1. Meaningful query identifiers such as Amazon's `nodeId` were removed with tracking parameters.
2. “Services Agreement” was not recognized as a Terms label, and Microsoft's localized root did not expose the agreement reliably.

The fixes preserve allowlisted document identifiers, recognize service/user agreements, prioritize root links, and provide narrow known-primary fallbacks for Amazon, Microsoft, Meta, and LG. Known-primary fallbacks are recovery tools, not a replacement for generic discovery.

## Should candidate ranking use a local neural model?

Potentially, but only after the deterministic layer. A model cannot recover a query parameter that the URL normalizer deleted, bypass a 403, or safely render JavaScript. Its useful job is ranking candidates by policy type, product scope, locale, currency, and current-vs-archived status.

Recommended experiment:

- Quantized ONNX MiniLM-class encoder or cross-encoder, approximately 25–100 MB of model data.
- One process, one candidate batch at a time, under a 256 MB memory target.
- Inputs: submitted root description, URL, anchor text, title, first policy passage, and link-source depth.
- Outputs: primary/privacy/terms/supplemental/archive/non-policy plus locale and confidence.
- Keep SSRF checks, fetch limits, URL preservation, redirects, hashes, and final acceptance deterministic.
- Adopt only if it improves held-out primary-document recall and precision over the current heuristic benchmark.

A tiny character n-gram classifier is also worth benchmarking. It will be much cheaper than MiniLM and may perform similarly because URL and anchor tokens carry most of the signal.

## Qwen repeatability

Qwen 3.7 Flash was run twice on the same primary bundles for Amazon, Microsoft, and Netflix. The comparison tool is `processor/benchmarks/compare.py`.

| Site | Exact criterion scores | Within ±1 | Mean absolute delta | Raw scores | Verdicts |
|---|---:|---:|---:|---|---|
| Amazon | 71.4% | 100% | 0.286 | 58.0 / 52.6 | high concern / high concern |
| Microsoft | 65.9% | 100% | 0.341 | 80.2 / 72.3 | low concern / low concern |
| Netflix | 89.2% | 100% | 0.108 | 78.5 / 79.2 | low concern / low concern |

All paired criteria stayed within one rubric point and all verdict labels agreed. However, Microsoft's aggregate moved **7.9 points** despite temperature zero. One run is therefore not stable enough for close rankings.

## Qwen versus assistant-reviewed anchors

The seed reference contains 12 clause-level anchors per site. It is explicitly an assistant-reviewed seed, not an independent human gold set or legal advice.

| Site | Scores inside reviewed range | Anchors with citations | Verdict accepted |
|---|---:|---:|---:|
| Amazon | 11/12 | 12/12 | yes |
| Microsoft | 12/12 | 11/12 | yes |
| Netflix | 10/12 | 10/12 | yes |
| **Total** | **33/36 (91.7%)** | **33/36 (91.7%)** | **3/3** |

Observed disagreements:

- Amazon `PRL-4`: Qwen scored indemnity 1/4; the reviewed range is 2–3 because the clause is broad but tied to user-supplied content and representations within the user's control.
- Netflix `PRL-3` and `PRL-4`: Qwen returned inaccessible/null because no disclaimer or indemnity was found. The reviewed reference scores absence in the complete Terms positively rather than treating it as missing evidence.

## Decision

Do not add a neural crawler model yet. First expand discovery gold to at least 100 sites and separate candidate recall from policy-scope precision. Do not use one Qwen run for fine-grained ranking. At minimum, repeat or independently adjudicate reports near verdict boundaries and every critical flag.
