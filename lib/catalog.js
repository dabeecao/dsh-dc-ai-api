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
 * Read the gateway's model list.
 *
 * The OpenAI-compatible spelling (`/v1/models`) is tried first because a
 * gateway mounted under `/v1` answers the bare path with 401/403/404 rather
 * than a redirect; the bare path is the fallback.
 * @param {string} baseURL - gateway root, with or without a trailing slash.
 * @param {string | undefined} apiKey - bearer token; required by this gateway.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @param {{ allowPrivate?: boolean }} [options] - base-URL policy.
 * @returns {Promise<object[]>} raw model records from `data`.
 */
export async function fetchEndpointModels(baseURL, apiKey, signal, options = {}) {
  const root = validateBaseURL(baseURL, options)
  const headers = { accept: 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  const paths = root.endsWith('/v1') ? ['/models'] : ['/v1/models', '/models']
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
    const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
    return list.filter((entry) => entry && typeof entry.id === 'string' && entry.id.length > 0)
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
 */
const GEMINI_LEVELS = Object.freeze({
  'gemini-4-argon': ['low', 'medium', 'high'],
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
 * @param {object[]} models - resolved model entries.
 * @param {{ baseURL: string, apiKeyEnv?: string, api: string, displayName: string, compat?: object }} options - route facts.
 * @returns {object} profiled provider object.
 */
export function buildProfile(models, options) {
  return {
    displayName: options.displayName,
    api: options.api,
    baseURL: String(options.baseURL).replace(/\/+$/, ''),
    ...(options.apiKeyEnv ? { apiKeyEnv: options.apiKeyEnv } : {}),
    models,
    defaultContextWindow: DEFAULT_CONTEXT_WINDOW,
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    ...(options.compat ? { compat: options.compat } : {}),
  }
}

/**
 * Keep any per-model `compat` block already stored in the profile. Those are
 * gateway-specific wire switches a human tuned (e.g. chatTemplateKwargs).
 * @param {object[]} models - freshly resolved models.
 * @param {object | undefined} current - currently stored provider profile.
 * @returns {object[]} models carrying preserved compat blocks.
 */
export function preserveCompat(models, current) {
  const existingCompatById = new Map()
  for (const model of current?.models ?? []) {
    if (model && typeof model.id === 'string' && model.compat && typeof model.compat === 'object') {
      existingCompatById.set(model.id, model.compat)
    }
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
