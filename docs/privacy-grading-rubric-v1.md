# Termsinator Policy Intrusiveness Rubric

Status: Draft v1  
Rubric version: `privacy-rubric-1`  
Analysis schema version: proposed `3`  
Prompt version: proposed `3`

## 1. Purpose

This rubric grades how intrusive the privacy practices disclosed by a set of
terms, privacy policies, cookie policies, and related legal documents are.

It is not a legal-compliance determination. It does not prove how an
organisation behaves in practice. The result must be described as a **Policy
Intrusiveness Grade**.

The design has four goals:

1. Every classification is tied to a stable, versioned attribute.
2. Every non-unknown classification is supported by verifiable policy evidence.
3. The application, not the language model, performs all scoring and grading.
4. The output preserves concrete actions a user can take to reduce exposure.

The rubric is informed by data minimisation, purpose limitation, storage
limitation, transparency, use limitation, individual participation, and
meaningful user choice. These principles are measurement anchors, not claims
that the rubric determines compliance with any particular law.

## 2. Output Layers

An assessment has three independent layers.

### 2.1 Practice risk

How intrusive the explicitly disclosed practices are. This is calculated only
from known, applicable attribute ratings.

### 2.2 Disclosure coverage

How much of the weighted rubric the documents answer. Silence is unknown, not
privacy-protective.

### 2.3 Evidence confidence

How strongly the classifications are supported by the supplied documents.
Confidence must be reported separately and must not alter the arithmetic score.

The final grade is calculated from practice risk, disclosure floors, and severe
practice overrides.

## 3. Classification States

Each attribute has exactly one state:

| State | Meaning |
|---|---|
| `0` | Absent or explicitly privacy-protective |
| `1` | Necessary, narrowly scoped, and proportionate |
| `2` | Broader but bounded, with meaningful safeguards or choice |
| `3` | Intrusive, broad, default-on, weakly controlled, or opt-out only |
| `4` | Highly intrusive, compulsory, sensitive, indefinite, commercialised, or effectively uncontrolled |
| `unknown` | The supplied documents do not answer the attribute reliably |
| `not_applicable` | The attribute genuinely cannot apply to this service or document set |

`not_applicable` requires a specific rationale. It must never be used merely
because the policy is silent.

Unless an attribute-specific rule says otherwise:

- Prefer the most intrusive practice that applies to an ordinary user.
- Do not average conflicting clauses.
- A narrower clause overrides a broader clause only when the scope relationship
  is explicit.
- Optional processing is treated as optional only when refusal is meaningful
  and does not block the core service.

## 4. Attribute Registry

Weights total 100. The weight measures contribution to privacy intrusiveness,
not legal importance.

### 4.1 Data scope: 15

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `data.basic_identifiers` | 1 | No | Not collected or processed only transiently | Extensive identity linkage across services or identities |
| `data.device_and_activity` | 2 | No | No persistent device/activity history | Detailed, persistent behavioural or device history |
| `data.financial` | 2 | Yes | Not collected beyond payment processor necessity | Detailed financial data reused beyond the transaction |
| `data.precise_location` | 3 | Yes | Not collected or coarse user-requested location only | Precise or continuous location collection |
| `data.communications_and_content` | 2 | Yes | Content remains private and is processed only as requested | Private content is analysed or reused for unrelated purposes |
| `data.sensitive_traits` | 3 | Yes | No sensitive traits, health data, biometrics, or beliefs | Sensitive traits or biometrics are collected, inferred, or exploited |
| `data.children` | 2 | Yes | Service excludes children and does not knowingly process their data | Children are profiled, targeted, or subject to broad collection |

### 4.2 Collection method: 10

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `collection.passive_observation` | 2 | No | Data is supplied deliberately by the user | Extensive passive observation unrelated to the immediate request |
| `collection.background_or_continuous` | 2 | Yes | Collection occurs only during an explicit interaction | Always-on or continuous collection without functional necessity |
| `collection.third_party_sources` | 2 | No | No enrichment from outside sources | Broker, affiliate, or public-source data is broadly combined |
| `collection.non_users` | 2 | Yes | No data about contacts, visitors, or non-users | Users upload or expose substantial data about non-users |
| `collection.inferred_data` | 2 | Yes | No material traits or interests are inferred | Sensitive or consequential traits are inferred at scale |

