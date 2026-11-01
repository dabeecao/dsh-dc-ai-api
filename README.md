# DC AI API Plugin for DeepSeek Harness (DSH)

<p align="center">
  <img src="./icon.svg" width="80" height="80" alt="DC AI API Logo" />
</p>

Integrates the **DC AI Gateway** (`https://dc-ai.dabeecao.org`) into DeepSeek Harness as a native model provider. Discovers every model the gateway serves, derives a reasoning (thinking) ladder per model family, detects vision support, and adds a quota, usage, and cost dashboard under **Settings → DC AI API**.

---

## Features

- **One provider route** (`dc-ai`) written into `llm-pi-ai` through the settings service — no duplicate entries in the model picker.
- **Two wire protocols, switchable from the settings page**: `openai-responses` (default) and `openai-completions`.
- **Per-family reasoning ladder**, derived from what the gateway actually accepts:

  | Family | Levels |
  | --- | --- |
  | DeepSeek | Off / High / Max |
  | OpenAI (GPT, o-series) | Off / Low / Medium / High / Max |
  | Google Gemini | Off / Low / Medium / High / Max |
  | Anthropic Claude | Off / Low / Medium / High / Max |
  | xAI Grok | Off / Low / Medium / High |
  | Other reasoning models (GLM, Qwen, MiMo, …) | Off / Low / Medium / High |
  | Non-reasoning models | `reasoningEfforts: false` |

  A level is offered only when the gateway accepts its spelling; `xhigh` is refused upstream with `502 upstream_unavailable` and is never offered.
- **Vision detection** from models.dev modalities, falling back to the gateway's own description; standalone image endpoints are filtered out of the chat catalog.
- **Quota dashboard**: current window and daily quota with live countdowns, spendable balance, and recent-window cost history. Missing values render as `—` instead of a fabricated default.
- **Bilingual UI** through the DSH locale service: English and Chinese ship with the bundle, Vietnamese is registered as a language pack, and the section follows **Settings → General → Language**.
- **Offline snapshot fallback**: a bundled catalog keeps every model selectable before the API key is configured or while the gateway is unreachable. The page shows whether the catalog is live or the snapshot.

---

## Installation

```bash
# GitHub repository
dsh plugin --profile web add github:dabeecao/dsh-dc-ai-api

# or a full git URL
dsh plugin --profile web add https://github.com/dabeecao/dsh-dc-ai-api.git
```

Restart DSH (or let HMR reload the profile) afterwards.

**Requirements**

- DSH `>= 0.2.1-rc.3` with `@deepseek-ai/dsh-llm-pi-ai` mounted — the plugin writes the provider profile into that section and logs a warning when it is absent.
- `@deepseek-ai/schemastery` reachable from the DSH installation (it ships with every DSH profile).

---

## Configuration

Open **Settings → DC AI API**:

1. **Connection & API key** — paste the key (`dc_…`), pick the protocol, save.
2. **Quota & Billing** — window and daily quota, balance, recent activity.
3. **Model Catalog** — every published model with its context window, output cap, thinking levels, and vision support.

The API key is written to the **DSH credential store** under `apiKeyEnv`; it is never stored in `cordis.patch.yml`. You can also export the same variable in the environment, or store it through **Settings → Models**.

### Fields in `cordis.patch.yml`

| Field | Default | Description |
| --- | --- | --- |
| `baseURL` | `https://dc-ai.dabeecao.org` | Gateway base URL. Must be `https` unless `allowPrivateBaseURL` is set. |
| `api` | `openai-responses` | `openai-responses` or `openai-completions`. |
| `displayName` | `DC AI` | Provider label in DSH. |
| `apiKeyEnv` | `DC_AI_API_KEY` | Credential reference resolved per request. |
| `syncOnStart` | `true` | Refresh the catalog on startup. |
| `refreshHours` | `6` | Hours between refreshes (`0` disables). |
| `useModelsDev` | `true` | Enrich capabilities from models.dev. |
| `modelsDevURL` | `https://models.dev/api.json` | Capability catalog (cached 6 h, revalidated with `If-None-Match`). |
| `includeModels` | `[]` | Publish only these ids (empty = all). |
| `excludeModels` | `[]` | Never publish these ids. |
| `requestTimeoutMs` | `30000` | Gateway request timeout. |
| `allowPrivateBaseURL` | `false` | Permit a loopback/private gateway address. |

`route` is fixed to `dc-ai`: the plugin owns that one route and removes the legacy `dc-ai-chat` / `dc-ai-responses` entries.

---

## Security model

The five HTTP routes the page uses (`/dc-ai-api/state|billing|config|sync|test`) are **not public**:

- every request passes `ctx.connection.requestRejection()`, the same Host/Origin fence and signed-session check that guards `/api` — an unauthenticated browser gets `401`, a cross-site origin gets `403`;
- no `Access-Control-Allow-Origin` header is emitted, and responses are `Cache-Control: no-store`;
- `baseURL` is validated before any request: `http(s)` only, no embedded credentials, `https` for public hosts, and loopback / RFC 1918 / link-local / IPv6 unique-local targets are refused unless `allowPrivateBaseURL` is enabled. Redirects are revalidated hop by hop;
- the API key never leaves the Host: the page only learns whether a key is configured, and under which reference.

Report a vulnerability through the repository's issues, or privately to the maintainer for anything exploitable.

---

## Gemini and the `max` level

Google's own API has no `max` thinking tier: Gemini 2.x takes a numeric `thinkingBudget`, and Gemini 3.x takes `thinkingLevel` of `low` / `medium` / `high` only — the native endpoint answers `502` for `thinkingLevel: "max"`.

This gateway nevertheless accepts `reasoning_effort: "max"` on its Chat Completions route and translates it to a larger budget than `high`. Measured on the same prompt:

| Model | `high` | `max` |
| --- | --- | --- |
| `gemini-3.8-flash` | ~1.8k reasoning tokens | ~2.5k |
| `gemini-4-argon` | ~1.1k | ~0.9k (within noise) |

So `max` is a gateway-level extension rather than a Google level: it measurably buys more thinking on some Gemini routes, so it stays in the ladder, and the ladder stops there because `xhigh` is rejected. On routes where it is indistinguishable from `high`, picking either gives the same behaviour.

---

## Development

```bash
npm test          # unit tests: catalog helpers, base-URL policy, route guard
npm run check     # syntax check + tests
npm run snapshot  # regenerate lib/snapshot.json (needs DC_AI_API_KEY)
```

`lib/catalog.js` is pure apart from its fetchers, so the snapshot generator and the running plugin share one mapping. `test/plugin.test.mjs` drives `apply()` with a stub Cordis context, so route behaviour is covered without booting DSH.

---

## License

[MIT](./LICENSE) © 2026 [dabeecao](https://github.com/dabeecao)
