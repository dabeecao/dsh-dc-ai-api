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
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  buildProfile,
  fetchEndpointModels,
  fetchModelsDev,
  fetchSubscription,
  fetchUsage,
  preserveCompat,
  resolveModels,
  validateBaseURL,
} from './catalog.js'

/**
 * Resolve Schemastery from the host installation.
 *
 * An out-of-tree plugin is installed (or linked) outside the DSH package tree,
 * so a bare `import '@deepseek-ai/schemastery'` only resolves for packages that
 * live inside the profile's `node_modules`. Probe the plugin itself first, then
 * the running CLI entry (which always sits inside the installation), then the
 * active profile directory.
 * @returns {object | undefined} the Schemastery namespace, when reachable.
 */
function loadSchemastery() {
  const anchors = [import.meta.url]
  if (typeof process.argv[1] === 'string' && process.argv[1].length > 0) anchors.push(process.argv[1])
  const home = process.env.DSH_HOME
  const profile = process.env.DSH_PROFILE
  if (home && profile) anchors.push(join(home, 'profiles', profile, 'package.json'))
  for (const anchor of anchors) {
    try {
      return createRequire(anchor)('@deepseek-ai/schemastery')
    } catch {
      // Try the next anchor.
    }
  }
  return undefined
}

const z = loadSchemastery()

/** Plugin name used by diagnostics. */
export const name = 'dc-ai-api'

/** Services required before a sync can run. */
export const inject = ['settings', 'credentials']

/** Config schema for the DSH Settings form. */
export const Config = z
  ? z
      .object({
        baseURL: z
          .string()
          .default('https://dc-ai.dabeecao.org')
          .description('DC AI Gateway base URL (https)')
          .volatile(),
        api: z
          .union(['openai-responses', 'openai-completions'])
          .default('openai-responses')
          .description('Wire protocol used for every model on this route')
          .volatile(),
        displayName: z.string().default('DC AI').description('Provider display name in DSH').volatile(),
        apiKeyEnv: z
          .string()
          .default('DC_AI_API_KEY')
          .description('Credential reference resolved through the DSH credential store')
          .volatile(),
        refreshHours: z
          .number()
          .default(6)
          .description('Hours between automatic catalog refreshes (0 disables)')
          .volatile(),
        syncOnStart: z.boolean().default(true).description('Refresh the catalog on startup').volatile(),
        useModelsDev: z
          .boolean()
          .default(true)
          .description('Enrich capabilities from models.dev; off uses the gateway metadata alone')
          .volatile(),
        includeModels: z
          .array(z.string())
          .default([])
          .description('Only publish these model ids (empty publishes all)')
          .volatile(),
        excludeModels: z
          .array(z.string())
          .default([])
          .description('Never publish these model ids')
          .volatile(),
        requestTimeoutMs: z
          .number()
          .default(30000)
          .description('Gateway request timeout in milliseconds')
          .volatile(),
        allowPrivateBaseURL: z
          .boolean()
          .default(false)
          .description('Allow a gateway on a loopback or private network address')
          .volatile(),
      })
      .description('DC AI Gateway provider')
  : undefined

/** Working defaults for every configurable field. */
const DEFAULTS = Object.freeze({
  route: 'dc-ai',
  displayName: 'DC AI',
  baseURL: 'https://dc-ai.dabeecao.org',
  apiKeyEnv: 'DC_AI_API_KEY',
  api: 'openai-responses',
  syncOnStart: true,
  refreshHours: 6,
  useModelsDev: true,
  includeModels: [],
  excludeModels: [],
  requestTimeoutMs: 30000,
  allowPrivateBaseURL: false,
})

/** How long to wait for the pi-ai settings section to appear during boot. */
const TARGET_WAIT_MS = 45000
const TARGET_POLL_MS = 500

/** Largest accepted request body for the settings routes. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Capability catalog published by models.dev.
 *
 * Deliberately a constant, not a settings field: the URL is a fixed public
 * resource, and letting it be configured turned a capability lookup into a
 * second SSRF surface with its own redirect chain. Whether to consult it at all
 * is the `useModelsDev` switch; where it lives is not a user decision.
 */
