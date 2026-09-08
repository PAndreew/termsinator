# Evaluation matrix v1.0.0

## Scoring principles

Each criterion is scored for **user protection**, not writing quality:

- `4` — explicit, narrow, user-protective terms; meaningful control or remedy.
- `3` — generally protective with bounded exceptions.
- `2` — mixed, vague, conditional, or materially incomplete.
- `1` — broad provider discretion, weak control, or substantial user exposure.
- `0` — explicit high-risk practice or denial of meaningful control/remedy.
- `null` — genuinely not applicable. Missing or unclear disclosure is usually scored by the criterion's stated rule, not marked N/A.

For each criterion the report must include score, confidence, explanation, and citations or an explicit `evidence_status`. Scores without evidence fail validation.

Weighted score:

```text
category score = sum(criterion score / 4 * criterion weight) / applicable weights
final score    = sum(category score * category weight) / applicable category weights
```

Round only the final result to one decimal. `N/A` weights leave the denominator. Confidence never changes the score; it controls whether a verdict can be issued.

## Categories and criteria

### A. Data collection and purpose — 18%

| ID | Wt | Criterion |
|---|---:|---|
| DCP-1 | 20 | Data categories are specific and understandable; undisclosed/vague catch-alls score low. |
| DCP-2 | 20 | Each purpose is specific and tied to categories; unrestricted compatible/other uses score low. |
| DCP-3 | 15 | Collection is proportionate to the service and data minimization is stated. |
| DCP-4 | 15 | Sensitive data, precise location, contacts, biometrics, and communications receive explicit limits. |
| DCP-5 | 15 | Legal bases/consent are explained where relevant and consent can be withdrawn. |
| DCP-6 | 15 | Data obtained from third parties and inferred/derived data are disclosed. |

### B. Sharing, sale, tracking, and advertising — 15%

| ID | Wt | Criterion |
|---|---:|---|
| SST-1 | 25 | Recipient categories and reasons for sharing are specific. |
| SST-2 | 25 | Sale/share for cross-context behavioral advertising is absent or has meaningful opt-out. Silence where disclosure is expected scores low. |
| SST-3 | 20 | Tracking technologies, SDKs, pixels, and cookie controls are disclosed and controllable. |
| SST-4 | 15 | Government/legal requests are bounded and transparency/user notice commitments exist where lawful. |
| SST-5 | 15 | Corporate transfer and affiliate sharing are bounded by equivalent protections and notice. |

### C. Retention, security, and user rights — 16%

| ID | Wt | Criterion |
|---|---:|---|
| RSR-1 | 20 | Concrete retention periods or intelligible criteria exist by data class. "As long as necessary" alone scores low. |
| RSR-2 | 15 | Deletion covers backups, processors, derived data, and reasonable timelines. |
| RSR-3 | 15 | Access, correction, portability, objection/restriction, and appeal rights are explained as applicable. |
| RSR-4 | 15 | Account deletion and rights requests are practical, discoverable, and not dark-patterned. |
| RSR-5 | 20 | Security commitments are substantive without misleading guarantees; breach notice is addressed. |
| RSR-6 | 15 | International transfers and safeguards are disclosed where relevant. |

### D. Content, intellectual property, and AI — 15%

| ID | Wt | Criterion |
|---|---:|---|
| CIA-1 | 20 | User ownership is retained and any service license is narrow, purpose-limited, and ends reasonably. |
| CIA-2 | 20 | Rights to reproduce, sublicense, commercialize, or create derivatives are no broader than service operation requires. |
| CIA-3 | 25 | Use of content, prompts, outputs, or personal data for model training/improvement is explicit and offers meaningful control. |
| CIA-4 | 15 | Output ownership, similarity/non-uniqueness, and infringement allocation are understandable and balanced. |
| CIA-5 | 10 | Public/private visibility and content-removal rules are explicit. |
| CIA-6 | 10 | Feedback licenses and moral-rights waivers are narrow and conspicuous. |

### E. Contract changes, termination, and account control — 12%

| ID | Wt | Criterion |
|---|---:|---|
| CTA-1 | 25 | Material changes require advance direct notice and provide a meaningful choice. Mere continued use scores low. |
| CTA-2 | 25 | Suspension/termination grounds are specific, proportionate, and include notice/appeal where feasible. |
| CTA-3 | 15 | Users can export data/content and leave without unreasonable friction. |
| CTA-4 | 20 | Surviving clauses and post-termination licenses/retention are narrow. |
| CTA-5 | 15 | Incorporation of other policies is enumerated and archived/versioned. |

### F. Payments, renewal, and liability — 10%

| ID | Wt | Criterion |
|---|---:|---|
| PRL-1 | 25 | Price, billing interval, taxes, renewal, trial conversion, and cancellation are conspicuous. |
| PRL-2 | 20 | Refund rules and cancellation paths are fair and practical. |
| PRL-3 | 20 | Warranty disclaimers and liability caps are proportionate and preserve non-waivable rights. |
| PRL-4 | 20 | Indemnity is limited to harms within the user's control and is not one-sided. |
| PRL-5 | 15 | Price/plan changes require advance notice and a meaningful exit. |

