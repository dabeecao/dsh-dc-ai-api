# DC AI API Plugin for DeepSeek Harness (DSH)

<p align="center">
  <img src="./icon.svg" width="80" height="80" alt="DC AI API Logo" />
</p>

Integrates the **DC AI Gateway** (`https://dc-ai.dabeecao.org`) into DeepSeek Harness as a native model provider. Discovers every model the gateway serves, derives a reasoning (thinking) ladder per model family, detects vision support, and adds a quota, usage, and cost dashboard under **Settings → DC AI API**.

---

## Features

- **One provider route** (`dc-ai`) written into `llm-pi-ai` through the settings service — no duplicate entries in the model picker.
- **Four wire protocols, switchable from the settings page** — the gateway serves each vendor's own API from the same host, so the choice is per install:

  | Protocol | Endpoint the client calls | Auth | Notes |
  | --- | --- | --- | --- |
  | `openai-responses` (default) | `/responses` | `authorization: Bearer` | Keeps reasoning state across turns. |
  | `openai-completions` | `/chat/completions` | `authorization: Bearer` | Widest third-party model compatibility. |
  | `anthropic-messages` | `/v1/messages` | `x-api-key` | Native thinking blocks, `tool_use`, prompt caching. |
  | `google-generative-ai` | `/v1beta/models/<id>:…` | `x-goog-api-key` | Native roles, `functionCall` parts, `thinkingConfig`. |

  The protocol changes four things beyond the path, and each is derived rather than asked for: the endpoint root (each SDK appends its own version segment), the auth header, the model-listing shape, and the thinking vocabulary. Gemini accepts only `minimal`/`low`/`medium`/`high`, so a vendor level with no Google spelling is dropped from that protocol's ladder rather than advertised and then thrown on at request time. Compat switches a protocol does not declare are dropped on switch, because `llm-pi-ai` refuses a per-model field its protocol does not take — switching would otherwise be a failed settings write rather than a working route.
