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
 * Everything in this module is pure apart from the two fetchers, which makes
 * the snapshot generator and the running plugin share exactly one mapping.
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
 * Fetch the gateway's model list.
 * @param {string} baseURL - gateway root, with or without a trailing slash.
 * @param {string | undefined} apiKey - bearer token; required by this gateway.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<object[]>} raw model records from `data`.
 */
export async function fetchEndpointModels(baseURL, apiKey, signal) {
  const root = String(baseURL).replace(/\/+$/, '')
  const headers = { accept: 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  let response = await fetch(`${root}/models`, { headers, signal })
  if (response.status === 404) {
    response = await fetch(`${root}/v1/models`, { headers, signal })
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `DC AI /models returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }
  const body = await response.json()
  const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
  return list.filter((entry) => entry && typeof entry.id === 'string' && entry.id.length > 0)
}

/**
 * Fetch billing subscription and quota limits from gateway.
 * @param {string} baseURL - gateway root.
 * @param {string | undefined} apiKey - bearer token.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<object>} subscription data.
 */
export async function fetchSubscription(baseURL, apiKey, signal) {
  const root = String(baseURL).replace(/\/+$/, '')
  const headers = { accept: 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  let res = await fetch(`${root}/v1/dashboard/billing/subscription`, { headers, signal })
  if (res.status === 404) {
    res = await fetch(`${root}/dashboard/billing/subscription`, { headers, signal })
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Billing subscription returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 150)}` : ''}`,
    )
  }
  return await res.json()
}

/**
 * Fetch usage, token counts, and recent window costs from gateway.
 * @param {string} baseURL - gateway root.
 * @param {string | undefined} apiKey - bearer token.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<object>} usage data.
 */
export async function fetchUsage(baseURL, apiKey, signal) {
  const root = String(baseURL).replace(/\/+$/, '')
  const headers = { accept: 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  let res = await fetch(`${root}/v1/usage`, { headers, signal })
  if (res.status === 404) {
    res = await fetch(`${root}/usage`, { headers, signal })
  }
  if (res.status === 404) {
    res = await fetch(`${root}/v1/dashboard/billing/usage`, { headers, signal })
  }
  if (res.status === 404) {
    res = await fetch(`${root}/dashboard/billing/usage`, { headers, signal })
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Usage returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 150)}` : ''}`,
    )
  }
  return await res.json()
}

/**
 * Fetch the public models.dev catalog.
 * @param {string} url - catalog URL.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<Record<string, unknown>>} provider keyed catalog.
 */
export async function fetchModelsDev(url, signal) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)
  const body = await response.json()
  if (body === null || typeof body !== 'object') throw new Error('models.dev returned a non-object')
  return body
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
 * Automatically determine the appropriate reasoning effort levels for a model
 * based on official provider documentation and model family specifications:
 *
 * - DeepSeek: 3 levels (off, high, max)
 * - OpenAI / GPT / o-series: 5 levels (off, low, medium, high, max)
 * - Google Gemini: 5 levels (off, low, medium, high, max)
 * - Anthropic Claude: 5 levels (off, low, medium, high, max)
 * - xAI Grok: 4 levels (off, low, medium, high)
 * - General / Other reasoning models: 4 levels (off, low, medium, high)
 * - Non-reasoning models: false
 *
 * @param {object} model - gateway model record.
 * @param {object | undefined} dev - capability catalog record.
 * @returns {object | false} reasoning effort mapping, or false if not supported.
 */
export function resolveReasoningEfforts(model, dev) {
  if (!detectThinking(model, dev)) return false

  const id = String(model.id).toLowerCase()
  const provider = String(dev?.provider ?? '').toLowerCase()

  // 1. DeepSeek family (R1, V4, V4.1, etc.): 3 levels (off, high, max)
  if (id.includes('deepseek') || id.startsWith('r1') || id.includes('-r1') || provider === 'deepseek') {
    return {
      off: null,
      high: 'high',
      max: 'max',
    }
  }

  // 2. OpenAI / GPT / o1 / o3 / o4 family: 5 levels (off, low, medium, high, max)
  if (
    id.startsWith('gpt-') ||
    id.includes('-gpt-') ||
    id.startsWith('o1') ||
    id.startsWith('o3') ||
    id.startsWith('o4') ||
    provider === 'openai'
  ) {
    return {
      off: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'max',
    }
  }

  // 3. Google Gemini family: 5 levels (off, low, medium, high, max)
  if (id.includes('gemini') || provider === 'google') {
    return {
      off: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'max',
    }
  }

  // 4. Anthropic Claude family: 5 levels (off, low, medium, high, max)
  if (id.includes('claude') || provider === 'anthropic') {
    return {
      off: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'max',
    }
  }

  // 5. xAI Grok: 4 levels (off, low, medium, high)
  if (id.includes('grok') || provider === 'xai') {
    return {
      off: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
    }
  }

  // 6. Other reasoning models (GLM, Qwen, Agnes, MiMo, etc.): 4 levels
  return {
    off: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
  }
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
    const maxTokens = positive(dev?.limit?.output)
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
 * @param {{ baseURL: string, apiKeyEnv?: string, api: string, displayName: string }} options - route facts.
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
