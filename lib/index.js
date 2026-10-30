/**
 * DC AI API — keeps a `dc-ai` provider route in the pi-ai adapter in sync with
 * the gateway's model list and capability specifications.
 *
 * The plugin writes a complete, valid provider profile into the `llm-pi-ai`
 * settings section through the public settings service.
 *
 * Exactly ONE provider is registered: `dc-ai`, configured with the user's
 * chosen API protocol (`openai-responses` or `openai-completions`), keeping the
 * DSH model picker and settings clean without unwanted duplicates.
 *
 * @module dsh-dc-ai-api
 */
import { appendFile, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  buildProfile,
  fetchEndpointModels,
  fetchModelsDev,
  fetchSubscription,
  fetchUsage,
  preserveCompat,
  resolveModels,
} from './catalog.js'

/** Load Schemastery dynamically for settings schema */
let z
try {
  const req = createRequire('/opt/dsh/package.json')
  z = req('@deepseek-ai/schemastery')
} catch {
  try {
    const req = createRequire(import.meta.url)
    z = req('@deepseek-ai/schemastery')
  } catch {}
}

/** TEMP diagnostics while validating the bundle. */
function debug(message) {
  void appendFile('/workspace/dc-ai-api/debug.log', `${new Date().toISOString()} ${message}\n`).catch(() => {})
}

/** Plugin name used by diagnostics. */
export const name = 'dc-ai-api'

/** Services required before a sync can run. */
export const inject = ['settings', 'credentials']

/** Config schema for DSH Settings UI */
export const Config = z
  ? z.object({
      apiKey: z.string().role('secret').default('').description('DC AI API Key (dc_...)').volatile(),
      baseURL: z.string().default('https://dc-ai.dabeecao.org').description('DC AI Gateway Base URL').volatile(),
      api: z.union(['openai-responses', 'openai-completions']).default('openai-responses').description('API Protocol').volatile(),
      displayName: z.string().default('DC AI').description('Provider display name in DSH').volatile(),
      apiKeyEnv: z.string().default('DC_AI_API_KEY').description('Credential reference environment variable name').volatile(),
      refreshHours: z.number().default(6).description('Hours between automatic model catalog refreshes (0 to disable)').volatile(),
      useModelsDev: z.boolean().default(true).description('Automatically detect model thinking and vision capabilities').volatile(),
    })
  : undefined

/** Working defaults for every configurable field. */
const DEFAULTS = Object.freeze({
  route: 'dc-ai',
  displayName: 'DC AI',
  baseURL: 'https://dc-ai.dabeecao.org',
  apiKey: '',
  apiKeyEnv: 'DC_AI_API_KEY',
  api: 'openai-responses',
  syncOnStart: true,
  refreshHours: 6,
  useModelsDev: true,
  modelsDevURL: 'https://models.dev/api.json',
  includeModels: [],
  excludeModels: [],
  requestTimeoutMs: 30000,
})

/** How long to wait for the pi-ai settings section to appear during boot. */
const TARGET_WAIT_MS = 45000
const TARGET_POLL_MS = 500

/** Snapshot cache, read once per process. */
let snapshotPromise

/**
 * Normalize the raw patch config.
 * @param {unknown} raw - value from the loader entry's `config`.
 * @returns {object} complete, type-checked options.
 */
function normalizeOptions(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const text = (key) =>
    typeof source[key] === 'string' && source[key].length > 0 ? source[key] : DEFAULTS[key]
  const bool = (key) => (typeof source[key] === 'boolean' ? source[key] : DEFAULTS[key])
  const list = (key) =>
    Array.isArray(source[key])
      ? source[key].filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [...DEFAULTS[key]]
  const number = (key) =>
    typeof source[key] === 'number' && Number.isFinite(source[key]) && source[key] > 0
      ? source[key]
      : DEFAULTS[key]
  return {
    route: text('route').trim() || DEFAULTS.route,
    displayName: text('displayName'),
    baseURL: text('baseURL'),
    apiKey: typeof source.apiKey === 'string' ? source.apiKey.trim() : DEFAULTS.apiKey,
    apiKeyEnv: text('apiKeyEnv'),
    api: source.api === 'openai-completions' ? 'openai-completions' : DEFAULTS.api,
    syncOnStart: bool('syncOnStart'),
    refreshHours:
      typeof source.refreshHours === 'number' && Number.isFinite(source.refreshHours)
        ? Math.max(0, source.refreshHours)
        : DEFAULTS.refreshHours,
    useModelsDev: bool('useModelsDev'),
    modelsDevURL: text('modelsDevURL'),
    includeModels: list('includeModels'),
    excludeModels: list('excludeModels'),
    requestTimeoutMs: number('requestTimeoutMs'),
  }
}

