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
 * Selectable reasoning levels for a model the gateway serves with thinking
 * support. The gateway accepts every OpenAI-style effort spelling on both the
 * Responses and Chat Completions protocols, so the full ladder is offered.
 */
export const REASONING_EFFORTS = Object.freeze({
  off: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'max',
})

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
 * Whether an IPv4 literal belongs to a non-public range.
 * @param {string} host - dotted-quad hostname.
 * @returns {boolean} true for loopback, private, link-local, and reserved space.
 */
function isPrivateIPv4(host) {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

/**
 * Whether an IPv6 literal belongs to a non-public range.
 * @param {string} host - bracketed or bare IPv6 text.
 * @returns {boolean} true for loopback, unique-local, and link-local space.
 */
function isPrivateIPv6(host) {
  const value = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (value === '::' || value === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)
  if (mapped) return isPrivateIPv4(mapped[1])
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true
  return false
}

/**
 * Whether a hostname names a machine on the local or private network.
 * @param {string} hostname - URL hostname.
 * @returns {boolean} true when the address is not publicly routable.
 */
export function isPrivateHost(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '')
  if (host.length === 0) return true
  if (PRIVATE_HOSTNAMES.has(host)) return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host.includes(':')) return isPrivateIPv6(host)
  return isPrivateIPv4(host)
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
      'baseURL points at a loopback or private address; enable "allowPrivateBaseURL" to use a self-hosted gateway',
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
      lastError = new Error(
        `DC AI rejected the credential (HTTP ${response.status}); check ${'the API key'}`,
      )
      continue
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
    const body = await response.json()
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
    return await response.json()
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
    return await response.json()
  }
  throw lastError ?? new Error('Usage is unavailable')
}

/**
 * Fetch the public models.dev catalog, revalidating a cached copy when it is
 * older than the TTL. A failed refresh keeps serving the last good payload.
 * @param {string} url - catalog URL.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<Record<string, unknown>>} provider keyed catalog.
 */
export async function fetchModelsDev(url, signal) {
  const cached = modelsDevCache.get(url)
  if (cached && Date.now() - cached.at < MODELS_DEV_TTL_MS) return cached.body
  const headers = { accept: 'application/json' }
  if (cached?.etag) headers['if-none-match'] = cached.etag
  try {
    const response = await fetch(url, { headers, signal })
    if (response.status === 304 && cached) {
      cached.at = Date.now()
      return cached.body
    }
    if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)
    const body = await response.json()
    if (body === null || typeof body !== 'object') throw new Error('models.dev returned a non-object')
    modelsDevCache.set(url, { body, etag: response.headers.get('etag') ?? undefined, at: Date.now() })
    return body
  } catch (error) {
    if (cached) return cached.body
    throw error
  }
}

/**
 * Index models.dev entries by exact and normalized model id.
 * @param {Record<string, unknown> | undefined} catalog - models.dev payload.
 * @returns {{ exact: Map<string, object[]>, normalized: Map<string, object[]> }}
 */
export function indexModelsDev(catalog) {
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
  return { exact, normalized }
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
 * @returns {'deepseek' | 'openai' | 'gemini' | 'claude' | 'grok' | 'other'} family id.
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
  return 'other'
}

/**
 * Selectable reasoning levels per model family.
 *
 * The gateway forwards the effort spelling to the upstream provider and answers
 * `502 upstream_unavailable` for a spelling that provider rejects, so a level
 * only appears here after the gateway accepted it for that family. `off` is
 * expressed by omitting the field, never by sending a spelling.
 *
 * Gemini is the notable case. Google's own API has no `max` tier: Gemini 2.x
 * takes a numeric `thinkingBudget`, and Gemini 3.x takes `thinkingLevel` of
 * `low`/`medium`/`high` only — the native endpoint answers `502` for
 * `thinkingLevel: "max"`. This gateway nevertheless accepts
 * `reasoning_effort: "max"` on its Chat Completions route and translates it to a
 * larger budget than `high`; measured on the same prompt, `gemini-3.8-flash`
 * spends ~2.5k reasoning tokens on `max` against ~1.8k on `high`, and
 * `gemini-4-argon` ~0.9k against ~1.1k (the two are within noise there).
 * `xhigh` is refused with `502 upstream_unavailable` on every Gemini route. So
 * `max` is a gateway-level extension rather than a Gemini-native level: it is
 * offered because it measurably buys more thinking, and the ladder stops there.
 */
const FAMILY_EFFORTS = Object.freeze({
  deepseek: { off: null, high: 'high', max: 'max' },
  openai: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' },
  gemini: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' },
  claude: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' },
  grok: { off: null, low: 'low', medium: 'medium', high: 'high' },
  other: { off: null, low: 'low', medium: 'medium', high: 'high' },
})

/**
 * Automatically determine the appropriate reasoning effort levels for a model
 * based on the family that serves it:
 *
 * - DeepSeek: 3 levels (off, high, max)
 * - OpenAI / GPT / o-series: 5 levels (off, low, medium, high, max)
 * - Google Gemini: 5 levels (off, low, medium, high, max)
 * - Anthropic Claude: 5 levels (off, low, medium, high, max)
 * - xAI Grok: 4 levels (off, low, medium, high)
 * - General / other reasoning models: 4 levels (off, low, medium, high)
 * - Non-reasoning models: false
 *
 * @param {object} model - gateway model record.
 * @param {object | undefined} dev - capability catalog record.
 * @returns {object | false} reasoning effort mapping, or false if not supported.
 */
export function resolveReasoningEfforts(model, dev) {
  if (!detectThinking(model, dev)) return false
  return { ...FAMILY_EFFORTS[modelFamily(model, dev)] }
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
