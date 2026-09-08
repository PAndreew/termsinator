# Private processor adapter

Place an executable named `process` here and start Compose with the `processing` profile. It receives one JSON object on stdin:

```json
{"id":"analysis-request-uuid","url":"https://example.com/"}
```

It must emit one JSON object, no larger than 5 MiB, on stdout and exit zero. Use the versioned contracts in `../schemas/`; write diagnostics to stderr. The executable is mounted read-only and runs as an unprivileged user with a 15-minute default timeout.

For multi-model processing, the object should contain the immutable document bundle plus an `evaluations` array containing one `report-v1` value per model. Never include provider credentials in output.
