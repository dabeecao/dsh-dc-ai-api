/**
 * Model-catalog discovery for the DC AI API bundle.
 *
 * Two sources are joined here:
 *
 * - the gateway's own `GET /models`, which is authoritative for the model ids
 *   it serves, their context window, and whether the proxy advertises
 *   `supports_thinking`;
 * - the public models.dev catalog, which supplies the pretty model name,
 *   declared output limit, and — crucially — the input modalities that let a
 *   model be recognised as vision-capable without hand maintenance.
 *
 * The endpoint never reports modalities, so a model missing from models.dev is
 * treated as text-only unless its own description clearly says otherwise.
 *
 * Everything in this module is pure apart from the fetchers, which makes the
 * snapshot generator and the running plugin share exactly one mapping.
 *
 * @module dsh-dc-ai-api/catalog
 */

/** Context capacity assumed when neither source sizes a model. */
export const DEFAULT_CONTEXT_WINDOW = 262144

/** Output capability assumed when neither source sizes a model. */
export const DEFAULT_MAX_TOKENS = 32768

/**
 * Every level a model may declare, in escalation order. This is the vocabulary
 * the harness accepts; which of them a given model offers is decided per vendor
 * in `resolveReasoningEfforts`.
 */
export const REASONING_LEVELS = Object.freeze([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

/**
 * Wire protocols this plugin can publish, in the order the settings page shows
 * them.
 *
 * Each name is one pi-ai API implementation the host constructs for a
 * hand-declared route:
 *
 * | Protocol              | Endpoint the client builds        | Auth header       |
 * | --------------------- | --------------------------------- | ----------------- |
 * | `openai-responses`    | `<root>/responses`                | `authorization`   |
 * | `openai-completions`  | `<root>/chat/completions`         | `authorization`   |
 * | `anthropic-messages`  | `<root>/v1/messages`              | `x-api-key`       |
 * | `google-generative-ai`| `<root>/v1beta/models/<id>:…`     | `x-goog-api-key`  |
 *
 * The endpoint column is why {@link resolveRouteBaseURL} exists: the gateway
 * serves one host under three version paths, and the two native SDKs append
 * their own version segment.
 */
export const SUPPORTED_APIS = Object.freeze([
  'openai-responses',
  'openai-completions',
  'anthropic-messages',
  'google-generative-ai',
])

/**
 * Compat switches each protocol accepts, mirroring the gates in
 * `@deepseek-ai/dsh-llm-pi-ai` (`COMPAT_GATES`). A field outside its protocol's
 * set is refused by that adapter's validation, so anything this plugin writes
 * has to be filtered first — including a per-model block preserved from a
 * profile stored for a different protocol.
 *
 * `google-generative-ai` is deliberately empty: pi-ai gives that protocol no
 * compat type at all, so the only valid setting is none. The Gemini wire format
 * is what it is.
 *
 * This table is a copy of the host's, and copies drift. It is only used to
 * avoid writing a refused key; a field missing here is dropped rather than
 * sent, which is the safe direction of the mismatch.
 */
const PROTOCOL_COMPAT_FIELDS = Object.freeze({
  'openai-completions': Object.freeze([
    'supportsStore',
    'supportsDeveloperRole',
    'supportsReasoningEffort',
    'supportsUsageInStreaming',
    'supportsFinishReason',
    'maxTokensField',
    'requiresToolResultName',
    'requiresAssistantAfterToolResult',
    'requiresThinkingAsText',
    'requiresReasoningContentOnAssistantMessages',
    'thinkingFormat',
    'chatTemplateKwargs',
    'chatTemplateArgs',
    'supportsThinkingTokenBudget',
    'thinkingTokenBudgetField',
    'vllmPriority',
    'supportsStrictMode',
    'cacheControlFormat',
    'supportsLongCacheRetention',
  ]),
  'openai-responses': Object.freeze([
    'supportsDeveloperRole',
    'supportsMaxOutputTokens',
    'supportsStrictMode',
    'supportsLongCacheRetention',
  ]),
  'anthropic-messages': Object.freeze([
    'supportsEagerToolInputStreaming',
    'supportsLongCacheRetention',
    'supportsCacheControlOnTools',
    'supportsTemperature',
    'forceAdaptiveThinking',
    'allowEmptySignature',
    'supportsStrictTools',
  ]),
  'google-generative-ai': Object.freeze([]),
})

/**
 * Normalize a configured protocol name.
 *
 * Absent names the default so an older patch file — one written before the
 * native protocols existed — keeps meaning what it meant.
 * @param {unknown} value - configured `api`.
 * @returns {string} a member of {@link SUPPORTED_APIS}.
 */
export function normalizeApi(value) {
  return SUPPORTED_APIS.includes(value) ? value : SUPPORTED_APIS[0]
}

/**
 * Whether a value names a protocol this plugin can publish.
 * @param {unknown} value - candidate.
 * @returns {boolean} true when it is a supported protocol.
 */
export function isSupportedApi(value) {
  return SUPPORTED_APIS.includes(value)
}

/**
 * Split a gateway address into its root and a trailing version segment.
 *
 * `https://gateway/v1`, `https://gateway/v1beta`, and `https://gateway` are the
 * same gateway written three ways. Every protocol resolves from the root so
 * switching protocols never requires editing the address, and so the same
 * choice round-trips without stacking prefixes.
 * @param {string} baseURL - validated gateway address.
 * @returns {{ root: string, version?: string }} the address without its version segment.
 */
function splitVersion(baseURL) {
  const normalized = String(baseURL).replace(/\/+$/, '')
  const match = /^(.*?)\/(v1(?:beta|alpha)?\d*)$/i.exec(normalized)
  if (!match || match[1].length === 0) return { root: normalized }
  return { root: match[1], version: match[2].toLowerCase() }
}

/**
 * Resolve the endpoint root one protocol's client should be handed.
 *
 * Each client appends its own version segment, and they disagree:
 *
 * | Protocol               | Client appends            | Root to hand over |
 * | ---------------------- | ------------------------- | ----------------- |
 * | `openai-responses`     | `/responses`              | gateway root (or `/v1`) |
 * | `openai-completions`   | `/chat/completions`       | gateway root (or `/v1`) |
 * | `anthropic-messages`   | `/v1/messages`            | gateway root |
 * | `google-generative-ai` | `/models/<id>:…`          | gateway root + `/v1beta` |
 *
 * The OpenAI clients take either spelling, so a `/v1` the user wrote is kept
 * verbatim rather than rewritten. Anthropic's SDK always adds `/v1`, so handing
 * it a `/v1` root would request `/v1/v1/messages`; the version is stripped
 * first. The Gemini client is handed a version-less base URL and told not to
 * append one, so `/v1beta` belongs in the root.
 *
 * The function is idempotent: resolving an already-resolved root yields the
 * same string, which is what lets the settings page persist either spelling.
 * @param {string} baseURL - validated gateway address.
 * @param {string} api - one of {@link SUPPORTED_APIS}.
 * @returns {string} the base URL to store on the provider profile.
 */
export function resolveRouteBaseURL(baseURL, api) {
  const { root, version } = splitVersion(baseURL)
  if (api === 'google-generative-ai') return `${root}/v1beta`
  if (api === 'anthropic-messages') return root
  // An OpenAI-style address keeps the `/v1` the user wrote: both spellings are
  // served, and preserving it keeps an exotic gateway on its configured path.
  return version === 'v1' ? `${root}/v1` : root
}

/**
 * Compat switches a protocol accepts, as a set for cheap lookup.
 * @param {string} api - wire protocol.
 * @returns {Set<string>} accepted field names; empty for a protocol without compat.
 */
function compatFieldsFor(api) {
  return new Set(PROTOCOL_COMPAT_FIELDS[api] ?? [])
}

/**
 * Drop compat switches the given protocol does not accept.
 *
 * Two places need this. A profile preserved from a previous protocol carries
 * switches shaped for it (`supportsReasoningEffort` has no meaning on the
 * Anthropic wire format), and pi-ai's model resolution *rejects* a per-model
 * switch its protocol does not declare — so passing the block through would
 * turn a protocol switch into a failed settings write instead of a working
 * route.
 * @param {unknown} compat - candidate compat block.
 * @param {string} api - wire protocol.
 * @returns {object | undefined} the accepted subset, or undefined when empty.
 */
export function filterCompatForApi(compat, api) {
  if (!compat || typeof compat !== 'object' || Array.isArray(compat)) return undefined
  const allowed = compatFieldsFor(api)
  const kept = {}
  for (const [field, value] of Object.entries(compat)) {
    if (allowed.has(field) && value !== undefined) kept[field] = value
  }
  return Object.keys(kept).length > 0 ? kept : undefined
}

/**
 * Rewrite one reasoning ladder into the vocabulary its wire format accepts.
 *
 * The ladder describes a model's capability; the protocol decides how that
 * capability is spelled. Gemini's wire format has only four spellings
 * (`minimal`/`low`/`medium`/`high`), and pi-ai throws at request time on
 * anything else — so a vendor level with no Google spelling cannot be sent and
 * must not be advertised.
 *
 * Two outcomes cover that, and the difference matters:
 *
 * - When a *neighbouring* level already spells the Google level the vendor
 *   level would fall back to (`gemini-4-hydrogen` has both `high` and `xhigh`,
 *   and `xhigh` has no Google spelling), the unsendable level is dropped. The
 *   ladder then reads `low`/`medium`/`high`, which is exactly what the Google
 *   endpoint can do — `xhigh` still appears on this model under the Anthropic
 *   and OpenAI protocols, where it is sent as `effort`/`reasoning_effort`.
 * - When dropping would leave nothing (`max` alone on a Gemini model), the
 *   level is clamped to `high` instead, so a model never loses reasoning
 *   entirely and the request still asks for the deepest thinking available.
 *
 * `off` stays `off`: the Gemini client disables thinking by sending a zero
 * budget, which is a real spelling of "off" and was measured to be accepted.
 *
 * Every other protocol passes the ladder through untouched: it takes the
 * vendor spelling as-is.
 * @param {object | false} efforts - level → wire spelling, or false.
 * @param {string} api - wire protocol.
 * @returns {object | false} the ladder in that protocol's vocabulary.
 */
export function adaptReasoningEfforts(efforts, api) {
  if (!efforts || typeof efforts !== 'object') return efforts
  if (api !== 'google-generative-ai') return efforts
  const adapted = {}
  /** Google level already claimed → the vendor level that claimed it. */
  const claimedBy = new Map()
  for (const [level, wire] of Object.entries(efforts)) {
    if (level === 'off') {
      adapted.off = null
      continue
    }
    const candidate =
      wire === null
        ? undefined
        : GOOGLE_THINKING_LEVELS.has(String(wire).toLowerCase())
          ? String(wire).toLowerCase()
          : GOOGLE_THINKING_LEVELS.has(level)
            ? level
            : 'high'
    if (candidate === undefined) continue
    const claimant = claimedBy.get(candidate)
    if (claimant === undefined) {
      adapted[level] = candidate
      claimedBy.set(candidate, level)
      continue
    }
    // Two vendor levels share this Google level. Keep the one whose name *is*
    // the Google spelling (that is the level the endpoint really has), and
    // drop the other rather than relabelling it — so `high` survives and
    // `xhigh` does not, independent of declaration order.
    if (claimant === candidate) continue
    if (level === candidate) {
      delete adapted[claimant]
      adapted[level] = candidate
      claimedBy.set(candidate, level)
    }
  }
  return Object.keys(adapted).length > 0 ? adapted : false
}

/**
 * Compat defaults one protocol needs in front of a private gateway.
 *
 * pi-ai decides these from the provider id and the base URL when nothing sets
 * them, and it recognises none of this gateway's addresses: an unrecognised
 * URL is treated as though it were OpenAI itself, which is wrong for every
 * protocol here. So the defaults are stated per protocol, and only where a
 * default must be corrected:
 *
 * - The OpenAI wires get `supportsDeveloperRole`, because the `developer` role
 *   is how pi-ai sends a system prompt to a reasoning model and this gateway
 *   forwards the role fine. Completions additionally gets the two switches
 *   that make usage accounting and `reasoning_effort` — the ladder's whole
 *   point — actually reach the model.
 * - Anthropic gets nothing: its compat fields are about beta features and
 *   cache markers that pi-ai's own defaults already describe correctly, and
 *   `supportsTemperature` defaults true, which this gateway honours.
 * - Gemini takes no compat at all.
 *
 * A human-tuned switch always wins over these defaults; they are a starting
 * point, not a policy.
 * @param {string} api - wire protocol.
 * @returns {object} default compat block, empty when the protocol takes none.
 */
export function defaultCompat(api) {
  const normalized = normalizeApi(api)
  if (normalized === 'openai-completions') {
    return {
      supportsDeveloperRole: true,
      supportsReasoningEffort: true,
      supportsUsageInStreaming: true,
    }
  }
  if (normalized === 'openai-responses') return { supportsDeveloperRole: true }
  return {}
}

/**
 * Levels the Gemini wire format understands.
 *
 * pi-ai resolves a Gemini thinking level by lower-casing the profile's wire
 * spelling and refusing anything outside this set, so a ladder that advertises
 * `xhigh` or `max` on the Gemini protocol throws at request time instead of
 * degrading. Clamping here is what keeps those models usable.
 */
const GOOGLE_THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high'])

/** Model ids that are clearly image-generation endpoints, not chat models. */
const IMAGE_MODEL_ID = /(^|[-_.])(image|imagine)([-_.]|$)/i

/** Description phrases that reliably imply image input support. */
const VISION_DESCRIPTION =
  /\b(vision|visual|multimodal|image input|input images?|accepts? images?|image understanding|image reasoning|text and image)\b/i

/**
 * Descriptions that explicitly rule images out. The gateway annotates finetunes
 * this way ("text input", "a text-only ... finetune"), and that statement beats
 * a models.dev record inherited from the base model the finetune derives from.
 */
const TEXT_ONLY_DESCRIPTION = /\btext[- ]only\b|\btext input\b/i

/** Model id patterns that indicate thinking / reasoning capabilities. */
const THINKING_MODEL_ID = /(^|[-_.])(thinking|reasoner|r1|o1|o3)([-_.]|$)/i

/** Description keywords indicating thinking / reasoning support. */
const THINKING_DESCRIPTION =
  /\b(thinking|reasoning|reasoner|thought|chain[- ]of[- ]thought)\b/i

/** Providers whose copy of a shared model id is generally the canonical one. */
const PREFERRED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'xai',
  'zhipuai',
  'alibaba',
  'moonshotai',
  'minimax',
  'mistral',
])