/**
 * @returns {Promise<{ models: object[] } | undefined>} bundled fallback catalog.
 */
function loadSnapshot() {
  snapshotPromise ??= readFile(new URL('./snapshot.json', import.meta.url), 'utf8').then(
    (text) => JSON.parse(text),
    () => undefined,
  )
  return snapshotPromise
}

/**
 * Locate the configurable plugin entry that owns pi-ai provider profiles.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string | undefined} ownId - this plugin's own entry id.
 * @returns {object | undefined} settings descriptor for the pi-ai entry.
 */
function findPiAiNamespace(ctx, ownId, route) {
  let descriptors
  try {
    descriptors = ctx.settings.describe({ redactSecrets: true })
  } catch {
    return undefined
  }
  const llm = ctx.get('llm')
  const directory =
    typeof llm?.listConfigurableProviders === 'function' ? llm.listConfigurableProviders() : []
  const namespaces = new Set()
  for (const entry of directory) {
    if (entry?.provider === route && entry.settingsNs) namespaces.add(entry.settingsNs)
    if (Array.isArray(entry?.settingsPath) && entry.settingsPath[0] === 'providers' && entry.settingsNs) {
      namespaces.add(entry.settingsNs)
    }
  }
  const candidates = descriptors.filter((descriptor) => descriptor.ns !== ownId)
  const byDirectory = candidates.filter((descriptor) => namespaces.has(descriptor.ns))
  const matched =
    byDirectory.length > 0
      ? byDirectory
      : candidates.filter((descriptor) => {
          try {
            return JSON.stringify(descriptor.schema ?? {}).includes('"providers"')
          } catch {
            return false
          }
        })
  return matched.find((descriptor) => descriptor.ns === 'llm-pi-ai') ?? matched[0]
}

/**
 * Resolve the gateway API key.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} options - plugin options.
 * @returns {Promise<string | undefined>} the resolved key, when present.
 */
async function resolveApiKey(ctx, options) {
  if (options.apiKey && options.apiKey.length > 0) return options.apiKey
  const ref = options.apiKeyEnv
  if (!ref) return undefined
  const credentials = ctx.get('credentials')
  if (credentials) {
    try {
      const hit = await credentials.resolve(ref)
      if (hit?.value && hit.value.length > 0) return hit.value
    } catch {
      // Credential-store read failure falls through to the environment.
    }
  }
  const fromEnv = process.env[ref]
  return fromEnv && fromEnv.length > 0 ? fromEnv : undefined
}

/**
 * @param {unknown} value - JSON value.
 * @returns {string} deterministic serialization.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Compare only the fields this plugin owns to avoid unnecessary write cycles.
 * @param {object | undefined} profile - stored or generated provider profile.
 * @returns {string} comparable signature.
 */
function profileSignature(profile) {
  if (!profile || typeof profile !== 'object') return 'undefined'
  return canonical({
    displayName: profile.displayName,
    api: profile.api,
    baseURL: profile.baseURL,
    apiKeyEnv: profile.apiKeyEnv,
    models: Array.isArray(profile.models)
      ? profile.models.map((model) => ({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          input: model.input,
          reasoningEfforts: model.reasoningEfforts,
        }))
      : [],
  })
}

/**
 * Pause between namespace probes.
 * @param {number} ms - delay.
 * @returns {Promise<void>} resolved after the delay.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {AbortSignal | undefined} outer - caller cancellation.
 * @param {number} ms - timeout.
 * @returns {{ signal: AbortSignal, dispose: () => void }} combined signal.
 */