### 4.3 Purpose and secondary use: 15

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `purpose.core_necessity` | 3 | No | Processing is limited to delivering the requested feature | Unrelated processing is mandatory for the core service |
| `purpose.specificity` | 3 | No | Purposes are explicit, narrow, and mapped to data | Purposes are vague, unlimited, or circular |
| `purpose.product_analytics` | 2 | No | Aggregate or minimal analytics only | User-level behaviour is retained for broad experimentation |
| `purpose.advertising` | 3 | Yes | No advertising use or only contextual advertising | Personal data drives behavioural or sensitive advertising |
| `purpose.ai_training` | 2 | Yes | User content is excluded from model training | Private or sensitive content is used for general model training |
| `purpose.open_ended_future_use` | 2 | Yes | New incompatible purposes require fresh agreement | Data may be used for any lawful, commercial, or future purpose |

### 4.4 Sharing, sale, and recipients: 20

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `sharing.service_processors` | 2 | No | Narrow processors act only to provide the service | Processors may independently reuse data or are effectively unrestricted |
| `sharing.affiliates` | 3 | Yes | No affiliate sharing beyond necessary operations | Broad affiliate ecosystem sharing for independent purposes |
| `sharing.adtech_and_analytics` | 4 | Yes | No third-party adtech or cross-service analytics disclosure | Data is widely disclosed to advertising or tracking recipients |
| `sharing.sale_or_commercial_transfer` | 5 | Yes | No sale or equivalent commercial disclosure | Personal or sensitive data is sold, licensed, or exchanged for value |
| `sharing.public_or_user_directed` | 3 | Yes | Private by default with clear audience controls | Public exposure is default, difficult to reverse, or broader than expected |
| `sharing.onward_transfer_control` | 3 | Yes | Recipients are contractually limited and identified by role | Recipients may make unrestricted onward disclosures or independent uses |

### 4.5 Tracking, profiling, and automated use: 15

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `tracking.cross_context` | 4 | Yes | No cross-site, cross-app, or cross-service tracking | Persistent cross-context surveillance and linkage |
| `tracking.profiling_and_inferences` | 3 | Yes | No material profiling | Detailed profiles predict traits, interests, or vulnerabilities |
| `tracking.sensitive_targeting` | 3 | Yes | No targeting using sensitive or vulnerable categories | Sensitive traits or vulnerabilities drive targeting or recommendations |
| `tracking.consequential_automation` | 3 | Yes | No solely automated consequential use | Automated processing materially affects eligibility, pricing, work, housing, credit, or access |
| `tracking.personalization_control` | 2 | No | Personalisation is local, minimal, or fully controllable | Extensive personalisation cannot be disabled meaningfully |

### 4.6 Retention and deletion: 10

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `retention.period_specificity` | 3 | Yes | Short, concrete periods are stated per data purpose | Indefinite, unspecified, or effectively unlimited retention |
| `retention.necessity` | 2 | Yes | Data is deleted promptly when its purpose ends | Data is kept for speculative future value |
| `retention.account_deletion` | 3 | Yes | Account deletion removes associated personal data promptly | No meaningful deletion, or deletion excludes core personal data |
| `retention.backups_and_residuals` | 2 | No | Residual copies have bounded deletion schedules | Backups, derived data, or archives may persist indefinitely |

### 4.7 User choice and control: 10

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `control.consent_and_defaults` | 3 | Yes | Optional processing is off by default and requires a clear opt-in | Intrusive processing is compulsory, bundled, or enabled by default |
| `control.withdrawal_and_refusal` | 2 | Yes | Refusal and withdrawal are as easy as acceptance | Withdrawal is obstructed, delayed, or materially punitive |
| `control.access_correction_deletion` | 2 | No | Rights workflows are clear, usable, and authenticated proportionately | No usable mechanism or unreasonable obstacles |
| `control.core_service_choice` | 2 | Yes | Core service works without unrelated tracking or sharing | User must accept unrelated processing to use the service |
| `control.dark_patterns` | 1 | No | Choices are neutral, symmetric, and understandable | Interface or terms steer, confuse, shame, or exhaust users into disclosure |

