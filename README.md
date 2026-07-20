# Termsinator

Termsinator is a bring-your-own-key browser extension that finds a site's Terms
of Service and Privacy Policy, extracts verifiable evidence, and grades how
intrusive or privacy-invasive the disclosed practices are.

## What it does

- Discovers legal pages from the active site.
- Sanitizes policy text before analysis.
- Supports OpenAI-compatible providers, Anthropic, and Google Gemini.
- Requires exact source quotes for every numeric privacy classification.
- Evaluates 43 versioned privacy attributes across eight dimensions.
- Calculates the risk score and A-F grade locally; the model never performs the
  scoring math.
- Reports evidence-backed facts and concrete protective actions, including
  deletion or stopping use when proportionate.
- Falls back to conservative local phrase checks when no model key is present.
- Stores API keys and assessments in browser-local extension storage.

Community sharing is optional and disabled by default. When enabled, submissions
are signed with a locally generated P-256 identity and sent to a separately
configured Termsinator Hub.

## Grading

The current contract is analysis schema `3`, prompt version `3`, and rubric
`privacy-rubric-1`. The model returns:

- exact evidence excerpts;
- one classification for every rubric attribute;
- evidence-backed summary facts;
- structured, actionable user tasks.

The extension validates that evidence occurs verbatim in the supplied document,
then calculates practice risk, disclosure floors, severe-practice floors,
coverage, confidence, and the final grade deterministically.

See [the grading rubric](docs/privacy-grading-rubric-v1.md) and
[analysis prompt v3](docs/analysis-prompt-v3.md).

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

Build output is written to `dist/chrome` and `dist/firefox`.

## Loading the extension

Chrome or Edge:

1. Run `npm run build:chrome`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose Load unpacked and select `dist/chrome`.

Firefox:

1. Run `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose Load Temporary Add-on and select a file under `dist/firefox`.

## Privacy and security

- API keys are used directly from the extension and are not sent to the hub.
- Key detection runs only on known provider dashboard hosts.
- No telemetry is included.
- Hub sharing is opt-in.
- URL discovery responses are restricted to URLs supplied to the model.
- Imported hub reports are not automatically resubmitted.

## License

MIT