/** How long a models.dev payload stays fresh before a conditional revalidation. */
const MODELS_DEV_TTL_MS = 6 * 60 * 60 * 1000

/** Redirect hops a gateway request may follow. */
const MAX_REDIRECTS = 3

/** Hostnames that never belong to a public gateway. */
const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
])

/** models.dev payload cache: `{ body, etag, at }` keyed by URL. */
const modelsDevCache = new Map()

/**
 * Index cache keyed by the cached payload object itself: the payload is
 * immutable once stored, so a WeakMap lets a fresh catalog be indexed once and
 * every later sync reuse the maps without holding a stale payload alive.
 * @type {WeakMap<object, { exact: Map<string, object[]>, normalized: Map<string, object[]> }>}
 */
const modelsDevIndexCache = new WeakMap()

/**
 * Normalize a model id so the gateway's dotted spelling matches models.dev's
 * hyphenated one (for example `deepseek-v4.1-flash` vs
 * `deepseek-v4-1-flash`), and namespaced ids match their bare tail.
 * @param {string} id - raw model id.
 * @returns {string} comparison key.
 */
export function normalizeModelId(id) {
  const tail = String(id).toLowerCase().split('/').pop() ?? ''
  return tail
    .replace(/[._]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Whether an IP literal points at the local machine or a private network.
 *
 * This is a convenience guard, not a security boundary: the person who sets
 * `baseURL` is the person who installed the plugin and owns the machine, so
 * they are allowed to reach their own gateway — `allowPrivateBaseURL` exists
 * for exactly that. The check only keeps an accidental address from silently
 * pointing at something local, and it is deliberately simple. A hostname is
 * not resolved here; it is judged by the scheme rules instead.
 * @param {string} hostname - URL hostname.
 * @returns {boolean} true when the literal is loopback, private, or link-local.
 */
export function isPrivateHost(hostname) {
  const host = String(hostname).toLowerCase().replace(/^\.|\[|\]$/g, '').replace(/\.$/, '')
  if (host.length === 0) return true
  if (PRIVATE_HOSTNAMES.has(host)) return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true

  // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10),
  // and IPv4-mapped forms, which the URL parser rewrites to hex (`::ffff:7f00:1`).
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
    if (mapped) {
      const high = Number.parseInt(mapped[1], 16)
      const low = Number.parseInt(mapped[2], 16)
      return isPrivateIPv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`)
    }
    return false
  }
  return isPrivateIPv4(host)
}

/**
 * Whether a dotted-quad address is loopback, private, or link-local.
 * @param {string} host - dotted-quad hostname.
 * @returns {boolean} true for the ranges a self-hosted gateway would use.
 */
function isPrivateIPv4(host) {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Validate and normalize a gateway base URL.
 *
 * The value is user-supplied and later handed to `fetch`, so it is the one
 * place that can turn a settings field into a request against the host's own
 * network. Only `http(s)` is accepted, embedded credentials are refused, and a
 * loopback/private/link-local target needs an explicit opt-in.
 * @param {string} value - candidate base URL.
 * @param {{ allowPrivate?: boolean }} [options] - opt-in for private targets.
 * @returns {string} normalized base URL without a trailing slash.
 * @throws {Error} when the URL is unusable or targets a private address.
 */
export function validateBaseURL(value, options = {}) {
  let url
  try {
    url = new URL(String(value).trim())
  } catch {
    throw new Error('baseURL is not a valid absolute URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('baseURL must use http or https')
  }
  if (url.username || url.password) {
    throw new Error('baseURL must not embed credentials')
  }
  if (url.protocol === 'http:' && !options.allowPrivate && !isPrivateHost(url.hostname)) {
    throw new Error('baseURL must use https for a public gateway')
  }
  if (!options.allowPrivate && isPrivateHost(url.hostname)) {
    throw new Error(
      'this address is on a private or loopback network. If you self-host the gateway, turn on ' +
        '"Allow a private gateway address" in Settings → DC AI API → Connection & API Key.',
    )
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/**
 * Fetch a URL, validating every redirect hop against the same policy.
 * @param {string} url - absolute URL.
 * @param {RequestInit} init - fetch options.
 * @param {{ allowPrivate?: boolean }} [options] - redirect policy.
 * @returns {Promise<Response>} the final response.
 */
async function safeFetch(url, init, options = {}) {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, { ...init, redirect: 'manual' })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get('location')
    if (!location) return response
    if (hop === MAX_REDIRECTS) throw new Error('too many redirects')
    const next = new URL(location, current).toString()
    validateBaseURL(next, options)
    current = next
  }
  throw new Error('too many redirects')
}

/**
 * The auth headers one protocol's endpoint expects for a listing request.
 *
 * The gateway accepts a bearer token on every path, but a native endpoint does
 * not: Anthropic authenticates with `x-api-key` plus a version header, and
 * Google with `x-goog-api-key`. Sending the wrong one turns a readable catalog
 * into a 401 that reads like a bad credential.
 * @param {string | undefined} apiKey - resolved credential.
 * @param {string} api - wire protocol whose native list is being read.
 * @returns {Record<string, string>} headers for the request.
 */
function listingHeaders(apiKey, api) {
  const headers = { accept: 'application/json' }
  if (!apiKey) return headers
  if (api === 'google-generative-ai') {
    headers['x-goog-api-key'] = apiKey
    return headers
  }
  if (api === 'anthropic-messages') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    return headers
  }
  headers.authorization = `Bearer ${apiKey}`
  return headers
}

/**
 * Normalize one model record from any protocol's listing into `{ id }`.
 *
 * Google's listing identifies a model by `name: "models/<id>"` and never sets
 * `id`, so a catalog read through the Gemini endpoint would otherwise yield no
 * usable ids at all.
 * @param {object} entry - raw record.
 * @returns {object | undefined} the record with a usable `id`.
 */
function normalizeListingEntry(entry) {
  if (!entry || typeof entry !== 'object') return undefined
  if (typeof entry.id === 'string' && entry.id.length > 0) return entry
  if (typeof entry.name === 'string' && entry.name.length > 0) {
    return { ...entry, id: entry.name.replace(/^models\//, '') }
  }
  return undefined
}

/**
 * Read the gateway's model list.
 *
 * The path and the auth header both follow the configured protocol, because
 * each native endpoint answers its own spelling and refuses nothing politely:
 *
 * - OpenAI-style (`openai-responses`, `openai-completions`): `/v1/models`, then
 *   the bare `/models`, with a bearer token. The versioned spelling comes first
 *   because a gateway mounted under `/v1` answers the bare path with 401/403/404
 *   rather than a redirect.
 * - Anthropic: `/v1/models` with `x-api-key`.
 * - Google: `/v1beta/models` with `x-goog-api-key`.
 *
 * Only 404 falls through to the next spelling; a rejected credential stops
 * immediately, since it would be rejected on the fallback too.
 * @param {string} baseURL - gateway root, with or without a trailing slash.
 * @param {string | undefined} apiKey - credential; required by this gateway.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @param {{ allowPrivate?: boolean, api?: string }} [options] - base-URL policy
 *   and the protocol whose native listing to read.
 * @returns {Promise<object[]>} raw model records carrying an `id`.
 */
export async function fetchEndpointModels(baseURL, apiKey, signal, options = {}) {
  const api = normalizeApi(options.api)
  // The version segment is stripped first: `/v1` belongs to the path list
  // below, not to the root, so a user who pasted `…/v1` does not get
  // `…/v1/v1/models`.
  const root = splitVersion(validateBaseURL(baseURL, options)).root
  const headers = listingHeaders(apiKey, api)
  const paths = api === 'google-generative-ai' ? ['/v1beta/models'] : ['/v1/models', '/models']
  let lastError
  for (const path of paths) {
    const response = await safeFetch(`${root}${path}`, { headers, signal }, options)
    if (response.status === 401 || response.status === 403) {
      // A rejected credential stays rejected on the fallback path, so stop
      // instead of sending a second request the gateway must refuse again.
      const error = new Error(
        `DC AI rejected the credential (HTTP ${response.status}); check ${'the API key'}`,
      )
      error.code = 'CREDENTIAL_REJECTED'
      throw error
    }
    if (response.status === 404) {
      lastError = new Error(`DC AI ${path} returned HTTP 404`)
      continue
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `DC AI ${path} returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      )
    }
    const body = await readJson(response, `DC AI ${path}`)
    // Google answers `{ models: [...] }`; the OpenAI and Anthropic shapes both
    // use `{ data: [...] }`. A bare array is accepted for compatibility.
    const list = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.models)
          ? body.models
          : []
    return list.map(normalizeListingEntry).filter(Boolean)
  }
  throw lastError ?? new Error('DC AI model list is unavailable')
}