function withTimeout(outer, ms) {
  const controller = new AbortController()
  const onAbort = () => controller.abort(outer?.reason)
  if (outer?.aborted) onAbort()
  else outer?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('timeout')), ms)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onAbort)
    },
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(data))
}

function sendCors(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end()
}

/**
 * Install the synchronizer for this plugin instance.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} rawConfig - row config from the loader entry.
 * @returns {void}
 */
export function apply(ctx, rawConfig) {
  const options = normalizeOptions(rawConfig)
  debug(`apply options=${JSON.stringify(options)}`)
  const ownId = ctx.fiber?.entry?.options?.id
  const route = options.route
  const chatRoute = `${route}-chat`
  let running = false
  let disposed = false
  let warnedMissingKey = false
  let writeInFlight = false

  let lastSyncAt = null
  let lastModels = []
  let lastLive = false
  let lastError = null

  // If apiKey is explicitly configured in plugin options, ensure credentials store has it
  if (options.apiKey && options.apiKey.length > 0) {
    const creds = ctx.get('credentials')
    if (creds && typeof creds.set === 'function') {
      creds.set(options.apiKeyEnv, options.apiKey).catch((err) => {
        debug(`credentials.set error: ${err?.message}`)
      })
    }
  }

  // React to credential updates from Settings -> Models
  ctx.on('credentials/reference-updated', (ref) => {
    if (ref === options.apiKeyEnv) {
      debug(`credential updated for ${ref}, re-syncing models`)
      void sync()
    }
  })

  /**
   * Build the desired provider profiles from live data, or the snapshot.
   * @returns {Promise<{ models: object[], live: boolean }>} catalog and source.
   */
  async function readCatalog() {
    const apiKey = await resolveApiKey(ctx, options)
    const timeout = withTimeout(undefined, options.requestTimeoutMs)
    try {
      const endpointModels = await fetchEndpointModels(options.baseURL, apiKey, timeout.signal)
      let catalog
      if (options.useModelsDev) {
        try {
          catalog = await fetchModelsDev(options.modelsDevURL, timeout.signal)
        } catch (error) {
          ctx.logger.warn(`dc-ai-api: capability metadata unavailable, using gateway metadata only (${error.message})`)
        }
      }
      return {
        models: resolveModels(endpointModels, catalog, {
          include: options.includeModels,
          exclude: options.excludeModels,
        }),
        live: true,
      }
    } catch (error) {
      if (!apiKey && !warnedMissingKey) {
        warnedMissingKey = true
        ctx.logger.warn(
          `dc-ai-api: no API key resolved for ${options.apiKeyEnv}; serving the bundled catalog. ` +
            `Enter the key in Settings → Models → ${options.displayName} or export ${options.apiKeyEnv}.`,
        )
      } else if (apiKey) {
        ctx.logger.warn(`dc-ai-api: gateway model list unavailable, serving the bundled catalog (${error.message})`)
      }
      const snapshot = await loadSnapshot()
      const include = new Set(options.includeModels)
      const exclude = new Set(options.excludeModels)
      return {
        models: (snapshot?.models ?? [])
          .filter((model) => (include.size === 0 || include.has(model.id)) && !exclude.has(model.id))
          .map((model) => structuredClone(model)),
        live: false,
      }
    } finally {
      timeout.dispose()
    }
  }

  /**
   * Read the catalog and write any changed provider profile into the pi-ai
   * settings section.
   * @param {boolean} force - whether to force writing even if signature matches
   * @returns {Promise<void>} resolved when the sync attempt is over.
   */
  async function sync(force = false) {
    if (running || disposed || writeInFlight) return
    running = true
    try {
      let target
      debug('sync start')
      const deadline = Date.now() + TARGET_WAIT_MS
      do {
        target = findPiAiNamespace(ctx, ownId, route)
        if (target || disposed || Date.now() >= deadline) break
        await sleep(TARGET_POLL_MS)
      } while (true)
      if (disposed) return
      debug(`target=${target ? `${target.ns} rev=${target.revision}` : 'none'}`)
      if (!target) {
        ctx.logger.warn(
          'dc-ai-api: no llm-pi-ai settings section found; mount @deepseek-ai/dsh-llm-pi-ai to use DC AI models',
        )
        return
      }

      const { models, live } = await readCatalog()
      debug(`catalog live=${live} models=${models.length}`)
      lastModels = models
      lastLive = live
      lastSyncAt = new Date().toISOString()
      lastError = null

      if (disposed) return
      if (models.length === 0) {
        ctx.logger.warn('dc-ai-api: the gateway reported no chat models; leaving the stored profile untouched')
        return
      }

      // Single Provider Route: dc-ai
      const current = target.user?.providers?.[route]
      const primaryCompat = {
        supportsDeveloperRole: true,
        ...(options.api === 'openai-completions'
          ? { supportsReasoningEffort: true, supportsUsageInStreaming: true }
          : {}),
      }
      const profile = buildProfile(preserveCompat(models, current), {
        displayName: options.displayName,
        api: options.api,
        baseURL: options.baseURL,
        apiKeyEnv: options.apiKeyEnv,
        compat: primaryCompat,
      })

      const ops = []
      if (force || profileSignature(profile) !== profileSignature(current)) {
        ops.push({ op: 'set', path: ['providers', route], value: profile })
      }

      // Clean up any extraneous routes so only ONE provider exists
      if (target.user?.providers?.[chatRoute]) {
        debug(`cleaning secondary route: ${chatRoute}`)
        ops.push({ op: 'unset', path: ['providers', chatRoute] })
      }
      if (target.user?.providers?.[`${route}-responses`]) {
        ops.push({ op: 'unset', path: ['providers', `${route}-responses`] })
      }
      if (target.user?.providers?.[`${route}-chat`]) {
        ops.push({ op: 'unset', path: ['providers', `${route}-chat`] })
      }

      if (ops.length === 0) {
        debug('no-op profile already current')
        return
      }

      debug(`mutate ops=${ops.length} ns=${target.ns}`)
      writeInFlight = true
      void ctx.settings
        .mutate(target.ns, ops, target.revision)
        .then(
          () => {
            debug('mutate ok')
            if (!disposed) {
              ctx.logger.info(
                `dc-ai-api: synced ${models.length} ${options.displayName} models from ${live ? 'the gateway' : 'the bundled snapshot'}`,
              )
            }
          },
          (error) => {
            lastError = error instanceof Error ? error.message : String(error)
            ctx.logger.warn(`dc-ai-api: settings write failed: ${lastError}`)
          },
        )
        .finally(() => {
          writeInFlight = false
        })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      debug(`write error ${error?.stack}`)
      ctx.logger.warn(`dc-ai-api: sync failed: ${lastError}`)
    } finally {
      running = false
    }
  }

  async function getState() {
    const activeKey = await resolveApiKey(ctx, options)
    const maskedKey = activeKey
      ? (activeKey.length > 8 ? `${activeKey.slice(0, 4)}...${activeKey.slice(-4)}` : '••••••••')
      : ''
    return {
      ok: true,
      baseURL: options.baseURL,
      apiKeyConfigured: !!(activeKey && activeKey.length > 0),
      apiKeyMasked: maskedKey,
      api: options.api,
      displayName: options.displayName,
      lastSyncAt,
      lastLive,
      lastError,
      modelsCount: lastModels.length,
      thinkingCount: lastModels.filter((m) => m.reasoningEfforts && m.reasoningEfforts !== false).length,
      visionCount: lastModels.filter((m) => m.input && m.input.includes('image')).length,
      models: lastModels.map((m) => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        input: m.input,
        thinking: m.reasoningEfforts && m.reasoningEfforts !== false,
      })),
    }
  }

  async function updateConfig(body) {
    debug(`updateConfig: ${JSON.stringify({ ...body, apiKey: body.apiKey ? '***' : undefined })}`)
    if (typeof body.apiKey === 'string') {
      const trimmed = body.apiKey.trim()
      if (trimmed.length > 0) {
        options.apiKey = trimmed
        const creds = ctx.get('credentials')
        if (creds && typeof creds.set === 'function') {
          await creds.set(options.apiKeyEnv, trimmed)
        }
      }
    }
    if (body.api === 'openai-responses' || body.api === 'openai-completions') {
      options.api = body.api
    }
    if (typeof body.baseURL === 'string' && body.baseURL.trim().length > 0) {
      options.baseURL = body.baseURL.trim()
    }
    if (typeof body.displayName === 'string' && body.displayName.trim().length > 0) {
      options.displayName = body.displayName.trim()
    }
    await sync(true)
    return getState()
  }

  async function testConnection(body = {}) {
    const url = body.baseURL?.trim() || options.baseURL
    let key = body.apiKey?.trim()
    if (!key) {
      key = await resolveApiKey(ctx, options)
    }
    const start = Date.now()
    try {
      const timeout = withTimeout(undefined, 15000)
      try {
        const list = await fetchEndpointModels(url, key, timeout.signal)
        const latencyMs = Date.now() - start
        return {
          ok: true,
          latencyMs,
          modelsCount: list.length,
          models: list.slice(0, 10).map((m) => m.id),
        }
      } finally {
        timeout.dispose()
      }
    } catch (e) {
      return {
        ok: false,
        error: e.message || String(e),
        latencyMs: Date.now() - start,
      }
    }
  }

  async function getBilling() {
    const key = await resolveApiKey(ctx, options)
    if (!key) {
      return { ok: false, error: 'Chưa cấu hình API Key' }
    }
    const timeout = withTimeout(undefined, 15000)
    try {
      const [subscription, usage] = await Promise.all([
        fetchSubscription(options.baseURL, key, timeout.signal).catch((e) => ({ error: e.message })),
        fetchUsage(options.baseURL, key, timeout.signal).catch((e) => ({ error: e.message })),
      ])
      return {
        ok: true,
        fetchedAt: new Date().toISOString(),
        subscription,
        usage,
      }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      timeout.dispose()
    }
  }

  // Register HTTP routes on WebServer
  ctx.inject(['webServer'], (inner) => {
    const webServer = inner.get('webServer')
    const routes = [
      {
        kind: 'exact',
        path: '/dc-ai-api/state',
        handler: async (req, res) => {
          if (req.method === 'OPTIONS') return sendCors(res)
          if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          return sendJson(res, 200, await getState())
        },
      },
      {
        kind: 'exact',
        path: '/dc-ai-api/billing',
        handler: async (req, res) => {
          if (req.method === 'OPTIONS') return sendCors(res)
          if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          return sendJson(res, 200, await getBilling())
        },
      },
      {
        kind: 'exact',
        path: '/dc-ai-api/config',
        handler: async (req, res) => {
          if (req.method === 'OPTIONS') return sendCors(res)
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const state = await updateConfig(body)
            return sendJson(res, 200, state)
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message })
          }
        },
      },
      {
        kind: 'exact',
        path: '/dc-ai-api/sync',
        handler: async (req, res) => {
          if (req.method === 'OPTIONS') return sendCors(res)
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          try {
            await sync(true)
            return sendJson(res, 200, await getState())
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message })
          }
        },
      },
      {
        kind: 'exact',
        path: '/dc-ai-api/test',
        handler: async (req, res) => {
          if (req.method === 'OPTIONS') return sendCors(res)
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const result = await testConnection(body)
            return sendJson(res, 200, result)
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message })
          }
        },
      },
    ]

    const disposers = routes.map((r) => webServer.register(r))
    inner.effect(() => () => disposers.forEach((d) => d()), 'dc-ai-api.routes')
  })

  ctx.effect(() => {
    disposed = false
    let timer
    let start
    if (options.syncOnStart) {
      start = setTimeout(() => {
        void sync()
      }, 0)
      start.unref?.()
    }
    const hours = Number(options.refreshHours)
    if (Number.isFinite(hours) && hours > 0) {
      timer = setInterval(() => {
        void sync()
      }, hours * 3_600_000)
      timer.unref?.()
    }
    return () => {
      disposed = true
      if (start) clearTimeout(start)
      if (timer) clearInterval(timer)
    }
  })
}
