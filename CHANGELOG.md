# Changelog

## 1.2.2 — 2026-11-02

### Added

- First-run setup gate: until an API key is configured, the settings page
  shows one focused connect card (localized en/zh/vi) instead of a dashboard
  of offline data.

### Optimized

- A sync without a resolved API key no longer sends the gateway a request it
  must refuse: it serves the bundled catalog immediately and reports the
  missing key.
- Test connection reports `MISSING_KEY` up front — localized on the page —
  instead of fetching unauthenticated and failing with a credential error.
- The models.dev index is built once per cached payload instead of on every
  sync (a WeakMap keyed by the immutable catalog object).
- A rejected credential (401/403) stops the model-list probe immediately
  instead of repeating the refusal on the fallback path.
- The bundled snapshot cache no longer memoizes a failed read; the next sync
  retries it.
- The settings page's one-second ticker only runs while a quota countdown is
  actually on screen.
- The gateway and models.dev fetches each get the full request timeout instead
  of sharing one deadline.

## 1.2.1 — 2026-11-02

### Fixed

- A settings write issued during an HMR reload was refused with "HMR
  transactions cannot be nested", so the provider profile silently kept the
  previous reasoning ladder. Writes now wait for the reload transaction to
  drain and retry, and a sync that still loses the race schedules one more
  attempt instead of giving up.

## 1.2.0 — 2026-11-01

Reasoning levels now come from each vendor's own API reference instead of from
probing the gateway.

### Changed

- **Gemini no longer offers `max`.** Google's thinking guide lists
  `low`/`medium`/`high` for `gemini-4-argon` and `gemini-3.8-flash`, and
  `minimal`/`low`/`medium`/`high` for the Flash-Lite line. `max` was never a
  Gemini level; the gateway merely accepted the spelling.
- **`minimal` is offered where Google documents it** (Flash and Flash-Lite),
  and the per-model table is honoured — `gemini-3-pro-preview`, for example,
  only has `low`/`high`.
- **`xhigh` is offered for OpenAI, Claude, and Grok**, which all document it.
- **DeepSeek gains `low`**, and its `off` now sends `none`, which really
  disables thinking.
- **GLM is its own family**: `none`/`high`/`max`, with `low` and `medium`
  mapped onto `high` upstream.
- **Qwen and unrecognised models offer a single thinking level**, because the
  vendor documents a toggle (`enable_thinking` + `thinking_budget`), not an
  effort scale.
- **`off` appears only where the vendor has a spelling that disables
  thinking.** Elsewhere it merely omitted the field and fell back to the
  vendor's default (thinking on), so the UI claimed to disable something it did
  not. Grok has no `off` at all — xAI states reasoning cannot be disabled.

## 1.1.0 — 2026-11-01

Security and correctness pass over the whole plugin.

### Security

- The five `/dc-ai-api/*` routes now pass `ctx.connection.admit()`, the same
  Host/Origin fence and signed-session check that guards `/api`. An
  unauthenticated browser gets `401`, a cross-site origin `403`.
- Removed `Access-Control-Allow-Origin: *` and the cross-site preflight. Before
  this, any website could repoint `baseURL` and receive the API key on the next
  request.
- `baseURL` is validated before any request: `http(s)` only, no embedded
  credentials, `https` for public hosts, and loopback / RFC 1918 / link-local /
  IPv6 unique-local targets refused unless `allowPrivateBaseURL` is enabled.
  Redirects are revalidated hop by hop.
- Removed the `debug()` logger that wrote the API key to
  `/workspace/dc-ai-api/debug.log`.
- The API key lives only in the credential store; `Config.apiKey` and the
  `apiKeyMasked` field are gone.

### Fixed

- Settings edits are persisted through `ctx.settings.update()`; they previously
  lived in memory and were lost on restart, then overwritten by the next sync.
- Settings writes are awaited, retried on `SETTINGS_CONFLICT`, and their failure
  reaches the page instead of being reported as success.
- `.volatile()` config fields are read through `.get()`; every option used to
  fall back to its default.
- Schemastery resolves from the running installation instead of a hardcoded
  `/opt/dsh` path.
- `/v1/models` is probed before `/models`, and a rejected credential is reported
  instead of silently falling back to the bundled snapshot.
- models.dev is cached for 6 hours and revalidated with `If-None-Match`.
- `maxTokens` is clamped to the context window.
- The provider profile is written only into a namespace the LLM service
  advertises for this route.
- User-tuned provider `compat` is merged instead of overwritten.

### Added

- Quota countdowns tick from absolute reset timestamps.
- Missing quota values render as `—` instead of a fabricated `$41.67` / `$200`.
- The page shows whether the catalog is live or the bundled snapshot, plus the
  last error.
- Locale support through `ctx.locale`: English and Chinese ship with the bundle,
  Vietnamese is a language pack, and the section follows
  **Settings → General → Language**.
- Accessibility: real buttons and radios, `htmlFor`, `aria-live`,
  `role="progressbar"`.
- 19 unit tests, `npm test` / `npm run check` scripts, and a `zh` locale file.

## 1.0.0

Initial release.