/**
 * Fetch billing subscription and quota limits from the gateway.
 * @param {string} baseURL - gateway root.
 * @param {string | undefined} apiKey - bearer token.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @param {{ allowPrivate?: boolean }} [options] - base-URL policy.
 * @returns {Promise<object>} subscription data.
 */
export async function fetchSubscription(baseURL, apiKey, signal, options = {}) {
  const root = validateBaseURL(baseURL, options)
  const headers = { accept: 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  const paths = ['/v1/dashboard/billing/subscription', '/dashboard/billing/subscription']
  let lastError
  for (const path of paths) {
    const response = await safeFetch(`${root}${path}`, { headers, signal }, options)
    if (response.status === 404) {
      lastError = new Error(`Billing subscription returned HTTP 404`)
      continue
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Billing subscription returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 150)}` : ''}`,
      )
    }
    return await readJson(response, 'Billing subscription')
  }
  throw lastError ?? new Error('Billing subscription is unavailable')
}

/**
 * Fetch usage, token counts, and recent window costs from the gateway.
 * @param {string} baseURL - gateway root.
 * @param {string | undefined} apiKey - bearer token.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @param {{ allowPrivate?: boolean }} [options] - base-URL policy.
 * @returns {Promise<object>} usage data.
 */
export async function fetchUsage(baseURL, apiKey, signal, options = {}) {
  const root = validateBaseURL(baseURL, options)
  const headers = { accept: 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  const paths = [
    '/v1/usage',
    '/usage',
    '/v1/dashboard/billing/usage',
    '/dashboard/billing/usage',
  ]
  let lastError
  for (const path of paths) {
    const response = await safeFetch(`${root}${path}`, { headers, signal }, options)
    if (response.status === 404) {
      lastError = new Error('Usage returned HTTP 404')
      continue
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Usage returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 150)}` : ''}`)
    }
    return await readJson(response, 'Usage')
  }
  throw lastError ?? new Error('Usage is unavailable')
}

