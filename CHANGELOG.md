# Changelog

## 1.2.5 — 2026-11-08

### Changed

- **The address check was simplified back to a convenience guard.** The previous
  release grew it into an allowlist with a full IPv6 parser, NAT64/6to4/Teredo
  decoding and a documented DNS-rebinding gap. That was the wrong frame: the
  person who sets `baseURL` is the person who installed the plugin and owns the
  machine, so there is no trust boundary to defend — they are *allowed* to reach
  their own gateway, which is what `allowPrivateBaseURL` is for. The check now
  covers loopback, RFC 1918 and link-local literals (including IPv4-mapped IPv6)
  and stops there. User-visible behaviour is unchanged; roughly 60 lines, a
  parser and a dozen tests are gone.

- **`allowPrivateBaseURL` is now a switch on the settings page** instead of a
  config-file-only field. A user who self-hosts the gateway on localhost or a
  LAN address could previously only enable it by editing `cordis.patch.yml` or
  calling the route by hand — while the error message told them to enable it.
  The error now names the switch and where to find it.
- **`modelsDevURL` is no longer configurable.** Whether to consult models.dev is
  the `useModelsDev` switch; where it lives is not a user decision. The URL is a
  constant, and it never accepts a private target even when
  `allowPrivateBaseURL` is on: the catalog is a public resource, so the switch
  that exists to reach your own gateway must not widen a second SSRF path.
- The two switches are exposed on **Connection & API Key** and reported by
  `/state`, so the page reflects the stored configuration instead of assuming.

## 1.2.4 — 2026-11-07

### Security

- **The base-URL filter let IPv4-mapped IPv6 addresses through.** `isPrivateIPv6`
  only matched the dotted-quad spelling (`::ffff:127.0.0.1`), but the WHATWG URL
  parser canonicalizes that to `::ffff:7f00:1` before the value reaches the
  filter, so the check was dead code: `https://[::ffff:127.0.0.1]/`,
  `https://[::ffff:a9fe:a9fe]/` (cloud metadata) and the whole RFC 1918 range in
  that form were accepted without `allowPrivateBaseURL`. Both spellings are now
  decoded.
- **The address filter is now an allowlist.** The previous version enumerated
  forbidden ranges, so every review found another spelling that slipped through
  (`::ffff:7f00:1`, then `::7f00:1`, NAT64, 6to4, `fe8::1`, ...). An IP literal
  is now accepted only when it is globally routable: IPv4 outside every
  special-purpose block, IPv6 inside `2000::/3`. Anything unenumerated is
  refused by default, and IPv6 literals are decoded to their eight groups
  instead of being matched as text, so equivalent spellings cannot diverge.
- **Three more IPv6 forms carrying an IPv4 address were also accepted:** the
  deprecated IPv4-compatible spelling (`::127.0.0.1` → `::7f00:1`), the NAT64
  well-known prefix (`64:ff9b::7f00:1`, RFC 6052) and 6to4 (`2002:7f00:1::`,
  RFC 3056) all reach 127.0.0.1 and are now decoded to their IPv4 target and
  judged by the IPv4 policy.
- **Compressed IPv6 forms defeated the range checks.** `fe8::1` (the same
  address as `fe80::1`) slipped past a link-local regex that required four hex
  digits, and the same held for the `f[cd]`, `fe[c-f]` and `ff` prefixes. Those
  matchers now accept the compressed form, and documentation space
  (`2001:db8::/32`) and the discard-only prefix (`100::/64`) are refused too.
- **`modelsDevURL` bypassed the URL policy entirely.** `fetchModelsDev` called
  the bare `fetch()` while every other request went through `safeFetch`, so
  pointing the settings field at `http://169.254.169.254/…` made the plugin fetch
  it — an SSRF vector independent of `baseURL`, with no redirect revalidation.
  It now goes through the same policy and hop-by-hop redirect check.

### Fixed

- A `200` response carrying an HTML error page surfaced as
  `SyntaxError: Unexpected token '<'`. Responses are now parsed through a helper
  that reports which endpoint answered with a non-JSON body.
- An empty (but syntactically valid) models.dev payload — `{}` or `[]` — was
  cached for the full six-hour TTL and silently stripped every model of its
  capabilities. A payload with no provider models is now rejected, keeping the
  previous good copy.
- The refresh button reported "Refreshed" even when every request failed: both
  helpers swallowed their own errors, so `Promise.all` never rejected and the
  success notice was set unconditionally. Success is now driven by their real
  outcome, and a success notice never renders next to an error banner.
- A missing quota rendered as `0%` used and "reset in 0m" instead of "—",
  contradicting the module's own rule that no value is fabricated. An unknown
  percentage now draws an undetermined bar, and an unknown reset time shows "—".
- The source badge hard-coded "—"; it now uses the `status.never` string that
  was already translated in all three languages.
- The settings tablist lacked `aria-controls`/`aria-labelledby` and arrow-key
  navigation, which the ARIA Authoring Practices require for a tablist.

## 1.2.3 — 2026-11-07

### Fixed

- The settings page could report **"Last error: no API key resolved for
  DC_AI_API_KEY"** immediately after a key was successfully saved and accepted
  by the gateway. Two independent causes:
  - a missing key was recorded as a *sync error*, so the keyless startup sync
    that runs before the key is picked up raised a red banner that contradicted
    the "online" badge and the setup gate. A missing key is now a state
    (`reason: 'no-key'`), never an error, and `getState()` never reports an
    error recorded while no key resolved;
  - `POST /dc-ai-api/sync` overwrote the state's `lastError` with `null`
    whenever the sync returned without an `error` field — which is every
    successful sync that had nothing to write. A genuine snapshot-fallback
    error was therefore erased on the second sync, and the banner flickered.
    The route now only adds an error for a sync that failed outright.
- Saving a key waited for the credential store to read the value back before
  the settings reload could start a sync, so the reload no longer races the
  write and sees an empty store.
- A no-op sync (signature already matching) now records the catalog outcome
  instead of leaving the previous sync's error in place.

## 1.2.2 — 2026-11-02

### Added

- First-run setup gate: until an API key is configured, the settings page
  shows one focused connect card (localized en/zh/vi) instead of a dashboard
  of offline data.
- Submitted API keys are verified against the gateway before anything is
  stored, and the write is refused unless the gateway accepts the key: an
  explicit credential rejection reports `INVALID_KEY`, any other verification
  failure (unreachable, timeout) reports `VERIFY_FAILED` — both localized on
  the page, so a wrong key or a wrong base URL can neither be saved nor open
  the setup gate.

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