Mark this category N/A only when the service has no paid transaction, subscription, purchase, donation, or monetized user relationship covered by the documents.

### G. Disputes and governing terms — 7%

| ID | Wt | Criterion |
|---|---:|---|
| DGT-1 | 30 | Arbitration is absent or provides conspicuous terms, reasonable opt-out, accessible venue, and fair cost allocation. |
| DGT-2 | 20 | Class/collective-action and jury waivers are absent or clearly disclosed with meaningful choice. |
| DGT-3 | 20 | Governing law and venue are reasonable for the user population and preserve mandatory local rights. |
| DGT-4 | 15 | Informal dispute steps do not create unreasonable delay or procedural traps. |
| DGT-5 | 15 | Complaint channels and regulator/consumer remedies are discoverable. |

### H. Transparency, accessibility, and vulnerable users — 7%

| ID | Wt | Criterion |
|---|---:|---|
| TAV-1 | 20 | Provider identity, contact details, document dates, and prior versions are clear. |
| TAV-2 | 15 | Important terms are readable, structured, consistent, and not hidden behind broken or inaccessible UI. |
| TAV-3 | 20 | Children's/teen use, age gates, parental rights, and age-appropriate protections are addressed where relevant. |
| TAV-4 | 15 | Automated decisions/profiling and significant effects are explained with challenge options where relevant. |
| TAV-5 | 15 | Accessibility and language do not prevent the intended audience understanding or exercising rights. |
| TAV-6 | 15 | Policy contacts and response/appeal routes are practical and internally consistent. |

## Verdicts

| Score | Verdict | Meaning |
|---:|---|---|
| 85–100 | `user_respecting` | Strong documented protections; still review highlighted exceptions. |
| 70–84.9 | `low_concern` | Mostly reasonable, with limited material concerns. |
| 50–69.9 | `caution` | Meaningful trade-offs or unclear protections require attention. |
| 30–49.9 | `high_concern` | Multiple serious exposures or broad provider discretion. |
| 0–29.9 | `severe_concern` | Extreme documented exposure or absent core safeguards. |

Return `insufficient_evidence` instead of a scored verdict when any applies:

- weighted evidence coverage is below 70%;
- no terms/service contract and no privacy/data policy could be located for a service that appears to collect user data;
- submitted documents are inaccessible, truncated, or internally inconsistent enough to prevent scoring; or
- more than 25% of applicable criterion weight has confidence `low`.

The numerical score may be retained internally but must not be presented as a reliable verdict.

## Critical flags and verdict caps

Critical flags prevent a high aggregate score from hiding a severe clause. Apply the strongest cap after calculating the score.

| Flag | Trigger | Maximum verdict |
|---|---|---|
| `content_appropriation` | Perpetual/irrevocable transferable or sublicensable commercial rights to private user content beyond operating the service, without meaningful control | `high_concern` |
| `uncontrolled_ai_training` | Private content or sensitive personal data may train general models without clear notice and opt-out/contractual necessity | `high_concern` |
| `data_sale_no_control` | Personal/sensitive data is sold or used for behavioral ads without a meaningful legally-required control | `high_concern` |
| `silent_material_changes` | Material terms may change immediately without notice while continued use binds the user | `caution` |
| `termination_without_exit` | Provider may terminate broadly while retaining user content/value and offering no export, refund, or appeal | `high_concern` |
| `rights_waiver_trap` | Mandatory arbitration/class waiver is inconspicuous and has no practical opt-out, or imposes prohibitive venue/cost | `caution` |
| `child_safety_gap` | Service is directed to or knowingly permits children while collection/use lacks required consent and protections | `severe_concern` |

A flag requires direct evidence and `medium` or `high` confidence. Jurisdiction-dependent flags must state the assumed jurisdiction and uncertainty.

## Evidence coverage and confidence

For each applicable criterion:

- `supported`: direct policy text supports the assessment (coverage 1.0).
- `partial`: relevant text exists but leaves a material ambiguity (coverage 0.5).
- `not_found`: searched documents do not address it (coverage 0.0).
- `inaccessible`: likely source could not be retrieved (coverage 0.0).
- `not_applicable`: excluded from denominator.

Weighted coverage uses criterion weights. A quote must be short, exact, and accompanied by document ID, URL, and heading or text offsets. Confidence is `high`, `medium`, or `low` and explains ambiguity; it is not a probability.

## Action generation

Actions must be tied to findings and must not claim to eliminate risk. Each action has priority, effort, timing, exact steps, and source criterion IDs. Prefer controls actually documented by the service.

Action types:

- `before_signup`: decide whether the exposure is acceptable or use an alternative.
- `settings`: disable training, ad personalization, public sharing, location, or optional collection.
- `data_minimization`: avoid uploading sensitive/private data; remove metadata; use a separate alias/profile.
- `rights_request`: access, delete, object, opt out, appeal, or contact a regulator.
- `billing`: cancel renewal, record cancellation, request refund, or use payment controls.
- `account_exit`: export, delete, revoke integrations/tokens, and verify completion.
- `monitor`: save the policy version and re-check after material-change notice.

Do not recommend a setting unless cited text or a verified product path confirms it exists. If no mitigation exists, say so and suggest avoiding the feature/service rather than inventing one.