/**
 * Fetch the public models.dev catalog, revalidating a cached copy when it is
 * older than the TTL. A failed refresh keeps serving the last good payload.
 *
 * The URL is fixed by the caller and never points at a private address: the
 * catalog is a public resource, so `allowPrivateBaseURL` — which exists so a
 * user can reach their own gateway — must not widen it into a second SSRF path.
 * @param {string} url - catalog URL, expected to be the public models.dev index.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<Record<string, unknown>>} provider keyed catalog.
 */
export async function fetchModelsDev(url, signal) {
  // Never `allowPrivate`: a private target is refused regardless of the gateway
  // setting, and redirects are revalidated against the same rule.
  const target = validateBaseURL(url)
  const cached = modelsDevCache.get(target)
  if (cached && Date.now() - cached.at < MODELS_DEV_TTL_MS) return cached.body
  const headers = { accept: 'application/json' }
  if (cached?.etag) headers['if-none-match'] = cached.etag
  try {
    const response = await safeFetch(target, { headers, signal })
    if (response.status === 304 && cached) {
      cached.at = Date.now()
      return cached.body
    }
    if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)
    const body = await readJson(response, 'models.dev')
    if (!isUsableCatalog(body)) throw new Error('models.dev returned an unusable catalog')
    modelsDevCache.set(target, { body, etag: response.headers.get('etag') ?? undefined, at: Date.now() })
    return body
  } catch (error) {
    if (cached) return cached.body
    throw error
  }
}