const MODELS_DEV_URL = 'https://models.dev/api.json'

/** How many times a settings write waits out an in-flight reload transaction. */
const BUSY_RETRIES = 6

/** Base delay between reload-transaction retries. */
const BUSY_RETRY_MS = 250

/** Snapshot cache, read once per process. */
let snapshotPromise

/**
 * Read one config field.
 *
 * A `.volatile()` field is not a plain value: the loader hands the plugin a
 * reference object with `get()`, so reading `source[key]` directly would yield
 * the reference instead of the configured value.
 * @param {object} source - materialized config.
 * @param {string} key - field name.
 * @returns {unknown} the current value.
 */function readField(source, key) {
  const value = source[key]
  if (value && typeof value === 'object' && typeof value.get === 'function') {
    try {
      return value.get()
    } catch {
      return undefined
    }
  }
  return value
}

/**
 * Normalize the raw patch config.
 * @param {unknown} raw - value from the loader entry's `config`.
 * @returns {object} complete, type-checked options.
 */
function normalizeOptions(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const text = (key) => {
    const value = readField(source, key)
    return typeof value === 'string' && value.length > 0 ? value : DEFAULTS[key]
  }
  const bool = (key) => {
    const value = readField(source, key)
    return typeof value === 'boolean' ? value : DEFAULTS[key]
  }
  const list = (key) => {
    const value = readField(source, key)
    return Array.isArray(value)
      ? value.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [...DEFAULTS[key]]
  }
  const number = (key) => {
    const value = readField(source, key)
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULTS[key]
  }
  const api = readField(source, 'api')
  return {
    route: text('route').trim() || DEFAULTS.route,
    displayName: text('displayName'),
    baseURL: text('baseURL'),
    apiKeyEnv: text('apiKeyEnv'),
    api: api === 'openai-completions' ? 'openai-completions' : DEFAULTS.api,
    syncOnStart: bool('syncOnStart'),
    refreshHours:
      typeof readField(source, 'refreshHours') === 'number' &&
      Number.isFinite(readField(source, 'refreshHours'))
        ? Math.max(0, readField(source, 'refreshHours'))
        : DEFAULTS.refreshHours,
    useModelsDev: bool('useModelsDev'),
    includeModels: list('includeModels'),
    excludeModels: list('excludeModels'),
    requestTimeoutMs: number('requestTimeoutMs'),
    allowPrivateBaseURL: bool('allowPrivateBaseURL'),
  }
}

/**
 * @returns {Promise<{ models: object[] } | undefined>} bundled fallback catalog.
 *
 * Only a successful read is memoized: a transient failure (a file replaced
 * mid-install, for example) must not poison the cache for the process
 * lifetime, so the next sync retries the read.
 */
function loadSnapshot() {
  snapshotPromise ??= readFile(new URL('./snapshot.json', import.meta.url), 'utf8')
    .then(
      (text) => JSON.parse(text),
      () => undefined,
    )
    .then((snapshot) => {
      if (snapshot !== undefined) return snapshot
      snapshotPromise = undefined
      return undefined
    })
  return snapshotPromise
}

/**
 * Locate the configurable plugin entry that owns pi-ai provider profiles.
 *
 * Only a namespace the LLM service itself advertises for this route (or the
 * well-known `llm-pi-ai` entry) is accepted: writing a provider profile into an
 * unrelated plugin's config would corrupt it.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string | undefined} ownId - this plugin's own entry id.
 * @param {string} route - provider route name.
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
    if (!entry?.settingsNs) continue
    if (entry.provider === route) namespaces.add(entry.settingsNs)
    if (Array.isArray(entry.settingsPath) && entry.settingsPath[0] === 'providers') {
      namespaces.add(entry.settingsNs)
    }
  }
  const candidates = descriptors.filter((descriptor) => descriptor.ns !== ownId)
  const matched = candidates.filter((descriptor) => namespaces.has(descriptor.ns))
  return (
    matched.find((descriptor) => descriptor.ns === 'llm-pi-ai') ??
    matched[0] ??
    candidates.find((descriptor) => descriptor.ns === 'llm-pi-ai')
  )
}

/**
 * Resolve the gateway API key through the credential seam.
 *
 * The stored credential outranks the process environment, matching the rest of
 * the harness: rotating the key in Settings → Models takes effect on the next
 * request without a restart.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} options - plugin options.
 * @returns {Promise<string | undefined>} the resolved key, when present.
 */
