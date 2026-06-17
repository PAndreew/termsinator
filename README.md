# Termsinator

A **BYOK** (bring-your-own-key) browser extension that quietly finds, analyses and
explains the **Terms & Conditions / Privacy Policy** of any site you visit — and tells you,
in plain language, what you're actually agreeing to.

- 🔍 **Auto-discovers** legal pages programmatically (multilingual link detection) — no
  server, minimal page footprint.
- ✂️ **Token-efficient**: strips scripts/markup/boilerplate before any AI call.
- 🧠 **Scores** each policy on **common sense, GDPR (EU), California (CCPA/CPRA), data
  sharing and data retention**, and writes a **5-line layman summary** of the risks.
- 🌍 **Auto-detects your language** (override in settings). UI + summaries in en/de/es/fr/zh.
- 🔑 **Auto-detects your AI API keys** — but only on the providers' own dashboards
  (OpenAI, Anthropic, Google, Mistral, DeepSeek, Moonshot, Groq, xAI, OpenRouter, Zhipu,
  Perplexity, Fireworks). Keys never leave your device.
- 🤫 **Non-intrusive**: a gentle toast on new sites; press **Alt+Shift+T** to analyse.
- 🛟 **Graceful degradation**: with no key, deterministic built-in checks still flag the
  worst clauses.

## Architecture

Clean Architecture — dependencies point inward; the domain has zero outward imports.

```
src/
  domain/          entities, value objects, ports (interfaces), pure scoring services
  application/     use cases, depending only on domain + ports
  infrastructure/  adapters implementing the ports (LLM, sanitiser, storage, detection…)
  presentation/    MV3 wiring: background (composition root), content, popup, options, i18n
  shared/          Result type
```

- **Dependency inversion**: use cases receive ports via their constructors; only the
  background service worker (`src/presentation/background/service-worker.ts`) knows concrete
  adapters.
- **Factory**: `DefaultLlmAnalyzerFactory` returns the right vendor adapter per credential.
- **Liskov**: every `LlmAnalyzer` / repository is interchangeable; tests swap in fakes
  (`src/test-support/fakes.ts`).
- Built test-first (red→green) with **Vitest** — 100 tests across domain, application and
  infrastructure.

## Develop

```bash
npm install
npm test          # run the suite
npm run typecheck # strict TS
npm run build     # emits dist/chrome and dist/firefox
```

## Load the extension

**Chrome / Edge**
1. `npm run build:chrome`
2. Go to `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select `dist/chrome`.

**Firefox**
1. `npm run build:firefox`
2. Go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick any file
   in `dist/firefox`.

## Using it (BYOK)

1. Visit a provider dashboard (e.g. `platform.openai.com`, `console.anthropic.com`). When a
   key is on the page, Termsinator detects it and shows a confirmation toast. You can also
   add a key manually in **Settings**.
2. Browse to any site. A gentle prompt appears; press **Alt+Shift+T** (or open the popup and
   click **Analyze**).
3. The background worker discovers the Terms/Privacy pages, sanitises them, scores them with
   your key, and the popup shows per-area risk bands plus a 5-line summary in your language.

## Privacy

- No telemetry, no backend. API keys and assessments live only in `browser.storage.local`.
- Key detection runs **only** on known provider hosts, so the extension never harvests a
  credential that might not be yours.
- The model defaults are configurable per provider in the factory; switch the preferred
  provider in Settings.
