# Multi-model aggregation v1

## Goal

Show every model evaluation while producing a useful consensus without hiding disagreement or comparing different policy revisions as if they were the same evidence.

## Unit of comparison

An individual `evaluation` is one model's report against one immutable `policy_bundle` under one matrix version and declared jurisdiction context.

A policy bundle ID is the SHA-256 of the sorted tuples:

```text
(document kind, canonical URL, normalized-text SHA-256)
```

Evaluations are aggregated only when `policy_bundle_id`, matrix major version, and jurisdiction context match. A newer policy hash creates a new revision. Old and new revisions appear separately and are never averaged together.

## Eligible evaluations

An evaluation enters an aggregate only when:

- schema, citations, hashes, arithmetic, and verdict caps pass server validation;
- its evidence coverage is sufficient for a scored verdict;
- it is not quarantined, superseded, or revoked; and
- its document bundle is the selected policy revision.

Keep and display every immutable evaluation in history. For aggregate voting, use one representative result per distinct provider/model/version identity. Repeated runs of the same model do not gain extra votes. Select that representative deterministically by evidence coverage, source freshness, then evaluation time.

Harness identity is provenance, not a separate vote: the same model run through pi and Claude Code still counts as one model identity, though both runs remain visible.

## Provenance

POC evaluations are produced only by maintainer-controlled processing workers. Provider, model, model version, harness, prompt/protocol version, start/end time, and worker release SHA come from service configuration rather than public input. This establishes operational provenance, though it still does not make a model's legal interpretation authoritative.

If external report uploads are added later, they must be placed in a separate trust tier unless provider-verifiable receipts or trusted execution can establish provenance.

## Criterion aggregation

For each criterion:

1. Show every included model's score, confidence, reasoning, and citations.
2. Aggregate applicable scores with the median. For an even count, retain the midpoint (for example, 2.5).
3. Mark the aggregate N/A only when every included model marks it N/A. A split between N/A and applicable is an applicability disagreement.
4. Recompute category and total scores from median criterion scores using the matrix weights; never average model final scores.
5. Preserve missing evidence and inaccessible-document states rather than treating them as zero.

Median scoring limits outlier influence while retaining genuine disagreement in the display.

## Critical flags

- With one included model, its evidence-backed cap applies and the result is labelled single-model.
- With two or more distinct models, an aggregate critical cap activates only when a majority and at least two distinct model identities raise the same flag.
- A minority critical flag is always shown prominently as a disagreement; it is never discarded.

## Consensus labels

Per criterion:

- `unanimous`: all applicable scores equal and applicability agrees;
- `close`: score range is 1 or less;
- `mixed`: score range is 2;
- `polarized`: score range is 3 or more, applicability conflicts, or critical-flag conclusions conflict;
- `single_model`: only one distinct model is available.

Overall consensus reports model count, criterion counts by label, total-score range, and whether all individual verdict labels agree. Agreement is descriptive evidence, not proof of legal correctness.

## Canonical policy revision

Select the current bundle independently of its score:

1. evidence and schema validation passed;
2. current matrix major version;
3. strongest required-document coverage;
4. newest document effective/retrieval date;
5. newest submission only as a tie-breaker.

The score cannot influence which policy revision becomes current.

## Public letter grades

The weighted numeric result remains an internal calculation for aggregation and diagnostics. Public surfaces use broad grades so that small, model-sensitive differences do not look more precise than they are:

- A: 85–100
- B: 70–84.9
- C: 50–69.9
- D: 30–49.9
- E: below 30
- Ungraded: insufficient evidence

Critical-risk caps apply before conversion to a grade. A grade reduces false precision; it does not improve source quality or model reliability. Reports therefore retain evidence coverage, citations, model identities, and disagreements.

## Public presentation

The site report starts with:

- aggregate verdict and median-derived letter grade;
- `service_processed` or `single_model` provenance label;
- policy revision date/hash and matrix version;
- number and names of included models;
- grade range and disagreement count;
- top consensus risks, minority warnings, and actions.

Then show a criterion comparison table and one expandable card per evaluation containing model/provider, model version, harness/version, date, score, verdict, coverage, reasoning, and citations. Excluded evaluations remain listed with the exclusion reason.

The browser extension uses the aggregate summary but displays model count and disagreement status. A user can expand a compact list of each model's verdict and follow the full-report link.