/**
 * Whether a models.dev payload carries at least one provider with models.
 *
 * A syntactically valid but empty payload (`{}`, `[]`, or a provider map with
 * no models) is worse than a failed fetch: it would be cached for the full TTL
 * and silently strip every model of its capabilities.
 * @param {unknown} body - parsed payload.
 * @returns {boolean} true when the payload can enrich a catalog.
 */
function isUsableCatalog(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false
  for (const provider of Object.values(body)) {
    const models = provider && typeof provider === 'object' ? provider.models : undefined
    if (models && typeof models === 'object' && Object.keys(models).length > 0) return true
  }
  return false
}

/**
 * Parse a JSON response, reporting a non-JSON body as a readable error.
 *
 * A gateway or proxy that answers with an HTML error page would otherwise
 * surface as `SyntaxError: Unexpected token '<'`, which says nothing about
 * which endpoint misbehaved.
 * @param {Response} response - fetch response.
 * @param {string} label - source name used in the error.
 * @returns {Promise<unknown>} parsed body.
 * @throws {Error} when the body is not JSON.
 */
async function readJson(response, label) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    const type = response.headers.get('content-type') ?? 'unknown'
    throw new Error(
      `${label} returned a non-JSON body (content-type: ${type}, ${text.length} bytes)`,
    )
  }
}

/**
 * Index models.dev entries by exact and normalized model id.
 * @param {Record<string, unknown> | undefined} catalog - models.dev payload.
 * @returns {{ exact: Map<string, object[]>, normalized: Map<string, object[]> }}
 */
