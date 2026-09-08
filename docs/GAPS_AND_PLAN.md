# Gaps, decisions, and TDD delivery plan

## Product gaps to resolve

### 1. Who may request processing?

Anyone may submit a public URL without an account. Only maintainer-controlled workers publish evaluations, so visitors cannot inject model claims or report JSON. Normalize and deduplicate submissions, return existing pending/fresh work, throttle by short-lived keyed IP hash and site, cap the queue, and escalate to proof-of-work/CAPTCHA only during abuse.

### 2. What does verification mean?

The backend can prove quote inclusion, document hashes, and score arithmetic; it cannot prove nuanced legal interpretation. UI and API need separate `validation_status` and assessment confidence. Do not label model/harness claims as verified.

### 3. Site identity and policy ownership

An eTLD+1 can host many products, while one product can use multiple domains or an external legal-policy provider. The POC should key lookups by hostname and maintain explicit aliases. Registrable-domain collapsing alone would incorrectly merge tenants on hosting platforms.

### 4. Freshness and change detection

A date alone does not show whether terms changed. Store normalized document hashes and effective/retrieval dates. Mark summaries stale after a configurable period (proposed 90 days), and never imply an old report covers current terms.

### 5. Jurisdiction and user context

Terms vary by country, age, plan, business/consumer status, and logged-in state. The report must state assumptions. POC scans only public, logged-out documents and cannot issue jurisdiction-specific legal conclusions.

### 6. Missing and dynamic policies

Policies may be JavaScript-rendered, PDFs, localized, geo-gated, in app stores, or visible only during signup. `not_found` is not proof of absence. Record crawl limits and return `insufficient_evidence` where core documents are inaccessible.

### 7. Prompt injection and poisoned content

Legal pages are adversarial input to an agent. The protocol must forbid obeying page instructions and the service must validate every citation. This reduces but does not eliminate semantic manipulation.

### 8. Action safety

Generic recommendations can be false (for example, claiming a training opt-out exists). Every service-specific action needs evidence or a verified path; otherwise recommend data minimization or avoidance in qualified language.

### 9. Corrections, disputes, and defamation risk

Public scoring creates reputational and legal risk. Required before launch: neutral risk language, methodology disclosure, immutable evidence, correction/dispute channel, takedown/quarantine procedure, and counsel review of labels/disclaimers.

### 10. Browser privacy

Automatic lookup reveals visited hostnames. Default to click-to-check. Automatic mode must be informed opt-in with local caching and no full-URL transmission.

### 11. Processing credentials and isolation

Provider credentials belong only to processing workers, never the browser, public API, logs, or report output. Harnesses that can execute tools must run in constrained per-job sandboxes with no host socket, no shared writable workspace, private-network-only callback paths, egress controls, and strict CPU/memory/time budgets.

### 12. Cost and abuse ceilings

Termsinator now bears crawling and model costs. Before enqueueing, deduplicate by normalized site and freshness window. Enforce per-IP/site request limits, global/concurrent job budgets, retry ceilings, URL/document/byte limits, and provider spending alarms. A queue-full response should return a stable retry time rather than accepting unlimited work.

### 13. Licensing and redistribution

Public policies are accessible but republishing full snapshots may create copyright/database concerns. Public pages should show short citations and source links. Keep full normalized text private to validation unless counsel approves redistribution.

### 14. Deployment URL

`termsinator.46-62-240-211.sslip.io` resolves to the VPS, but ports 80/443 are blocked and have no listener. Approve either a hardened public edge plus firewall change, or a real domain through the existing Cloudflare Tunnel. Direct high-port publishing is rejected.

### 15. Shared VPS capacity and blast radius

The host is healthy but already runs several production stacks. Termsinator needs container limits, a dedicated network/database identity, encrypted backups, and no shared secrets or volumes. A maintenance reboot remains pending.

## Approved POC decisions

- Anyone can submit a public URL without an account, email address, or API key.
- Termsinator performs crawling and model evaluation asynchronously in maintainer-controlled workers.
- Validated results publish automatically. Canonical policy selection is deterministic, never latest-upload-wins.
- Public logged-out pages only, no authentication or form submission.
- Evidence-backed, versioned matrix; server recomputes all scores/verdicts.
- Every service receives a versioned offering-type, sector/subcategory, monetization, audience, sensitivity, and relationship classification for filtering and ranking.
- Jurisdiction-neutral v1 with assumptions disclosed in each report.
- Full policy snapshots remain private to validation; public reports expose only short citations and source links.
- Dedicated PostgreSQL stores both application data and leased jobs; no Redis initially.
- Go API and processing worker; Astro static frontend.
- Manifest V3 extension first; bookmarklet second. A persistent switch offers click-only and automatic hostname lookup; click-only is the privacy-preserving installation default.
- English UI; source documents may be multilingual, with language disclosed.
- Initial hosting may use `termsinator.46-62-240-211.sslip.io`; expose only a hardened TLS edge on ports 80/443 and keep application/worker ports private.