async function resolveApiKey(ctx, options) {
  const ref = options.apiKeyEnv
  if (!ref) return undefined
  const credentials = ctx.get('credentials')
  if (credentials) {
    try {
      const hit = await credentials.resolve(ref)
      if (hit?.value && hit.value.length > 0) return hit.value
    } catch {
      // A credential-store read failure falls through to the environment.
    }
  }
  const fromEnv = process.env[ref]
  return fromEnv && fromEnv.length > 0 ? fromEnv : undefined
}

/** How many times a credential readback is retried before giving up. */
const CREDENTIAL_READBACK_RETRIES = 5

/** Base delay between credential readback attempts. */
const CREDENTIAL_READBACK_MS = 60

/**
 * Wait until a just-written credential is actually readable.
 *
 * The credential store may commit asynchronously, so the reload that follows a
 * settings write can otherwise start a sync that resolves no key. A store that
 * never confirms the value is not treated as a failure: the write itself
 * succeeded, and the next refresh cycle picks the key up regardless.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string} ref - credential reference.
 * @returns {Promise<boolean>} true once the value reads back.
 */
async function confirmCredential(ctx, ref) {
  const credentials = ctx.get('credentials')
  if (!credentials || typeof credentials.resolve !== 'function') return false
  for (let attempt = 0; attempt <= CREDENTIAL_READBACK_RETRIES; attempt += 1) {
    try {
      const hit = await credentials.resolve(ref)
      if (hit?.value && hit.value.length > 0) return true
    } catch {
      // Treat a read failure like a miss and retry.
    }
    if (attempt < CREDENTIAL_READBACK_RETRIES) await sleep(CREDENTIAL_READBACK_MS * (attempt + 1))
  }
  return false
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
    compat: profile.compat,
    defaultContextWindow: profile.defaultContextWindow,
    defaultMaxTokens: profile.defaultMaxTokens,
    models: Array.isArray(profile.models)
      ? profile.models.map((model) => ({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          input: model.input,
          reasoningEfforts: model.reasoningEfforts,
          compat: model.compat,
        }))
      : [],
  })
}

/**
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
  timer.unref?.()
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * Read a bounded request body.
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {Promise<string>} the decoded body.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const error = new Error('request body too large')
        error.status = 413
        reject(error)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * @param {import('node:http').ServerResponse} res - response.
 * @param {number} status - HTTP status.
 * @param {object} data - JSON payload.
 * @returns {void}
 */
function sendJson(res, status, data) {
  if (res.headersSent) return
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(data))
}

/**
 * Install the synchronizer for this plugin instance.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} rawConfig - row config from the loader entry.
 * @returns {void}
 */
