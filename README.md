# DC AI API Plugin for DeepSeek Harness (DSH)

<p align="center">
  <img src="./icon.svg" width="80" height="80" alt="DC AI API Logo" />
</p>

Integrates the **DC AI Gateway** (`https://dc-ai.dabeecao.org`) into DeepSeek Harness as a native model provider. Discovers every model the gateway serves, derives a reasoning (thinking) ladder per model family, detects vision support, and adds a quota, usage, and cost dashboard under **Settings → DC AI API**.

---

## Features

- **One provider route** (`dc-ai`) written into `llm-pi-ai` through the settings service — no duplicate entries in the model picker.
- **Two wire protocols, switchable from the settings page**: `openai-responses` (default) and `openai-completions`.
- **Per-family reasoning ladder**, taken from each vendor's own API reference — not from probing the gateway:

  | Family | Levels | Source |
  | --- | --- | --- |
  | DeepSeek | `none` / `low` / `high` / `max` | [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion) |
  | OpenAI (GPT, o-series) | `low` / `medium` / `high` / `xhigh` / `max` | [Reasoning guide](https://platform.openai.com/docs/guides/reasoning) |
  | Google Gemini | per model: `low` / `medium` / `high`, plus `minimal` on Flash and Flash-Lite | [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking) |
  | Anthropic Claude | `low` / `medium` / `high` / `xhigh` / `max` | [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) |
  | xAI Grok | `low` / `medium` / `high` / `xhigh` | [Reasoning](https://docs.x.ai/docs/guides/reasoning) |
  | Zhipu GLM | `none` / `high` / `max` | [Deep Thinking](https://docs.z.ai/guides/capabilities/thinking) |
  | Qwen and unrecognised models | a single thinking level (the vendor documents a toggle, not an effort scale) | Alibaba Model Studio |
  | Non-reasoning models | `reasoningEfforts: false` | — |

  A level appears only when the vendor documents it. `off` appears only where the vendor has a spelling that actually disables thinking (`none`); elsewhere the ladder starts at the vendor's lowest real level, because an `off` that merely omits the field would fall back to the vendor's default (thinking on) and misreport what the request does.

- **Vision detection** from models.dev modalities, falling back to the gateway's own description; standalone image endpoints are filtered out of the chat catalog.
- **Quota dashboard**: current window and daily quota with live countdowns, spendable balance, and recent-window cost history. Missing values render as `—` instead of a fabricated default.
- **Bilingual UI** through the DSH locale service: English and Chinese ship with the bundle, Vietnamese is registered as a language pack, and the section follows **Settings → General → Language**.
- **Update check**: this plugin ships from GitHub, not npm, and DeepSeek Harness only tracks registry packages — so the settings page carries its own check against the published manifest and links to the releases page.
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

Because the plugin is installed from a git address, DeepSeek Harness's own
update check does not cover it: the plugin manager only offers `List versions`
and `Update` for packages installed from a registry under their own name. Use
**Settings → DC AI API → Connection & API Key → Check for updates**, which
compares the running version with `package.json` on the default branch.
Reinstall with the same `dsh plugin add github:...` command to apply an update.

**Requirements**

- DSH `>= 0.2.1-rc.3` with `@deepseek-ai/dsh-llm-pi-ai` mounted — the plugin writes the provider profile into that section and logs a warning when it is absent.
- `@deepseek-ai/schemastery` reachable from the DSH installation (it ships with every DSH profile).

---

## Configuration

Open **Settings → DC AI API**:

1. **Connection & API key** — paste the key (`dc_…`), pick the protocol, save.
2. **Quota & Billing** — window and daily quota, balance, recent activity.
3. **Model Catalog** — every published model with its context window, output cap, thinking levels, and vision support.

The config tab also carries two switches: **Allow a private gateway address**
(turn it on only when you self-host the gateway on localhost or your own
network) and **Enrich capabilities from models.dev** (on refines reasoning and
vision data from the public catalog; off uses the gateway metadata alone).

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
| `useModelsDev` | `true` | Enrich capabilities from models.dev; off uses the gateway metadata alone. The catalog URL itself is fixed. |
| `includeModels` | `[]` | Publish only these ids (empty = all). |
| `excludeModels` | `[]` | Never publish these ids. |
| `requestTimeoutMs` | `30000` | Gateway request timeout. |
| `allowPrivateBaseURL` | `false` | Permit a loopback/private gateway address. Toggle it in **Settings → DC AI API → Connection & API Key**. |

`route` is fixed to `dc-ai`: the plugin owns that one route and removes the legacy `dc-ai-chat` / `dc-ai-responses` entries.

---

## Security model

The six HTTP routes the page uses (`/dc-ai-api/state|billing|config|sync|test|update`) are **not public**:

- every request passes `ctx.connection.requestRejection()`, the same Host/Origin fence and signed-session check that guards `/api` — an unauthenticated browser gets `401`, a cross-site origin gets `403`;
- no `Access-Control-Allow-Origin` header is emitted, and responses are `Cache-Control: no-store`;
- `baseURL` is validated before any request: `http(s)` only, no embedded credentials, `https` for public hosts, and a loopback or private literal is refused unless `allowPrivateBaseURL` is enabled (the switch in **Connection & API Key**). The models.dev catalog URL is a fixed constant and never accepts a private address. Redirects are revalidated hop by hop;
- the API key never leaves the Host: the page only learns whether a key is configured, and under which reference.

**Scope of the address check.** It is a convenience guard, not a security
boundary. Whoever sets `baseURL` installed the plugin and owns the machine, so
they are allowed to point it at their own gateway — that is what
`allowPrivateBaseURL` is for. The check exists to stop an accidental address
from silently reaching something local, and it stays deliberately simple:
literals only, no DNS resolution. A hostname that resolves to a private address
is not detected, and is not meant to be.

Report a vulnerability through the repository's issues, or privately to the maintainer for anything exploitable.

---

## Gemini and the `max` level

Google's API has no `max` thinking tier. Its [thinking guide](https://ai.google.dev/gemini-api/docs/thinking) publishes a per-model table:

| Model | Levels supported |
| --- | --- |
| `gemini-4-argon` | `low`, `medium`, `high` |
| `gemini-3.8-flash` | `low`, `medium`, `high` |
| `gemini-3.5-flash-lite` | `minimal`, `low`, `medium`, `high` |
| `gemini-3.6-flash` | `minimal`, `low`, `medium`, `high` |
| `gemini-3-pro-preview` | `low`, `high` |

Gemini 2.x used a numeric `thinkingBudget`; Gemini 3.x uses `thinkingLevel`, and `thinking_level: "max"` is not part of the API. Earlier versions of this plugin offered `max` for Gemini because the gateway happened to accept the spelling on its Chat Completions route — that was a gateway quirk, not a Gemini level, and it has been removed: the ladder now stops at `high`, with `minimal` where Google documents it.

The same reasoning applies to the rest of the ladder: `xhigh` is offered for OpenAI, Claude and Grok because those vendors document it, and not for DeepSeek or GLM, which map it onto a level they already have.

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