## Anonymous request abuse controls

Normalize URLs and coalesce requests for the same hostname: a fresh report returns immediately and a pending job returns its existing status ID. Store only a rotating HMAC of source IP for a short abuse window. Start with coarse per-IP/site limits, a bounded queue, and strict processing budgets; require proof-of-work or CAPTCHA only after suspicious volume. This avoids collecting identity while preventing repeated clicks from multiplying model spend.

## Red–green TDD plan

Implementation begins only after the behavior and interface above are approved. Work in vertical slices: one failing behavior test, minimal implementation, then the next test. Tests exercise public HTTP/UI interfaces and a real PostgreSQL test database; they do not mock internal packages.

### Slice 1 — health tracer bullet

- RED: starting the Go service exposes readiness only when its database is reachable.
- GREEN: minimal service, config, DB connection, health endpoints, container health check.

### Slice 2 — submit a URL anonymously

- RED: a visitor submits a normalized public HTTP(S) URL without credentials and receives an opaque queued request ID; unsafe URLs are rejected.
- GREEN: URL normalizer, request endpoint, persistence, and stable errors.

### Slice 3 — deduplicate and bound work

- RED→GREEN: repeated requests for a pending site return the same job; a fresh report returns immediately; per-site/IP and queue limits return explicit retry responses.
- GREEN: keyed short-lived IP hash, deduplication key, quotas, and queue capacity.

### Slice 4 — process one leased job

- RED: a worker atomically leases one job, records configured model/harness provenance, persists bounded document evidence, and completes or safely retries after lease expiry.
- GREEN: PostgreSQL job leasing, isolated worker interface, crawl limits, and status endpoint.

### Slice 5 — publish the first valid evaluation

- RED: worker output matching the JSON schema is accepted, classification and quotes are validated, arithmetic is server-computed, and the public request transitions to complete.
- GREEN: schema/domain validation, taxonomy validation, score engine, and publication transaction.

### Slice 6 — reject unsupported reports

Add one behavior at a time: fabricated quote, wrong digest, unknown criterion, duplicate criterion, invalid N/A, wrong score, verdict-cap violation, low coverage. Each must fail with stable machine-readable errors.

### Slice 7 — multi-model public summary

- RED: anonymous hostname lookup groups only matching policy revisions, returns the median-derived service aggregate, model list, score range, disagreement status, classification, top risks/actions, and revision-selection reason; invalid worker results never publish.
- GREEN: policy-bundle fingerprinting, representative-model selection, aggregation, and public DTO.

### Slice 8 — minimal Astro journey

- RED→GREEN: browser test submits an unknown URL and sees queued/running/complete progress.
- RED→GREEN: category page filters and ranks only eligible comparable services.
- RED→GREEN: report page shows verdict/age/coverage, taxonomy, all model results, evidence, mitigations, and disclosures.
- GREEN: static Astro pages with small API-backed islands only where required.

### Slice 9 — extension

- RED→GREEN: click-only mode converts the active tab URL to hostname only and fetches on popup activation; path/query never reaches the API.
- RED→GREEN: switching to automatic persists informed consent and fetches hostname-only summaries on navigation.
- RED→GREEN: switching back stops navigation lookups and preserves manual lookup.
- GREEN: minimal Manifest V3 popup, permission handling, settings, and local cache.

### Slice 10 — blue/green deployment

- RED: deployment smoke script proves inactive color readiness, switches one stable route, and can switch back while an existing report remains readable.
- GREEN: compose profiles/colors, migration job, edge config, deploy/rollback scripts.

## Definition of POC done

- A visitor can submit a URL without an account; a service worker completes discovery and publishes a verified multi-model report.
- Duplicate submissions do not duplicate processing, and fabricated citations or score manipulation are rejected.
- Public summary and full report work without authentication.
- Extension performs the approved hostname-only lookup mode and links to the report.
- Matrix/schema/protocol are versioned and downloadable.
- Freshness, coverage, configured model/harness provenance, taxonomy, disagreement, and no-legal-advice wording are visible.
- Blue/green deploy and rollback are demonstrated against a test stack before VPS release.
- Backups, restore check, resource limits, logs, health checks, and rate limits exist.