export function indexModelsDev(catalog) {
  if (catalog && typeof catalog === 'object') {
    const cached = modelsDevIndexCache.get(catalog)
    if (cached) return cached
  }
  const exact = new Map()
  const normalized = new Map()
  for (const [providerId, provider] of Object.entries(catalog ?? {})) {
    const models = provider && typeof provider === 'object' ? provider.models : undefined
    if (!models || typeof models !== 'object') continue
    for (const [modelId, model] of Object.entries(models)) {
      if (!model || typeof model !== 'object') continue
      const record = { ...model, provider: providerId, modelId }
      if (!exact.has(modelId)) exact.set(modelId, [])
      exact.get(modelId).push(record)
      const key = normalizeModelId(modelId)
      if (!normalized.has(key)) normalized.set(key, [])
      normalized.get(key).push(record)
    }
  }
  const index = { exact, normalized }
  if (catalog && typeof catalog === 'object') modelsDevIndexCache.set(catalog, index)
  return index
}

/**
 * Pick the most informative models.dev copy of a shared model id.
 * @param {object[]} candidates - entries declaring the same id.
 * @returns {object | undefined} best entry.
 */
function pickBest(candidates) {
  let best
  let bestScore = -1
  for (const candidate of candidates) {
    let score = 0
    if (Array.isArray(candidate.modalities?.input) && candidate.modalities.input.length > 0) score += 4
    if (Number.isFinite(candidate.limit?.context) && candidate.limit.context > 0) score += 2
    if (Number.isFinite(candidate.limit?.output) && candidate.limit.output > 0) score += 1
    if (typeof candidate.reasoning === 'boolean') score += 1
    if (PREFERRED_PROVIDERS.has(candidate.provider)) score += 1
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/**
 * Resolve the models.dev record for one gateway model id.
 * @param {{ exact: Map<string, object[]>, normalized: Map<string, object[]> }} index - model index.
 * @param {string} id - gateway model id.
 * @returns {object | undefined} matched models.dev record.
 */
export function lookupModelsDev(index, id) {
  const exact = index.exact.get(id)
  if (exact && exact.length > 0) return pickBest(exact)
  const normalized = index.normalized.get(normalizeModelId(id))
  if (normalized && normalized.length > 0) return pickBest(normalized)
  return undefined
}

/**
 * Whether a gateway entry is an image-generation model rather than a chat
 * model, judged by its id and by models.dev's declared output modalities.
 * @param {object} model - gateway model record.
 * @param {object | undefined} dev - models.dev record.
 * @returns {boolean} true when the model must not appear in the chat catalog.
 */
export function isImageModel(model, dev) {
  if (IMAGE_MODEL_ID.test(String(model.id))) return true
  const output = dev?.modalities?.output
  return Array.isArray(output) && output.length > 0 && output.every((modality) => modality !== 'text')
}

/**
 * Detect image input support. models.dev is authoritative when it declares
 * input modalities; otherwise the model's own description is the only signal.
 * @param {object} model - gateway model record.
 * @param {object | undefined} dev - models.dev record.
 * @returns {boolean} whether the model accepts images.
 */
export function detectVision(model, dev) {
  const description = typeof model.description === 'string' ? model.description : ''
  if (TEXT_ONLY_DESCRIPTION.test(description)) return false
  const inputs = dev?.modalities?.input
  if (Array.isArray(inputs) && inputs.length > 0) return inputs.includes('image')
  return VISION_DESCRIPTION.test(description)
}

/**
 * Detect reasoning support. The gateway's own `supports_thinking` flag wins
 * because it describes the proxy actually serving the request; models.dev is
 * the fallback for entries the gateway does not annotate.
 * @param {object} model - gateway model record.
 * @param {object | undefined} dev - models.dev record.
 * @returns {boolean} whether the model supports reasoning effort.
 */
export function detectThinking(model, dev) {
  if (typeof model.supports_thinking === 'boolean') return model.supports_thinking
  if (dev?.reasoning === true) return true
  if (THINKING_MODEL_ID.test(String(model.id))) return true
  const description = typeof model.description === 'string' ? model.description : ''
  return THINKING_DESCRIPTION.test(description)
}

/**
 * Identify the model family that decides which reasoning ladder applies.
 * @param {object} model - gateway model record.
 * @param {object | undefined} dev - capability catalog record.
 * @returns {'deepseek' | 'openai' | 'gemini' | 'claude' | 'grok' | 'glm' | 'qwen' | 'other'} family id.
 */
export function modelFamily(model, dev) {
  const id = String(model.id).toLowerCase()
  const provider = String(dev?.provider ?? '').toLowerCase()
  if (id.includes('deepseek') || id.startsWith('r1') || id.includes('-r1') || provider === 'deepseek') {
    return 'deepseek'
  }
  if (
    id.startsWith('gpt-') ||
    id.includes('-gpt-') ||
    id.startsWith('o1') ||
    id.startsWith('o3') ||
    id.startsWith('o4') ||
    provider === 'openai'
  ) {
    return 'openai'
  }
  if (id.includes('gemini') || provider === 'google') return 'gemini'
  if (id.includes('claude') || provider === 'anthropic') return 'claude'
  if (id.includes('grok') || provider === 'xai') return 'grok'
  if (id.includes('glm') || provider === 'zhipuai' || provider === 'z-ai') return 'glm'
  if (id.includes('qwen') || provider === 'alibaba') return 'qwen'
  return 'other'
}

/**
 * Reasoning levels each vendor documents, taken from the vendor's own API
 * reference rather than from probing the gateway. The wire spelling of a level
 * is the level name itself, except where a vendor uses a different token for
 * "disable thinking" (`none`).
 *
 * | Family  | Levels                          | Source (accessed 2026-11-01) |
 * | ------- | ------------------------------- | ---------------------------- |
 * | DeepSeek| none / low / high / max         | api-docs.deepseek.com/api/create-chat-completion — `reasoning_effort` accepts `none`, `low`, `high`, `max`; `minimal`→`low`, `medium`/`xhigh`→`high` |
 * | OpenAI  | low / medium / high / xhigh / max | platform.openai.com/docs/guides/reasoning — supported values "can include none, minimal, low, medium, high, xhigh, and max", model-dependent |
 * | Gemini  | per model, see GEMINI_LEVELS    | ai.google.dev/gemini-api/docs/thinking — per-model "Levels Supported" table |
 * | Claude  | low / medium / high / xhigh / max | platform.claude.com/docs/en/build-with-claude/effort — five effort levels |
 * | Grok    | low / medium / high / xhigh     | docs.x.ai/docs/guides/reasoning — `xhigh` on grok-4.6+; "reasoning cannot be disabled" |
 * | GLM     | none / high / max               | docs.z.ai/guides/capabilities/thinking — `reasoning_effort` on GLM-5.2+; `low`/`medium`→`high`, `xhigh`→`max` |
 * | Qwen    | toggle only                     | Alibaba Model Studio exposes `enable_thinking` + `thinking_budget`, no effort enum |
 *
 * `off` appears only where the vendor documents a spelling that disables
 * thinking on the same field (`none`). Where a vendor has no such spelling the
 * ladder starts at its lowest real level: offering an `off` that only omits the
 * field would silently fall back to the vendor's default (thinking on) and
 * misreport what the request does.
 */
const FAMILY_EFFORTS = Object.freeze({
  deepseek: { off: 'none', low: 'low', high: 'high', max: 'max' },
  openai: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  gemini: { low: 'low', medium: 'medium', high: 'high' },
  claude: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  grok: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
  glm: { off: 'none', high: 'high', max: 'max' },
  qwen: { off: null, high: 'high' },
  other: { off: null, high: 'high' },
})

/**
 * Documented Gemini thinking levels per model.
 *
 * Google publishes a per-model "Levels Supported" table, and the sets differ:
 * Gemini 4 and 3.8 take `low`/`medium`/`high` with no `minimal`, while the
 * Flash-Lite and 3.x Flash lines also accept `minimal`. No Gemini model has a
 * `max` level — `thinking_level: "max"` is not part of the API at all.
 *
 * `xhigh` is the exception that has to be stated per model rather than per
 * family: only `gemini-4-hydrogen` documents it, and its two Gemini 4 siblings
 * reject it. The gateway answers a `thinkingLevel` it does not support with a
 * 502 ("all upstream providers failed"), which reads like an outage rather than
 * an unsupported level, so offering `xhigh` on argon or carbon would look like
 * a broken model instead of a wrong request.
 *
 * The gateway was measured (2026-11-13) rather than trusted here:
 *
 * | Model              | minimal | low | medium | high | xhigh |
 * | ------------------ | ------- | --- | ------ | ---- | ----- |
 * | `gemini-4-argon`   | ✗ 502   | ✓   | ✓      | ✓    | ✗ 502 |
 * | `gemini-4-hydrogen`| ✗ 502   | ✓   | ✓      | ✓    | ✓     |
 * | `gemini-4-carbon`  | ✗ 502   | ✓   | ✓      | ✓    | ✗ 502 |
 * | `gemini-3.5-flash-lite` | ✓  | ✓   | ✓      | ✓    | ✗     |
 *
 * On the Anthropic and OpenAI wire formats `xhigh` reaches hydrogen too
 * (`output_config.effort` / `reasoning_effort` both accepted it), so the level
 * stays in the ladder and {@link adaptReasoningEfforts} is what drops it on the
 * Gemini protocol — see there for why that is a wire limitation, not a
 * capability one.
 */
const GEMINI_LEVELS = Object.freeze({
  'gemini-4-argon': ['low', 'medium', 'high'],
  'gemini-4-hydrogen': ['low', 'medium', 'high', 'xhigh'],
  'gemini-4-carbon': ['low', 'medium', 'high'],
  'gemini-3.8-flash': ['low', 'medium', 'high'],
  'gemini-3.6-flash': ['minimal', 'low', 'medium', 'high'],
  'gemini-3.5-flash-lite': ['minimal', 'low', 'medium', 'high'],
  'gemini-3.1-pro-preview': ['low', 'medium', 'high'],
  'gemini-3.1-flash-lite-image': ['minimal', 'high'],
  'gemini-3-flash-preview': ['minimal', 'low', 'medium', 'high'],
  'gemini-3-pro-preview': ['low', 'high'],
  'gemini-2.5-pro': ['low', 'medium', 'high'],
  'gemini-2.5-flash': ['low', 'medium', 'high'],
  'gemini-2.5-flash-lite': ['low', 'medium', 'high'],
})

/**
 * Build the effort map for one Gemini model.
 *
 * An id this table does not list falls back to `low`/`medium`/`high`: a Gemini
 * model whose level set nobody has established is offered only the three every
 * Gemini 4 model accepts, so an unlisted release is usable rather than either
 * over-promising `xhigh` or hiding the model's reasoning entirely.
 * @param {string} id - gateway model id.
 * @returns {object} level → wire spelling.
 */
function geminiEfforts(id) {
  const documented = GEMINI_LEVELS[String(id).toLowerCase()] ?? ['low', 'medium', 'high']
  const efforts = {}
  for (const level of documented) efforts[level] = level
  return efforts
}

/**
 * Automatically determine the reasoning effort levels for a model from the
 * levels its vendor documents:
 *
 * - DeepSeek: none / low / high / max
 * - OpenAI (GPT, o-series): low / medium / high / xhigh / max
 * - Google Gemini: the model's documented set (low/medium/high, plus minimal
 *   on the Flash and Flash-Lite lines)
 * - Anthropic Claude: low / medium / high / xhigh / max
 * - xAI Grok: low / medium / high / xhigh (thinking cannot be disabled)
 * - Zhipu GLM: none / high / max
 * - Qwen and unrecognised models: a single thinking level (toggle only)
 * - Non-reasoning models: false
 *
 * @param {object} model - gateway model record.
 * @param {object | undefined} dev - capability catalog record.
 * @returns {object | false} reasoning effort mapping, or false if not supported.
 */
export function resolveReasoningEfforts(model, dev) {
  if (!detectThinking(model, dev)) return false
  const family = modelFamily(model, dev)
  if (family === 'gemini') return geminiEfforts(model.id)
  return { ...FAMILY_EFFORTS[family] }
}

/**
 * Convert raw gateway models plus a models.dev catalog into pi-ai model
 * entries. The result is deterministic: feed it the same inputs and it emits
 * byte-identical values, so the settings synchronizer can skip no-op writes.
 *
 * Ladders stay in the vendor's own spelling here: this function describes the
 * models, and {@link buildProfile} is what rewrites a ladder into the
 * vocabulary a particular wire protocol accepts. Keeping the two apart means
 * the same snapshot serves every protocol.
 * @param {object[]} endpointModels - gateway `/models` entries.
 * @param {Record<string, unknown> | undefined} catalog - models.dev payload.
 * @param {{ include?: string[], exclude?: string[] }} [filter] - id filter.
 * @returns {object[]} pi-ai model profile entries.
 */
export function resolveModels(endpointModels, catalog, filter = {}) {
  const include = new Set(filter.include ?? [])
  const exclude = new Set(filter.exclude ?? [])
  const index = indexModelsDev(catalog)
  const models = []
  const seen = new Set()
  for (const model of endpointModels) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    if (include.size > 0 && !include.has(model.id)) continue
    if (exclude.has(model.id)) continue
    const dev = lookupModelsDev(index, model.id)
    if (isImageModel(model, dev)) continue
    const contextWindow =
      positive(model.context_length) ?? positive(dev?.limit?.context) ?? DEFAULT_CONTEXT_WINDOW
    // An output cap above the context window is rejected by most providers, so
    // the declared limit is clamped rather than copied verbatim.
    const declaredMax = positive(dev?.limit?.output)
    const maxTokens = declaredMax === undefined ? undefined : Math.min(declaredMax, contextWindow)
    const vision = detectVision(model, dev)
    const reasoningEfforts = resolveReasoningEfforts(model, dev)
    models.push({
      id: model.id,
      name: typeof dev?.name === 'string' && dev.name.length > 0 ? dev.name : model.id,
      contextWindow,
      ...(maxTokens === undefined ? {} : { maxTokens }),
      input: vision ? ['text', 'image'] : ['text'],
      ...(reasoningEfforts ? { reasoningEfforts } : { reasoningEfforts: false }),
    })
  }
  return models
}

/**
 * Build the pi-ai provider profile the synchronizer writes into the
 * `llm-pi-ai` settings section.
 *
 * `baseURL` is the gateway as the user configured it, not the per-protocol
 * endpoint: the protocol decides what path the client needs, and
 * {@link resolveRouteBaseURL} derives it. Writing the derived form here keeps
 * every consumer — the profile, the page's display, the connection test — in
 * agreement about the one address a protocol actually calls.
 *
 * Each ladder is rewritten into the protocol's vocabulary here, for the same
 * reason: the profile is what dispatch reads, so the levels it advertises have
 * to be ones the wire format will accept.
 * @param {object[]} models - resolved model entries.
 * @param {{ baseURL: string, apiKeyEnv?: string, api: string, displayName: string, compat?: object, allowPrivate?: boolean }} options - route facts.
 * @returns {object} profiled provider object.
 */
export function buildProfile(models, options) {
  const api = normalizeApi(options.api)
  const compat = filterCompatForApi(options.compat, api)
  return {
    displayName: options.displayName,
    api,
    baseURL: resolveRouteBaseURL(
      validateBaseURL(options.baseURL, { allowPrivate: options.allowPrivate === true }),
      api,
    ),
    ...(options.apiKeyEnv ? { apiKeyEnv: options.apiKeyEnv } : {}),
    models: models.map((model) => {
      let next = model
      if ('reasoningEfforts' in model) {
        const adapted = adaptReasoningEfforts(model.reasoningEfforts, api)
        if (adapted !== model.reasoningEfforts) next = { ...next, reasoningEfforts: adapted }
      }
      if (model.compat !== undefined) {
        const modelCompat = filterCompatForApi(model.compat, api)
        next =
          modelCompat === undefined
            ? Object.fromEntries(Object.entries(next).filter(([key]) => key !== 'compat'))
            : { ...next, compat: modelCompat }
      }
      return next
    }),
    defaultContextWindow: DEFAULT_CONTEXT_WINDOW,
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    ...(compat ? { compat } : {}),
  }
}

/**
 * Keep any per-model `compat` block already stored in the profile. Those are
 * gateway-specific wire switches a human tuned (e.g. chatTemplateKwargs).
 *
 * A block is kept only when it is still valid for the protocol being written.
 * Switching protocol therefore drops the old switches instead of carrying them
 * across: pi-ai refuses a per-model field its protocol does not declare, which
 * would turn "switch to Anthropic" into a failed settings write.
 * @param {object[]} models - freshly resolved models.
 * @param {object | undefined} current - currently stored provider profile.
 * @param {string} [api] - protocol the profile is being written for; omitted keeps every block.
 * @returns {object[]} models carrying preserved compat blocks.
 */
export function preserveCompat(models, current, api) {
  const existingCompatById = new Map()
  for (const model of current?.models ?? []) {
    if (!model || typeof model.id !== 'string' || !model.compat) continue
    const compat = api === undefined ? model.compat : filterCompatForApi(model.compat, normalizeApi(api))
    if (compat && typeof compat === 'object') existingCompatById.set(model.id, compat)
  }
  if (existingCompatById.size === 0) return models
  return models.map((model) =>
    existingCompatById.has(model.id)
      ? { ...model, compat: existingCompatById.get(model.id) }
      : model,
  )
}

/**
 * @param {unknown} value - candidate number.
 * @returns {number | undefined} the value when it is a positive finite number.
 */
function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}