- **Per-family reasoning ladder**, taken from each vendor's own API reference — not from probing the gateway:

  | Family | Levels | Source |
  | --- | --- | --- |
  | DeepSeek | `none` / `low` / `high` / `max` | [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion) |
  | OpenAI (GPT, o-series) | `low` / `medium` / `high` / `xhigh` / `max` | [Reasoning guide](https://platform.openai.com/docs/guides/reasoning) |
  | Google Gemini | per model: `low` / `medium` / `high`, plus `minimal` on Flash and Flash-Lite, plus `xhigh` on Neon and Hydrogen | [Gemini thinking](https://aistudio.google.com/docs/thinking) |
  | Anthropic Claude | `low` / `medium` / `high` / `xhigh` / `max`, with `xhigh` only from Opus 4.7 / Sonnet 5 / Haiku 5.5 onward | [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) |
  | xAI Grok | `low` / `medium` / `high` / `xhigh`, where `xhigh` needs 4.6+ | [Reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
  | Zhipu GLM | `low` / `high` / `max` | [Deep Thinking](https://docs.z.ai/guides/capabilities/thinking) |
  | Qwen and unrecognised models | a single thinking level (the vendor documents a toggle, not an effort scale) | Alibaba Model Studio |
  | Non-reasoning models | `reasoningEfforts: false` | — |

  A level appears only when the vendor documents it. `off` appears only where the vendor has a spelling that actually disables thinking (`none`); elsewhere the ladder starts at the vendor's lowest real level, because an `off` that merely omits the field would fall back to the vendor's default (thinking on) and misreport what the request does.

  A family row is that vendor's current-generation set, not a promise for every model. Where a vendor's own page narrows or widens it, the model gets its own ladder — the same rule that gives Gemini its per-model table:

  | Model | Ladder | Why |
  | --- | --- | --- |
  | `claude-opus-4-6`, `claude-sonnet-4-6` | `low` / `medium` / `high` / `max` | Anthropic: "Not every model that supports `max` supports `xhigh`" — 4.6 has `max`, not `xhigh`. |
  | `glm-5.3`, `glm-5.3-flash` | `low` / `high` / `max` | Z.AI documents exactly these three and says anything else errors; these models also no longer allow thinking to be turned off. |
  | `grok-4.5` | `low` / `medium` / `high` | `xhigh` arrived in 4.6; xAI silently downgrades it to `high` on 4.5. |

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
| `api` | `openai-responses` | `openai-responses`, `openai-completions`, `anthropic-messages`, or `google-generative-ai`. |
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

## Wire protocols

All four protocols below reach the same gateway; the choice is which vendor's
wire format this route speaks. Switching is a settings change with no restart.

| Protocol | Client endpoint | Auth header | Thinking control |
| --- | --- | --- | --- |
| `openai-responses` | `<root>/responses` | `authorization: Bearer` | `reasoning.effort` |
| `openai-completions` | `<root>/chat/completions` | `authorization: Bearer` | `reasoning_effort` |
| `anthropic-messages` | `<root>/v1/messages` | `x-api-key` + `anthropic-version` | `thinking` budget, or adaptive effort |
| `google-generative-ai` | `<root>/v1beta/models/<id>:streamGenerateContent` | `x-goog-api-key` | `thinkingConfig.thinkingLevel` |

**The address you type is not the address a client receives.** Each SDK appends
its own version segment, and they disagree: Anthropic's always adds `/v1`, so a
`/v1` root would request `/v1/v1/messages`; Google's appends only
`/models/<id>`, so `/v1beta` must be in the root. `resolveRouteBaseURL()` derives
the right form from one configured address, which is why switching protocol
never needs the address edited, and why the derivation is idempotent — an
address already carrying the right prefix stays as written.

**Ladders are rewritten for the protocol, not the other way round.** The model's
capability is a vendor fact; the wire format decides how to spell it. Gemini's
API accepts only `minimal`/`low`/`medium`/`high` and pi-ai throws at request
time on anything else, so a vendor level the endpoint has no spelling for is
**dropped** from that protocol's ladder — not relabelled. `gemini-4-hydrogen`
and `gemini-4-neon` therefore offer four levels on the OpenAI and Anthropic
wires, where `xhigh` is sent as `effort`/`reasoning_effort`, and three on
`google-generative-ai`.
Clamping to `high` remains only as a last resort, when dropping would leave a
model with no reasoning at all (a ladder consisting of `max` alone). Every other
protocol gets the vendor spelling verbatim.

**Compat switches are filtered per protocol.** `llm-pi-ai` refuses a per-model
`compat` field its protocol does not declare, so a block preserved from a
previous protocol (say `chatTemplateKwargs` from Completions) is dropped on
switch instead of failing the settings write. `google-generative-ai` takes no
compat at all, and its profile therefore carries none.

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

## Gemini, `xhigh`, and the `max` level

Google's API has no `max` thinking tier. Its [thinking guide](https://aistudio.google.com/docs/thinking) publishes a per-model table, and `xhigh` is the one level that varies within a family:

| Model | Default | Levels supported |
| --- | --- | --- |
| `gemini-4-neon` | `high` | `low`, `medium`, `high`, **`xhigh`** |
| `gemini-4-hydrogen` | `high` | `low`, `medium`, `high`, **`xhigh`** |
| `gemini-4-argon` | `medium` | `low`, `medium`, `high` |
| `gemini-4-carbon` | `medium` | `low`, `medium`, `high` |
| `gemini-3.8-flash` | `medium` | `low`, `medium`, `high` |
| `gemini-3.6-flash` | `medium` | `minimal`, `low`, `medium`, `high` |
| `gemini-3.5-flash-lite` | `minimal` | `minimal`, `low`, `medium`, `high` |
| `gemini-3-pro-preview` | `high` | `low`, `high` |

Only **neon** and **hydrogen** have `xhigh`; argon and carbon stop at `high`. The
guide says so twice — in the table above and in its prose: `xhigh` is "supported
on `gemini-4-neon` and `gemini-4-hydrogen`", while `minimal` is "not supported on
Gemini 4 models or `gemini-3.8-flash`". Offering a level a model does not take is
not cosmetic: the request fails, and a gateway can surface that as
`502 — all upstream providers failed`, which reads like an outage rather than a
bad parameter — a working model presented as a broken one. That is why the
per-model table exists rather than one Gemini-wide ladder.

Gemini 2.x used a numeric `thinkingBudget`; Gemini 3.x uses `thinkingLevel`, and `thinking_level: "max"` is not part of the API. Earlier versions of this plugin offered `max` for Gemini because the gateway happened to accept the spelling on its Chat Completions route — that was a gateway quirk, not a Gemini level, and it has been removed: the ladder now stops at `high`, with `minimal` where Google documents it.

The same reasoning applies to the rest of the ladder: `xhigh` is offered for OpenAI, Claude and Grok because those vendors document it, and not for DeepSeek or GLM, which map it onto a level they already have.

**`xhigh` on neon and hydrogen depends on the protocol, and that is deliberate.**
Capability is a vendor fact — the guide documents four levels for these two
models — while the wire format only decides how to spell it. The three
OpenAI/Anthropic wires carry effort as an ordinary request field
(`reasoning_effort`, `reasoning.effort`, `output_config.effort`), so they keep
all four levels verbatim. Google's own wire format has only four spellings and
pi-ai throws on anything else, so the level is dropped from their ladders there
rather than relabelled — the UI offers exactly the levels the selected protocol
can send. Want `xhigh`? Use `openai-responses`, `openai-completions`, or
`anthropic-messages`.

## Development

```bash
npm test          # unit tests: catalog helpers, base-URL policy, route guard
npm run check     # syntax check + tests
npm run snapshot  # regenerate lib/snapshot.json (needs DC_AI_API_KEY)
```

`lib/catalog.js` is pure apart from its fetchers, so the snapshot generator and the running plugin share one mapping. `test/plugin.test.mjs` drives `apply()` with a stub Cordis context, so route behaviour is covered without booting DSH.

The protocol layer is unit-tested for the parts that are easy to get subtly
wrong: the endpoint root each SDK expects (including idempotence, so a
re-switch never stacks `/v1` or `/v1beta`), the auth header and listing shape
each native endpoint answers, the Gemini ladder's drop-versus-clamp rules
(including that the outcome does not depend on declaration order), and the
per-protocol compat filter. Live verification during development streamed one
request through every protocol for Claude, Gemini, GPT, DeepSeek, GLM and Grok,
at every level each ladder advertises; `deepseek` and `glm` are the models the
gateway cannot translate onto the Gemini wire format, which is a gateway
limitation rather than a plugin one.

---

## License

[MIT](./LICENSE) © 2026 [dabeecao](https://github.com/dabeecao)