### 4.8 Transparency and policy power: 5

| ID | Weight | Critical | Rating 0 anchor | Rating 4 anchor |
|---|---:|:---:|---|---|
| `transparency.recipient_specificity` | 1 | No | Recipients are named or described precisely by function | Catch-all recipient categories conceal material sharing |
| `transparency.data_purpose_mapping` | 1 | No | Data categories, purposes, and recipients are connected clearly | Users cannot determine which data supports which use |
| `transparency.policy_changes` | 1 | No | Material expansion requires advance notice and meaningful choice | Continued use silently accepts materially broader processing |
| `transparency.vagueness_and_conflicts` | 1 | No | Clauses are specific and internally consistent | Material contradictions, undefined discretion, or pervasive ambiguity |
| `transparency.accountability_contact` | 1 | No | Responsible entity and usable privacy contact are clear | Controller identity or privacy contact is unavailable |

## 5. Evidence Contract

The language model classifies attributes. It does not calculate scores, apply
weights, assign grades, calculate coverage, or choose grade caps.

Each attribute classification must contain:

| Field | Required | Description |
|---|:---:|---|
| `attributeId` | Yes | Exact ID from the registry |
| `state` | Yes | `0`, `1`, `2`, `3`, `4`, `unknown`, or `not_applicable` |
| `confidence` | Yes | `direct`, `inferred`, or `uncertain` |
| `rationale` | Yes | Short explanation connecting the evidence to the state |
| `evidenceRefs` | Yes | One or more evidence IDs, except where the state is `unknown` |
| `conflict` | Yes | Whether relevant supplied clauses materially conflict |

Each evidence item must contain:

| Field | Required | Description |
|---|:---:|---|
| `evidenceId` | Yes | Unique within the analysis |
| `documentId` | Yes | Stable ID assigned to a supplied document |
| `documentUrl` | Yes | URL of a supplied document |
| `quote` | Yes | Exact, contiguous quotation from that document |
| `context` | No | Short explanation of what the quote establishes |

The model must not invent character offsets. The application locates the exact
quote in the normalized document, records offsets, and rejects evidence that
cannot be resolved unambiguously.

For `unknown`, `evidenceRefs` is empty and the rationale states what disclosure
was searched for but not found. Absence is never represented by a fabricated
quotation.

Every registry attribute must occur exactly once. Unknown IDs, duplicate IDs,
missing IDs, invalid states, unresolved quotations, and references to documents
outside the supplied set invalidate the structured response.

## 6. Deterministic Scoring

Let:

- `w(a)` be the registry weight for attribute `a`.
- `r(a)` be its numeric state from 0 through 4.
- `K` be known applicable attributes with numeric states.
- `U` be unknown attributes.
- `N` be not-applicable attributes.

`N` is excluded from all denominators.

```text
knownApplicableWeight = sum(w(a) for a in K)
unknownWeight         = sum(w(a) for a in U)
applicableWeight      = knownApplicableWeight + unknownWeight

practiceRisk =
  round(25 * sum(w(a) * r(a) for a in K) / knownApplicableWeight)

coverage =
  knownApplicableWeight / applicableWeight
```

If `knownApplicableWeight` is zero, no grade is issued.

### 6.1 Disclosure floors

Unknown information cannot improve the final grade. The application calculates
a minimum risk floor:

| Condition | Minimum risk | Best possible grade |
|---|---:|---|
| No critical unknowns and coverage at least 90% | 0 | A |
| One critical unknown | 15 | B |
| Two or more critical unknowns | 30 | C |
| Coverage below 75% | 30 | C |
| Coverage below 50% | 50 | D |

When multiple rules apply, use the highest minimum.

### 6.2 Severe-practice overrides

These are deterministic minimum-risk rules:

| Trigger | Minimum risk |
|---|---:|
| Sensitive data, precise location, private communications, or children’s data rated at least 3 and used for advertising, adtech disclosure, sale, or sensitive targeting rated at least 3 | 70 |
| `sharing.sale_or_commercial_transfer = 4` involving any critical data category rated at least 3 | 70 |
| `purpose.open_ended_future_use = 4` | 50 |
| `sharing.onward_transfer_control = 4` | 50 |
| `retention.period_specificity = 4` and `retention.necessity >= 3` | 50 |
| `control.consent_and_defaults = 4` | 50 |
| `control.core_service_choice = 4` | 50 |
| `tracking.cross_context >= 3` and `control.consent_and_defaults >= 3` | 50 |

Overrides are deliberately asymmetric. A protective practice in one area cannot
cancel a severe practice in another.

### 6.3 Final risk and grade

```text
finalRisk = max(practiceRisk, disclosureFloor, severePracticeMinimum)
```

| Final risk | Grade | Meaning |
|---:|:---:|---|
| 0-14 | A | Minimal, necessary, tightly limited processing |
| 15-29 | B | Generally restrained with bounded optional processing |
| 30-49 | C | Meaningful tracking, sharing, retention, or weak control |
| 50-69 | D | Broad profiling, monetisation, sensitive collection, or coercive terms |
| 70-100 | F | Systematic surveillance, severe commercial exploitation, or major loss of control |

Termsinator uses no E grade. The five-grade scale matches the existing product
and avoids implying more precision than the evidence supports.

## 7. Confidence

Confidence describes evidence quality, not privacy quality.

The application derives overall confidence from the classifications:

| Result | Rule |
|---|---|
| `high` | At least 90% weighted coverage, no material conflicts, and at least 90% of known weight is direct evidence |
| `moderate` | At least 75% weighted coverage and at least 70% of known weight is direct evidence |
| `low` | Anything else |

A low-confidence F remains an F. Confidence must never soften a severe disclosed
practice.

## 8. User Action Contract

The language model may propose actions, but every action must be connected to
one or more classified attributes and evidence references.

An action contains:

| Field | Description |
|---|---|
| `actionId` | Stable identifier within the assessment |
| `linkedAttributeIds` | Attributes whose risk the action addresses |
| `evidenceRefs` | Evidence establishing why the action is relevant; empty only for `investigate_unknown` linked exclusively to unknown attributes |
| `urgency` | `immediate`, `soon`, `when_convenient`, or `informational` |
| `kind` | One of the action kinds below |
| `impact` | `high`, `medium`, or `low` expected exposure reduction |
| `effort` | `low`, `medium`, or `high` user effort |
| `title` | Direct imperative, suitable for a checklist |
| `why` | One short factual explanation |
| `steps` | One to four concrete steps |
| `target` | Optional settings page, account page, support channel, or device permission |
| `fallback` | What to do when the preferred action is unavailable |
| `destructive` | Whether the action can delete data, content, or an account |

Allowed action kinds:

- `disable_setting`
- `revoke_permission`
- `opt_out`
- `withdraw_consent`
- `delete_data`
- `delete_account`
- `request_access`
- `request_correction`
- `contact_privacy_team`
- `limit_input`
- `avoid_sensitive_input`
- `use_alternative`
- `stop_using_service`
- `monitor_policy`
- `investigate_unknown`

### 8.1 Action quality rules

Actions must:

- Be technically or procedurally possible based on the supplied documents.
- Name the setting, permission, request, or behaviour when known.
- State uncertainty instead of inventing a menu path or URL.
- Include a fallback when the policy provides no direct control.
- Prefer exposure-reducing actions over generic advice.
- Avoid claiming that an action guarantees deletion from backups or recipients.
- Avoid legal conclusions such as “this violates the GDPR”.
- Preserve strong recommendations when warranted.

Examples of acceptable strong actions:

- “Delete this account as soon as you have exported anything you need.”
- “Revoke precise-location permission now.”
- “Do not upload private messages or health information to this service.”
- “Opt out of cross-context advertising; if no control is available, stop using
  the service while signed in.”
- “Submit a deletion request and retain the confirmation.”

An `immediate` destructive action requires:

1. At least one linked critical attribute rated 4, or a severe-practice override.
2. Direct evidence.
3. A warning to export required content or consider operational consequences.