export function apply(ctx, rawConfig) {
  const options = normalizeOptions(rawConfig)
  const ownId = ctx.fiber?.entry?.options?.id ?? name
  const route = options.route
  const chatRoute = `${route}-chat`
  let disposed = false
  let warnedMissingKey = false
  let warnedNoNamespace = false

  let lastSyncAt = null
  let lastModels = []
  let lastLive = false
  let lastError = null
  let lastSource = 'none'

  /** @type {Promise<object> | undefined} */
  let pendingSync

  // This plugin ships its own Settings page, so the auto-generated form for
  // its entry is suppressed; `settings.describe()` still reports the entry and
  // its revision, which is what the page's writes are validated against.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'dc-ai-api: settings page')
  })

  // React to credential updates from Settings -> Models.
  ctx.on('credentials/reference-updated', (ref) => {
    if (ref === options.apiKeyEnv) void sync(false)
  })

  /**
   * Build the desired catalog from live data, or from the bundled snapshot.
   *
   * A missing key is NOT an error: it is the expected state of a first run and
   * of the moment between writing a key and the reload that picks it up. It is
   * reported as `reason: 'no-key'` so callers can label the source without
   * raising a red banner that contradicts `apiKeyConfigured`.
   * @returns {Promise<{ models: object[], live: boolean, reason?: 'no-key', error?: string }>} catalog and source.
   */
  async function readCatalog() {
    const apiKey = await resolveApiKey(ctx, options)
    if (!apiKey) {
      // The gateway refuses unauthenticated requests, so a keyless sync must
      // not spend a request learning that: serve the bundled catalog instead.
      if (!warnedMissingKey) {
        warnedMissingKey = true
        ctx.logger.warn(
          `dc-ai-api: no API key resolved for ${options.apiKeyEnv}; serving the bundled catalog. ` +
            `Enter the key in Settings → DC AI API or export ${options.apiKeyEnv}.`,
        )
      }
      const snapshot = await loadSnapshot()
      const include = new Set(options.includeModels)
      const exclude = new Set(options.excludeModels)
      return {
        models: (snapshot?.models ?? [])
          .filter((model) => (include.size === 0 || include.has(model.id)) && !exclude.has(model.id))
          .map((model) => structuredClone(model)),
        live: false,
        reason: 'no-key',
      }
    }
    // Each source gets the full budget: sharing one deadline would let a slow
    // gateway response eat the time the models.dev fetch still needs.
    const gatewayTimeout = withTimeout(undefined, options.requestTimeoutMs)
    const catalogTimeout = withTimeout(undefined, options.requestTimeoutMs)
    try {
      const endpointModels = await fetchEndpointModels(options.baseURL, apiKey, gatewayTimeout.signal, {
        allowPrivate: options.allowPrivateBaseURL,
      })
      let catalog
      if (options.useModelsDev) {
        try {
          catalog = await fetchModelsDev(MODELS_DEV_URL, catalogTimeout.signal)
        } catch (error) {
          ctx.logger.warn(
            `dc-ai-api: capability metadata unavailable, using gateway metadata only (${error.message})`,
          )
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
      ctx.logger.warn(
        `dc-ai-api: gateway model list unavailable, serving the bundled catalog (${error.message})`,
      )
      const snapshot = await loadSnapshot()
      const include = new Set(options.includeModels)
      const exclude = new Set(options.excludeModels)
      return {
        models: (snapshot?.models ?? [])
          .filter((model) => (include.size === 0 || include.has(model.id)) && !exclude.has(model.id))
          .map((model) => structuredClone(model)),
        live: false,
        error: error.message,
      }
    } finally {
      gatewayTimeout.dispose()
      catalogTimeout.dispose()
    }
  }

  /**
   * Build the provider profile this route should store.
   * @param {object[]} models - resolved catalog.
   * @param {object | undefined} current - currently stored profile.
   * @returns {object} provider profile.
   */
  function desiredProfile(models, current) {
    const compat = {
      supportsDeveloperRole: true,
      ...(options.api === 'openai-completions'
        ? { supportsReasoningEffort: true, supportsUsageInStreaming: true }
        : {}),
      // A human-tuned provider-level switch always wins over our defaults.
      ...(current?.compat && typeof current.compat === 'object' ? current.compat : {}),
    }
    return buildProfile(preserveCompat(models, current), {
      displayName: options.displayName,
      api: options.api,
      baseURL: options.baseURL,
      apiKeyEnv: options.apiKeyEnv,
      compat,
    })
  }

  /**
   * Read the catalog and write any changed provider profile into the pi-ai
   * settings section. Concurrent callers share one run.
   * @param {boolean} force - write even when the signature already matches.
   * @returns {Promise<{ ok: boolean, changed?: boolean, models?: number, live?: boolean, error?: string }>}
   */
  function sync(force = false) {
    if (disposed) return Promise.resolve({ ok: false, error: 'plugin disposed' })
    if (pendingSync) return pendingSync
    pendingSync = runSync(force).finally(() => {
      pendingSync = undefined
    })
    return pendingSync
  }

  /**
   * Whether a settings write failed because it landed inside another
   * transaction.
   *
   * HMR runs a reload inside one exclusive transaction and starts the plugin
   * from there, so a write issued by our startup sync is refused with
   * "HMR transactions cannot be nested". That is a transient condition: the
   * same write succeeds once the reload finished.
   * @param {unknown} error - failure from `settings.mutate`.
   * @returns {boolean} true when the write should be retried later.
   */
  function isBusyTransaction(error) {
    return /cannot be nested|transaction/i.test(String(error?.message ?? ''))
  }

  /**
   * Retry a write that raced a reload, waiting for the transaction to drain.
   * @param {() => Promise<unknown>} write - the settings write.
   * @returns {Promise<unknown>} the write result.
   */
  async function writeWhenIdle(write) {
    let attempt = 0
    for (;;) {
      try {
        return await write()
      } catch (error) {
        if (!isBusyTransaction(error) || attempt >= BUSY_RETRIES || disposed) throw error
        attempt += 1
        await sleep(BUSY_RETRY_MS * attempt)
      }
    }
  }

  /**
   * @param {boolean} force - write even when the signature already matches.
   * @returns {Promise<object>} sync outcome.
   */
  async function runSync(force) {
    try {
      let target
      const deadline = Date.now() + TARGET_WAIT_MS
      do {
        target = findPiAiNamespace(ctx, ownId, route)
        if (target || disposed || Date.now() >= deadline) break
        await sleep(TARGET_POLL_MS)
      } while (true)
      if (disposed) return { ok: false, error: 'plugin disposed' }
      if (!target) {
        if (!warnedNoNamespace) {
          warnedNoNamespace = true
          ctx.logger.warn(
            'dc-ai-api: no llm-pi-ai settings section found; mount @deepseek-ai/dsh-llm-pi-ai to use DC AI models',
          )
        }
        lastError = 'llm-pi-ai settings section not found'
        return { ok: false, error: lastError }
      }

      const { models, live, reason: catalogReason, error: catalogError } = await readCatalog()
      lastModels = models
      lastLive = live
      lastSource = live ? 'gateway' : 'snapshot'
      lastSyncAt = new Date().toISOString()
      // Only a real failure is an error: a keyless sync falls back to the
      // snapshot by design, and the page already shows that state through
      // `apiKeyConfigured` and the setup gate.
      lastError = live || catalogReason === 'no-key' ? null : (catalogError ?? null)

      if (disposed) return { ok: false, error: 'plugin disposed' }
      if (models.length === 0) {
        lastError = 'the gateway reported no chat models'
        ctx.logger.warn('dc-ai-api: the gateway reported no chat models; leaving the stored profile untouched')
        return { ok: false, error: lastError }
      }

      // Single provider route: `dc-ai`. Remove the legacy secondary routes.
      const stale = [chatRoute, `${route}-responses`].filter(
        (candidate, index, all) =>
          candidate !== route && all.indexOf(candidate) === index && target.user?.providers?.[candidate],
      )

      // Retry on a concurrent settings write: the revision is re-read per attempt.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const fresh = attempt === 0 ? target : findPiAiNamespace(ctx, ownId, route)
        if (!fresh) return { ok: false, error: 'llm-pi-ai settings section disappeared' }
        const current = fresh.user?.providers?.[route]
        const profile = desiredProfile(models, current)
        const ops = []
        if (force || profileSignature(profile) !== profileSignature(current)) {
          ops.push({ op: 'set', path: ['providers', route], value: profile })
        }
        for (const candidate of stale) ops.push({ op: 'unset', path: ['providers', candidate] })
        if (ops.length === 0) {
          // Nothing to write, but the catalog read that produced this signature
          // still happened: report its outcome instead of leaving whatever the
          // previous sync recorded. Without this, a failed sync followed by a
          // no-op sync kept a stale error (or hid a fresh one).
          lastError = live || catalogReason === 'no-key' ? null : (catalogError ?? null)
          return { ok: true, changed: false, models: models.length, live }
        }

        try {
          await writeWhenIdle(() => ctx.settings.mutate(fresh.ns, ops, fresh.revision))
          lastError = live || catalogReason === 'no-key' ? null : (catalogError ?? null)
          ctx.logger.info(
            `dc-ai-api: synced ${models.length} ${options.displayName} models from ${
              live ? 'the gateway' : 'the bundled snapshot'
            }`,
          )
          return { ok: true, changed: true, models: models.length, live }
        } catch (error) {
          const conflict =
            error?.code === 'SETTINGS_CONFLICT' || error?.name === 'SettingsConflictError'
          if (conflict && attempt < 2) {
            await sleep(150 * (attempt + 1))
            continue
          }
          throw error
        }
      }
      return { ok: false, error: 'settings write did not settle' }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      ctx.logger.warn(`dc-ai-api: sync failed: ${lastError}`)
      if (isBusyTransaction(error) && !disposed) {
        // The reload that started us is still running; retry once it drains so
        // the profile still lands without waiting for the next refresh cycle.
        setTimeout(() => {
          if (!disposed) void sync(true)
        }, BUSY_RETRY_MS * 8).unref?.()
      }
      return { ok: false, error: lastError }
    }
  }

  /**
   * @returns {Promise<object>} the state the settings page renders.
   */
  async function getState() {
    const activeKey = await resolveApiKey(ctx, options)
    return {
      ok: true,
      baseURL: options.baseURL,
      apiKeyConfigured: Boolean(activeKey),
      apiKeyEnv: options.apiKeyEnv,
      api: options.api,
      displayName: options.displayName,
      allowPrivateBaseURL: options.allowPrivateBaseURL,
      useModelsDev: options.useModelsDev,
      lastSyncAt,
      lastLive,
      lastSource,
      // A configured key cannot coexist with a "no key" complaint: any error
      // recorded while the key was still missing is stale by definition, so it
      // is never reported once a key resolves.
      lastError: activeKey ? lastError : null,
      modelsCount: lastModels.length,
      thinkingCount: lastModels.filter((m) => m.reasoningEfforts && m.reasoningEfforts !== false).length,
      visionCount: lastModels.filter((m) => m.input && m.input.includes('image')).length,
      models: lastModels.map((m) => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        input: m.input,
        thinking: Boolean(m.reasoningEfforts && m.reasoningEfforts !== false),
        efforts: m.reasoningEfforts && m.reasoningEfforts !== false ? Object.keys(m.reasoningEfforts) : [],
      })),
    }
  }

  /**
   * Persist a settings-form edit on this plugin's own entry.
   *
   * The loader reloads the entry with the new config, which re-runs `apply` and
   * the startup sync; the in-memory options of this instance are only a cache.
   * @param {object} patch - fields to persist.
   * @returns {Promise<void>} resolved once the write is committed.
   */
  async function persistConfig(patch) {
    const descriptor = ctx.settings.describe().find((entry) => entry.ns === ownId)
    if (!descriptor) throw new Error('the dc-ai-api settings form is not available')
    await writeWhenIdle(() => ctx.settings.update(ownId, patch, descriptor.revision))
  }

  /**
   * Apply a settings-page edit: the API key goes to the credential store, every
   * other field is persisted in the plugin's own configuration.
   *
   * A submitted key is verified against the gateway first, and the write is
   * refused unless the gateway accepts it: an explicit credential rejection
   * reports `INVALID_KEY`, any other verification failure (unreachable,
   * timeout) reports `VERIFY_FAILED` — in both cases nothing is stored, so a
   * wrong key or a wrong base URL can neither be saved nor open the setup
   * gate.
   * @param {object} body - request payload.
   * @returns {Promise<object>} the refreshed state.
   */
  async function updateConfig(body) {
    const patch = {}
    const submittedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    if (submittedKey.length > 0) {
      let url
      try {
        url = validateBaseURL(body.baseURL?.trim() || options.baseURL, {
          allowPrivate: options.allowPrivateBaseURL,
        })
      } catch (error) {
        error.status = 400
        throw error
      }
      const timeout = withTimeout(undefined, 15000)
      try {
        await fetchEndpointModels(url, submittedKey, timeout.signal, {
          allowPrivate: options.allowPrivateBaseURL,
        })
      } catch (error) {
        const rejection = new Error(error?.code === 'CREDENTIAL_REJECTED' ? 'INVALID_KEY' : 'VERIFY_FAILED')
        rejection.code = rejection.message
        rejection.status = 400
        rejection.detail = error?.message
        throw rejection
      } finally {
        timeout.dispose()
      }
    }
    if (submittedKey.length > 0) {
      const credentials = ctx.get('credentials')
      if (!credentials || typeof credentials.set !== 'function') {
        throw new Error('the credential store is unavailable')
      }
      await credentials.set(options.apiKeyEnv, submittedKey)
      // Wait until the store reads back the key before this instance is
      // reloaded. The reload re-runs `apply()`, whose startup sync resolves the
      // key independently; if that read races the write it sees nothing, falls
      // back to the snapshot and — before this guard — reported the brand-new
      // key as missing. Confirming the readback makes the reload deterministic.
      await confirmCredential(ctx, options.apiKeyEnv)
    }
    if (body.api === 'openai-responses' || body.api === 'openai-completions') {
      patch.api = body.api
    }
    if (typeof body.allowPrivateBaseURL === 'boolean') {
      patch.allowPrivateBaseURL = body.allowPrivateBaseURL
    }
    if (typeof body.useModelsDev === 'boolean') {
      patch.useModelsDev = body.useModelsDev
    }
    if (typeof body.baseURL === 'string' && body.baseURL.trim().length > 0) {
      patch.baseURL = validateBaseURL(body.baseURL.trim(), {
        allowPrivate: options.allowPrivateBaseURL,
      })
    }
    if (typeof body.displayName === 'string' && body.displayName.trim().length > 0) {
      patch.displayName = body.displayName.trim()
    }
    if (Object.keys(patch).length > 0) await persistConfig(patch)
    // The reload triggered by the write owns the next sync; report the values
    // the caller just asked for so the page does not flash stale ones.
    Object.assign(options, patch)
    if (Object.keys(patch).length > 0) void sync(true)
    return getState()
  }

  /**
   * @param {object} body - optional baseURL/apiKey overrides.
   * @returns {Promise<object>} latency and model count, or an error.
   */
  async function testConnection(body = {}) {
    let url
    try {
      url = validateBaseURL(body.baseURL?.trim() || options.baseURL, {
        allowPrivate: options.allowPrivateBaseURL,
      })
    } catch (error) {
      return { ok: false, error: error.message, latencyMs: 0 }
    }
    let key = body.apiKey?.trim()
    if (!key) key = await resolveApiKey(ctx, options)
    if (!key) {
      // The gateway rejects unauthenticated requests; asking it without a key
      // would only produce a misleading "rejected the credential" failure.
      return { ok: false, error: 'MISSING_KEY', latencyMs: 0 }
    }
    const start = Date.now()
    const timeout = withTimeout(undefined, 15000)
    try {
      const list = await fetchEndpointModels(url, key, timeout.signal, {
        allowPrivate: options.allowPrivateBaseURL,
      })
      return {
        ok: true,
        latencyMs: Date.now() - start,
        modelsCount: list.length,
        models: list.slice(0, 10).map((m) => m.id),
      }
    } catch (error) {
      return { ok: false, error: error.message || String(error), latencyMs: Date.now() - start }
    } finally {
      timeout.dispose()
    }
  }

  /**
   * @returns {Promise<object>} quota, usage, and the per-source errors.
   */
  async function getBilling() {
    const key = await resolveApiKey(ctx, options)
    if (!key) return { ok: false, error: 'MISSING_KEY' }
    const timeout = withTimeout(undefined, 15000)
    try {
      const [subscription, usage] = await Promise.all([
        fetchSubscription(options.baseURL, key, timeout.signal, {
          allowPrivate: options.allowPrivateBaseURL,
        }).catch((error) => ({ error: error.message })),
        fetchUsage(options.baseURL, key, timeout.signal, {
          allowPrivate: options.allowPrivateBaseURL,
        }).catch((error) => ({ error: error.message })),
      ])
      return { ok: true, fetchedAt: new Date().toISOString(), subscription, usage }
    } catch (error) {
      return { ok: false, error: error.message }
    } finally {
      timeout.dispose()
    }
  }

  // Register HTTP routes on the Web server. Every route goes through the
  // browser-trust fence and the signed session cookie owned by
  // `dsh-client-connection`; the plugin adds no CORS surface of its own.
  ctx.inject(['webServer', 'connection'], (inner) => {
    const webServer = inner.get('webServer')
    const connection = inner.get('connection')

    /**
     * @param {import('node:http').IncomingMessage} req - request.
     * @param {import('node:http').ServerResponse} res - response.
     * @param {string} method - required method.
     * @param {(body: object) => Promise<object>} run - handler.
     * @returns {Promise<void>} resolved after the response is written.
     */
    const route = (method, run) => async (req, res) => {
      // `admit()` is the documented browser-trust entry point: it applies the
      // Host/Origin fence and requires a signed browser session or a live API
      // peer, exactly like the `/api` bridge. Without the service the routes
      // stay closed rather than falling open.
      let rejection
      if (typeof connection?.admit === 'function') {
        const admission = connection.admit(req)
        rejection = admission && 'rejection' in admission ? admission.rejection : undefined
      } else if (typeof connection?.requestRejection === 'function') {
        rejection = connection.requestRejection(req)
      } else {
        rejection = 503
      }
      if (rejection) {
        return sendJson(res, rejection, {
          ok: false,
          error: rejection === 403 ? 'FORBIDDEN' : rejection === 503 ? 'UNAVAILABLE' : 'UNAUTHORIZED',
        })
      }
      if (req.method !== method) return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' })
      try {
        let body = {}
        if (method !== 'GET') {
          const text = await readBody(req)
          body = text.length > 0 ? JSON.parse(text) : {}
        }
        return sendJson(res, 200, await run(body))
      } catch (error) {
        const status =
          typeof error?.status === 'number' && error.status >= 400 && error.status < 500
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 500
        if (status === 500) ctx.logger.warn(`dc-ai-api: ${req.url} failed: ${error?.message}`)
        return sendJson(res, status, {
          ok: false,
          error: error?.message ?? 'INTERNAL',
          ...(error?.code ? { code: error.code } : {}),
          ...(error?.detail ? { detail: error.detail } : {}),
        })
      }
    }

    const disposers = [
      webServer.register({ kind: 'exact', path: '/dc-ai-api/state', handler: route('GET', getState) }),
      webServer.register({ kind: 'exact', path: '/dc-ai-api/billing', handler: route('GET', getBilling) }),
      webServer.register({
        kind: 'exact',
        path: '/dc-ai-api/config',
        handler: route('POST', (body) => updateConfig(body)),
      }),
      webServer.register({
        kind: 'exact',
        path: '/dc-ai-api/sync',
        handler: route('POST', async () => {
          const result = await sync(true)
          // `runSync` already records the catalog outcome in `lastError`, so the
          // state carries the truth. Only a sync that failed outright (no
          // settings section, settings write refused, no chat models) has an
          // `error` to add — it must not be overwritten with `null` here, which
          // used to erase a snapshot-fallback error on every no-op sync.
          const state = await getState()
          return result.ok ? state : { ...state, ok: false, lastError: result.error ?? state.lastError }
        }),
      }),
      webServer.register({
        kind: 'exact',
        path: '/dc-ai-api/test',
        handler: route('POST', (body) => testConnection(body)),
      }),
    ]
    inner.effect(() => () => disposers.forEach((dispose) => dispose()), 'dc-ai-api.routes')
  })

  ctx.effect(() => {
    disposed = false
    let timer
    let start
    if (options.syncOnStart) {
      start = setTimeout(() => {
        void sync(false)
      }, 0)
      start.unref?.()
    }
    const hours = Number(options.refreshHours)
    if (Number.isFinite(hours) && hours > 0) {
      timer = setInterval(() => {
        void sync(false)
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
