# Security model

## Anonymous URL submission

The API accepts one JSON field, `url`, with a 4 KiB body limit and rejects unknown fields. It accepts only HTTP/HTTPS URLs, rejects credentials, local hostnames, private IP literals, and non-default ports, then discards paths, queries, and fragments before queueing the hostname. SQL uses bound parameters. Submitted text is never executed as a command or rendered as HTML.

Anonymous submissions are limited by a daily-rotating HMAC of the client IP, capped per hour, deduplicated by hostname, and blocked when the queue reaches its global limit. Raw IP addresses are not retained by this mechanism.

## Fetcher isolation

The processor, when enabled, resolves every request and redirect destination and rejects non-public addresses and ports other than 80/443. It validates the connected peer before reading a response, limits redirects through the HTTP client, caps bytes, allows at most 40 requests, and enforces a 120-second discovery deadline. Policy text is treated as untrusted evidence rather than instructions.

The worker container is read-only, drops Linux capabilities, enables `no-new-privileges`, has CPU/memory limits, and has no Docker socket or host filesystem mount. It can reach PostgreSQL on the internal backend network and the internet on a separate egress network. PostgreSQL and application ports are not published on the host.

## Output safety

Reports contain short citations, not executable page markup. Browser rendering escapes report-controlled strings, accepts source links only with HTTP/HTTPS schemes, and applies a restrictive Content Security Policy. Processor output is size-limited JSON and schema-validated before publication.

## Secrets and retained data

The OpenRouter key is supplied only to processing workers. Database and abuse-hashing secrets live in the root-readable production environment file. Public API/web containers do not receive the model key. The public service stores submitted root URLs, hostnames, job state, reports, and daily HMACs—not accounts, email addresses, or browsing paths.

## Residual risks

No internet-facing crawler is risk-free. Remaining risks include DNS rebinding between validation and connection, vulnerabilities in HTTP/HTML dependencies, denial-of-service through many distributed submitters, maliciously large or pathological documents within limits, and compromised upstream model or package providers. Network-level egress rules that block private and metadata ranges should be added before enabling unattended high-volume processing. Dependency and container scanning, key rotation, backups, monitoring, and periodic penetration testing remain necessary.