### 8.2 Application-side action ordering

The model does not decide display order. The application sorts actions by:

1. Urgency
2. Highest linked attribute rating
3. Impact
4. Lowest effort
5. Stable `actionId`

Duplicate actions addressing the same control are merged by the application.
The application may reject an action whose evidence or linked attributes are
invalid, without rejecting otherwise valid classifications.

## 9. Proposed Structured Model Output

This is a conceptual contract. The implementation should express it as a strict
Zod schema and use provider-native structured output where available.

```text
{
  schemaVersion: "3",
  rubricVersion: "privacy-rubric-1",
  promptVersion: "3",
  language: BCP-47 tag,

  evidence: [
    {
      evidenceId,
      documentId,
      documentUrl,
      quote,
      context?
    }
  ],

  classifications: [
    {
      attributeId,
      state,
      confidence,
      rationale,
      evidenceRefs,
      conflict
    }
  ],

  summaryFacts: [
    {
      text,
      attributeIds,
      evidenceRefs
    }
  ],

  actions: [
    {
      actionId,
      linkedAttributeIds,
      evidenceRefs,
      urgency,
      kind,
      impact,
      effort,
      title,
      why,
      steps,
      target?,
      fallback?,
      destructive
    }
  ]
}
```

The model output explicitly excludes:

- Attribute weights
- Dimension scores
- Overall numeric score
- Coverage
- Grade
- Grade caps or floors
- Overall confidence

Those fields are application-owned derived data.

## 10. Application Validation Pipeline

The eventual implementation should process model output in this order:

1. Validate the strict structured schema.
2. Verify schema, rubric, and prompt versions.
3. Require exactly one classification for every registry attribute.
4. Verify all attribute and evidence references.
5. Resolve exact evidence quotations to normalized document offsets.
6. Reject invalid classifications or retry the model response.
7. Calculate practice risk and coverage.
8. Apply disclosure floors and severe-practice overrides.
9. Derive the final grade and confidence.
10. Validate, deduplicate, and deterministically order actions.
11. Persist the raw classifications, verified evidence, derived score, grade,
    calculation trace, and rubric version.

The calculation trace should make every result reproducible:

```text
attribute contributions
+ disclosure floor
+ triggered severe-practice rules
= final risk and grade
```

## 11. Presentation Requirements

The user-facing assessment should show:

- Policy Intrusiveness Grade
- Final risk score
- Disclosure coverage and confidence
- Top severe attributes with supporting quotations
- Positive attributes with supporting quotations
- Unknown critical attributes
- Ordered action checklist
- Analysis date, document URLs, hashes, model, prompt version, and rubric version

The interface must distinguish:

- “The policy says this”
- “The policy does not disclose this”
- “The model inferred this”
- “Termsinator recommends this action”

## 12. Versioning and Calibration

Published assessments are immutable with respect to their rubric version.
Changing an attribute definition, weight, threshold, or severe-practice rule
requires a new rubric version.

Before treating v1 as stable:

1. Build a labelled calibration set spanning low- and high-intrusion services.
2. Have at least two human reviewers classify each document set independently.
3. Measure per-attribute agreement, not only grade agreement.
4. Rewrite attributes with persistent disagreement.
5. Test grade stability across supported models and prompt repetitions.
6. Check that unknown-heavy policies cannot obtain A or B improperly.
7. Review every D/F result and every immediate destructive action manually.
8. Publish the final registry, thresholds, and known limitations.

## 13. Normative References

- EU General Data Protection Regulation, especially Article 5 principles:
  <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679>
- European Data Protection Board, Guidelines on transparency under Regulation
  2016/679:
  <https://www.edpb.europa.eu/documents/guideline/article-29-working-party-guidelines-on-transparency-under-regulation-2016679_en>
- OECD Privacy Principles:
  <https://www.oecd.org/en/topics/privacy-principles.html>
- US Federal Trade Commission, Bringing Dark Patterns to Light:
  <https://www.ftc.gov/reports/bringing-dark-patterns-light>

These references inform the rubric's principles and terminology. They do not
turn the grade into a legal opinion or jurisdiction-specific compliance result.
