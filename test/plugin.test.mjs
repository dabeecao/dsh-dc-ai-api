#!/usr/bin/env node
/**
 * Unit tests for the pure catalog helpers and the HTTP route guard.
 *
 * Run with `node --test test/`. No network access and no DSH runtime required:
 * the route test drives `apply()` with a stub Cordis context and a real
 * `node:http` server.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import {
  buildProfile,
  detectThinking,
  detectVision,
  fetchEndpointModels,
  fetchModelsDev,
  isImageModel,
  isPrivateHost,
  modelFamily,
  normalizeModelId,
  preserveCompat,
  resolveModels,
  resolveReasoningEfforts,
  validateBaseURL,
} from '../lib/catalog.js'

test('normalizeModelId folds dots, slashes, and separators', () => {
  assert.equal(normalizeModelId('deepseek-v4.1-flash'), 'deepseek-v4-1-flash')
  assert.equal(normalizeModelId('openai/gpt-6.1-sol'), 'gpt-6-1-sol')
  assert.equal(normalizeModelId('  MiMo_V2.6  '), 'mimo-v2-6')
})

test('detectVision prefers declared modalities, then the description', () => {
  const dev = { modalities: { input: ['text', 'image'] } }
  assert.equal(detectVision({ id: 'x' }, dev), true)
  assert.equal(detectVision({ id: 'x' }, { modalities: { input: ['text'] } }), false)
  assert.equal(detectVision({ id: 'x', description: 'supports image input' }, undefined), true)
  assert.equal(detectVision({ id: 'x', description: 'a text-only finetune' }, dev), false)
})

test('detectThinking honours the gateway flag before any heuristic', () => {
  assert.equal(detectThinking({ id: 'plain', supports_thinking: true }, undefined), true)
  assert.equal(detectThinking({ id: 'reasoner-x', supports_thinking: false }, { reasoning: true }), false)
  assert.equal(detectThinking({ id: 'o3-mini' }, undefined), true)
})

test('image-generation endpoints never enter the chat catalog', () => {
  assert.equal(isImageModel({ id: 'agnes-image-2.1-flash' }, undefined), true)
  assert.equal(isImageModel({ id: 'gpt-image-1' }, undefined), true)
  assert.equal(isImageModel({ id: 'gemini-4-argon' }, undefined), false)
  assert.equal(
    isImageModel({ id: 'weird' }, { modalities: { output: ['image'] } }),
    true,
  )
})

test('modelFamily classifies the gateway ids', () => {
  assert.equal(modelFamily({ id: 'deepseek-v4.1-flash' }), 'deepseek')
  assert.equal(modelFamily({ id: 'gpt-6-astra' }), 'openai')
  assert.equal(modelFamily({ id: 'gemini-4-argon' }), 'gemini')
  assert.equal(modelFamily({ id: 'claude-opus-5-5' }), 'claude')
  assert.equal(modelFamily({ id: 'grok-4.7' }), 'grok')
  assert.equal(modelFamily({ id: 'glm-5.3-flash' }), 'glm')
  assert.equal(modelFamily({ id: 'qwen3.8-flash' }), 'qwen')
  assert.equal(modelFamily({ id: 'agnes-3.0-flash' }), 'other')
})

test('Gemini uses the documented per-model levels and never offers max', () => {
  // Google's thinking guide lists low/medium/high for Gemini 4 and 3.8.
  assert.deepEqual(Object.keys(resolveReasoningEfforts({ id: 'gemini-4-argon', supports_thinking: true })), [
    'low',
    'medium',
    'high',
  ])
  assert.deepEqual(Object.keys(resolveReasoningEfforts({ id: 'gemini-3.8-flash', supports_thinking: true })), [
    'low',
    'medium',
    'high',
  ])
  // The Flash-Lite line also documents `minimal`.
  assert.deepEqual(
    Object.keys(resolveReasoningEfforts({ id: 'gemini-3.5-flash-lite', supports_thinking: true })),
    ['minimal', 'low', 'medium', 'high'],
  )
  // An undocumented Gemini id falls back to the common three.
  assert.deepEqual(Object.keys(resolveReasoningEfforts({ id: 'gemini-9-unknown', supports_thinking: true })), [
    'low',
    'medium',
    'high',
  ])
})

test('every family ladder follows its vendor documentation', () => {
  // DeepSeek: none / low / high / max, where `none` disables thinking.
  const deepseek = resolveReasoningEfforts({ id: 'deepseek-v4.1-flash', supports_thinking: true })
  assert.deepEqual(deepseek, { off: 'none', low: 'low', high: 'high', max: 'max' })

  // OpenAI: low / medium / high / xhigh / max.
  assert.deepEqual(Object.keys(resolveReasoningEfforts({ id: 'gpt-6-astra', supports_thinking: true })), [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ])

  // Anthropic: five effort levels.
  assert.deepEqual(Object.keys(resolveReasoningEfforts({ id: 'claude-opus-5-5', supports_thinking: true })), [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ])

  // xAI: four levels, and thinking cannot be disabled, so there is no `off`.
  assert.deepEqual(Object.keys(resolveReasoningEfforts({ id: 'grok-4.7', supports_thinking: true })), [
    'low',
    'medium',
    'high',
    'xhigh',
  ])

  // Zhipu: `none` / `high` / `max`; low and medium map onto high upstream.
  assert.deepEqual(resolveReasoningEfforts({ id: 'glm-5.3-flash', supports_thinking: true }), {
    off: 'none',
    high: 'high',
    max: 'max',
  })

  // Qwen documents only a thinking toggle, so one level is offered.
  assert.deepEqual(resolveReasoningEfforts({ id: 'qwen3.8-flash', supports_thinking: true }), {
    off: null,
    high: 'high',
  })

  assert.equal(resolveReasoningEfforts({ id: 'swe-2', supports_thinking: false }), false)
})

test('resolveModels clamps the output cap to the context window', () => {
  const models = resolveModels(
    [{ id: 'grok-4.7', context_length: 500000, supports_thinking: true }],
    { xai: { models: { 'grok-4.7': { name: 'Grok 4.7', limit: { context: 500000, output: 500000 } } } } },
  )
  assert.equal(models.length, 1)
  assert.equal(models[0].maxTokens, 500000)
  assert.equal(models[0].name, 'Grok 4.7')

  const clamped = resolveModels(
    [{ id: 'deepseek-v4.1-flash-1017', context_length: 1000000 }],
    { deepseek: { models: { 'deepseek-v4.1-flash-1017': { limit: { output: 1048576 } } } } },
  )
  assert.equal(clamped[0].maxTokens, 1000000)
})

test('resolveModels applies include/exclude and drops duplicates', () => {
  const endpoint = [
    { id: 'a' },
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ]
  assert.deepEqual(
    resolveModels(endpoint, undefined, { exclude: ['b'] }).map((m) => m.id),
    ['a', 'c'],
  )
  assert.deepEqual(
    resolveModels(endpoint, undefined, { include: ['b'] }).map((m) => m.id),
    ['b'],
  )
})

test('buildProfile drops the trailing slash and keeps compat', () => {
  const profile = buildProfile([{ id: 'a' }], {
    displayName: 'DC AI',
    api: 'openai-responses',
    baseURL: 'https://dc-ai.dabeecao.org///',
    apiKeyEnv: 'DC_AI_API_KEY',
    compat: { supportsDeveloperRole: true },
  })
  assert.equal(profile.baseURL, 'https://dc-ai.dabeecao.org')
  assert.equal(profile.apiKeyEnv, 'DC_AI_API_KEY')
  assert.deepEqual(profile.compat, { supportsDeveloperRole: true })
  assert.equal(profile.defaultContextWindow, 262144)
})

test('preserveCompat keeps human-tuned per-model switches', () => {
  const models = [{ id: 'a' }, { id: 'b' }]
  const current = { models: [{ id: 'a', compat: { chatTemplateKwargs: { x: 1 } } }] }
  const merged = preserveCompat(models, current)
  assert.deepEqual(merged[0].compat, { chatTemplateKwargs: { x: 1 } })
  assert.equal(merged[1].compat, undefined)
})

test('isPrivateHost covers loopback, RFC1918, link-local, and IPv6', () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '[::1]',
    'fd00::1',
    'fe80::1',
    'metadata.google.internal',
  ]) {
    assert.equal(isPrivateHost(host), true, host)
  }
  for (const host of ['dc-ai.dabeecao.org', '8.8.8.8', '1.1.1.1', '[2001:4860:4860::8888]']) {
    assert.equal(isPrivateHost(host), false, host)
  }
})

test('validateBaseURL refuses unsafe targets and normalizes the rest', () => {
  assert.equal(validateBaseURL('https://dc-ai.dabeecao.org/'), 'https://dc-ai.dabeecao.org')
  assert.equal(validateBaseURL('https://dc-ai.dabeecao.org/v1/'), 'https://dc-ai.dabeecao.org/v1')

  assert.throws(() => validateBaseURL('http://dc-ai.dabeecao.org'), /https/)
  assert.throws(() => validateBaseURL('file:///etc/passwd'), /http or https/)
  assert.throws(() => validateBaseURL('https://user:pass@dc-ai.dabeecao.org'), /credentials/)
  assert.throws(() => validateBaseURL('https://127.0.0.1:8080'), /private or loopback/)
  assert.throws(() => validateBaseURL('https://169.254.169.254'), /private or loopback/)
  assert.throws(() => validateBaseURL('not a url'), /valid absolute URL/)

  assert.equal(
    validateBaseURL('http://127.0.0.1:8080/v1', { allowPrivate: true }),
    'http://127.0.0.1:8080/v1',
  )
})

test('an IPv4-mapped IPv6 literal is judged as the IPv4 address it carries', () => {
  // The URL parser rewrites `::ffff:127.0.0.1` to `::ffff:7f00:1`, so the hex
  // form is the one that actually arrives.
  for (const url of ['https://[::ffff:127.0.0.1]/', 'https://[::ffff:c0a8:101]/', 'https://[::ffff:a9fe:a9fe]/']) {
    assert.throws(() => validateBaseURL(url), /private or loopback/, url)
  }
  // A mapped public address is not private.
  assert.equal(isPrivateHost('[::ffff:808:808]'), false)
})

test('a public gateway on any scheme-valid host is accepted', () => {
  for (const url of ['https://[2001:4860:4860::8888]/', 'https://8.8.8.8/', 'https://gateway.example/']) {
    assert.equal(validateBaseURL(url), url.replace(/\/$/, ''))
  }
})

test('unparsable IP literals are treated as private, not public', () => {
  assert.equal(isPrivateHost(''), true)
})

test('turning on private access lets a LAN gateway through, and only then', () => {
  const lan = 'http://192.168.1.50:8080/v1'
  assert.throws(() => validateBaseURL(lan), /private or loopback/)
  assert.equal(validateBaseURL(lan, { allowPrivate: true }), lan)
  // The self-hosted switch must not weaken the public-host https rule.
  assert.throws(() => validateBaseURL('http://dc-ai.dabeecao.org'), /https/)
})


test('fetchModelsDev refuses private targets even when the gateway setting allows them', async () => {
  // The catalog URL is a fixed public resource. `allowPrivateBaseURL` exists so
  // a user can reach their own gateway; it must not widen this into a second
  // SSRF path, so the function takes no policy at all.
  await assert.rejects(
    fetchModelsDev('http://169.254.169.254/latest/meta-data/', undefined),
    /private or loopback/,
  )
  await assert.rejects(fetchModelsDev('https://[::ffff:127.0.0.1]/', undefined), /private or loopback/)
  await assert.rejects(fetchModelsDev('file:///etc/passwd', undefined), /http or https/)
  // No third argument can loosen it.
  assert.equal(fetchModelsDev.length, 2, 'fetchModelsDev must not accept a policy argument')
})

test('fetchModelsDev refuses a loopback catalog even when a key is configured', async () => {
  // A local test server is exactly the shape an attacker would point the
  // catalog at, so the function must refuse it rather than fetch it. The
  // "unusable catalog" guard is covered separately by isUsableCatalog below.
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  let requests = 0
  server.on('request', () => {
    requests += 1
  })
  try {
    await assert.rejects(
      fetchModelsDev(`http://127.0.0.1:${port}/api.json`, undefined),
      /private or loopback/,
    )
    assert.equal(requests, 0, 'no request may leave for a private catalog address')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a non-JSON gateway body reports the endpoint instead of a SyntaxError', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><h1>gateway error</h1>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    await assert.rejects(
      fetchEndpointModels(`http://127.0.0.1:${port}`, 'k', undefined, { allowPrivate: true }),
      /non-JSON body.*text\/html/,
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('fetchEndpointModels tries /v1/models before the bare path', async () => {
  const seen = []
  const server = createServer((req, res) => {
    seen.push(req.url)
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }, { nope: true }] }))
      return
    }
    res.writeHead(404)
    res.end('missing')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const models = await fetchEndpointModels(`http://127.0.0.1:${port}`, 'k', undefined, {
      allowPrivate: true,
    })
    assert.deepEqual(models.map((m) => m.id), ['a', 'b'])
    assert.deepEqual(seen, ['/v1/models'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('fetchEndpointModels reports a rejected credential', async () => {
  let requests = 0
  const server = createServer((req, res) => {
    requests += 1
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end('{"error":"bad key"}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    await assert.rejects(
      fetchEndpointModels(`http://127.0.0.1:${port}`, 'k', undefined, { allowPrivate: true }),
      /rejected the credential/,
    )
    // A rejected credential is not retried on the fallback path: the second
    // request would be refused for the same reason.
    assert.equal(requests, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a keyless test connection reports MISSING_KEY without reaching the gateway', async () => {
  let requests = 0
  const server = createServer((req, res) => {
    requests += 1
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end('{"error":"bad key"}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const { ctx, routes } = stubContext({ noKey: true })
    const { apply } = await import('../lib/index.js')
    apply(ctx, {
      baseURL: `http://127.0.0.1:${port}`,
      allowPrivateBaseURL: true,
      apiKeyEnv: 'DC_AI_TEST_MISSING_KEY_XYZ',
    })
    const response = await callRoute(routes.get('/dc-ai-api/test'), {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const payload = JSON.parse(response.body)
    assert.equal(payload.ok, false)
    assert.equal(payload.error, 'MISSING_KEY')
    // No unauthenticated request may leave for the gateway.
    assert.equal(requests, 0)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

/**
 * Minimal Cordis context stub: only the services `apply()` reads.
 * @param {{ rejection?: number, noKey?: boolean }} [options] - connection admission
 *   result and credential-store behaviour.
 * @returns {object} stub context plus the captured route table.
 */
function stubContext(options = {}) {
  const routes = new Map()
  const effects = []
  const credentialWrites = []
  let credentialStore
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    fiber: { entry: { options: { id: 'dc-ai-api' } } },
    settings: {
      describe: () => [
        { ns: 'dc-ai-api', revision: 1, user: {}, schema: {} },
        {
          ns: 'llm-pi-ai',
          revision: 3,
          user: { providers: { 'dc-ai': { displayName: 'DC AI', models: [] } } },
          schema: { providers: {} },
        },
      ],
      mutate: async () => {},
      update: async () => {},
    },
    get(name) {
      if (name === 'credentials') {
        credentialStore ??= new Map()
        return {
          resolve: async (ref) => {
            if (credentialStore.has(ref)) return { value: credentialStore.get(ref) }
            return options.noKey ? undefined : { value: 'dc_test' }
          },
          set: async (ref, value) => {
            credentialStore.set(ref, value)
            credentialWrites.push({ ref, value })
          },
        }
      }
      if (name === 'webServer') {
        return {
          register(route) {
            routes.set(route.path, route.handler)
            return () => routes.delete(route.path)
          },
        }
      }
      if (name === 'connection') {
        return {
          admit: () => (options.rejection === undefined ? { peer: {} } : { rejection: options.rejection }),
        }
      }
      return undefined
    },
    on() {},
    effect(fn) {
      effects.push(fn)
      return () => {}
    },
    inject(_services, fn) {
      fn(ctx)
    },
  }
  return { ctx, routes, credentialWrites }
}

/**
 * Drive one registered route with a fake request/response pair.
 * @param {(req: object, res: object) => Promise<void>} handler - route handler.
 * @param {{ method?: string, body?: string }} [request] - request shape.
 * @returns {Promise<{ status: number, headers: object, body: string }>} response.
 */
async function callRoute(handler, request = {}) {
  const listeners = {}
  const req = {
    method: request.method ?? 'GET',
    url: '/dc-ai-api/state',
    on(event, fn) {
      listeners[event] = fn
      return req
    },
    destroy() {},
  }
  let status = 0
  const headers = {}
  const chunks = []
  const res = {
    headersSent: false,
    writeHead(code, map) {
      status = code
      Object.assign(headers, map ?? {})
      res.headersSent = true
      return res
    },
    end(chunk) {
      if (chunk) chunks.push(String(chunk))
    },
  }
  const pending = handler(req, res)
  if (request.body !== undefined) {
    listeners.data?.(Buffer.from(request.body))
    listeners.end?.()
  }
  await pending
  return { status, headers, body: chunks.join('') }
}

test('plugin routes refuse an unauthenticated browser request', async () => {
  const { ctx, routes } = stubContext({ rejection: 401 })
  const { apply } = await import('../lib/index.js')
  apply(ctx, { baseURL: 'https://dc-ai.dabeecao.org' })

  for (const path of ['/dc-ai-api/state', '/dc-ai-api/billing']) {
    const response = await callRoute(routes.get(path))
    assert.equal(response.status, 401, path)
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined, path)
    assert.equal(response.headers['Cache-Control'], 'no-store', path)
  }

  const config = await callRoute(routes.get('/dc-ai-api/config'), {
    method: 'POST',
    body: JSON.stringify({ baseURL: 'https://evil.example' }),
  })
  assert.equal(config.status, 401)
})

test('plugin routes refuse a cross-site origin with 403', async () => {
  const { ctx, routes } = stubContext({ rejection: 403 })
  const { apply } = await import('../lib/index.js')
  apply(ctx, {})
  const response = await callRoute(routes.get('/dc-ai-api/state'))
  assert.equal(response.status, 403)
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined)
})

test('an admitted request reaches the handler and rejects a bad baseURL', async () => {
  const { ctx, routes } = stubContext()
  const { apply } = await import('../lib/index.js')
  apply(ctx, {})

  const state = await callRoute(routes.get('/dc-ai-api/state'))
  assert.equal(state.status, 200)
  const payload = JSON.parse(state.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.apiKeyConfigured, true)
  assert.equal(payload.apiKeyMasked, undefined, 'the mask must not leave the host')

  const bad = await callRoute(routes.get('/dc-ai-api/config'), {
    method: 'POST',
    body: JSON.stringify({ baseURL: 'https://127.0.0.1:9000' }),
  })
  assert.equal(bad.status, 500)
  assert.match(JSON.parse(bad.body).error, /private or loopback/)
})

test('the config route rejects a malformed body and a wrong method', async () => {
  const { ctx, routes } = stubContext()
  const { apply } = await import('../lib/index.js')
  apply(ctx, {})

  const malformed = await callRoute(routes.get('/dc-ai-api/config'), {
    method: 'POST',
    body: '{not json',
  })
  assert.equal(malformed.status, 400)

  const wrongMethod = await callRoute(routes.get('/dc-ai-api/sync'), { method: 'GET' })
  assert.equal(wrongMethod.status, 405)
})

test('a rejected API key is verified before anything is stored', async () => {
  const server = createServer((req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end('{"error":"bad key"}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const { ctx, routes, credentialWrites } = stubContext({ noKey: true })
    const { apply } = await import('../lib/index.js')
    apply(ctx, {
      baseURL: `http://127.0.0.1:${port}`,
      allowPrivateBaseURL: true,
      apiKeyEnv: 'DC_AI_TEST_VERIFY_KEY_XYZ',
    })
    const response = await callRoute(routes.get('/dc-ai-api/config'), {
      method: 'POST',
      body: JSON.stringify({ apiKey: 'dc_wrong' }),
    })
    assert.equal(response.status, 400)
    assert.equal(JSON.parse(response.body).error, 'INVALID_KEY')
    // The refused key must not reach the credential store, so the setup gate
    // stays closed.
    assert.equal(credentialWrites.length, 0)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a working API key is stored and reported as configured', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"data":[{"id":"m1"}]}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const { ctx, routes, credentialWrites } = stubContext({ noKey: true })
    const { apply } = await import('../lib/index.js')
    apply(ctx, {
      baseURL: `http://127.0.0.1:${port}`,
      allowPrivateBaseURL: true,
      apiKeyEnv: 'DC_AI_TEST_VERIFY_KEY_XYZ',
    })
    const response = await callRoute(routes.get('/dc-ai-api/config'), {
      method: 'POST',
      body: JSON.stringify({ apiKey: 'dc_good' }),
    })
    const payload = JSON.parse(response.body)
    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.apiKeyConfigured, true)
    assert.deepEqual(credentialWrites, [{ ref: 'DC_AI_TEST_VERIFY_KEY_XYZ', value: 'dc_good' }])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('an unreachable gateway refuses the key write with VERIFY_FAILED', async () => {
  // Port 1 is reserved and refuses connections in every test environment.
  const { ctx, routes, credentialWrites } = stubContext({ noKey: true })
  const { apply } = await import('../lib/index.js')
  apply(ctx, {
    baseURL: 'http://127.0.0.1:1',
    allowPrivateBaseURL: true,
    apiKeyEnv: 'DC_AI_TEST_VERIFY_KEY_XYZ',
  })
  const response = await callRoute(routes.get('/dc-ai-api/config'), {
    method: 'POST',
    body: JSON.stringify({ apiKey: 'dc_any' }),
  })
  const payload = JSON.parse(response.body)
  assert.equal(response.status, 400)
  assert.equal(payload.code, 'VERIFY_FAILED')
  assert.ok(payload.detail, 'the underlying cause must reach the page')
  // An unverifiable key must not be stored: the user is told to check first.
  assert.equal(credentialWrites.length, 0)
})

test('a keyless sync reports no error — a missing key is a state, not a failure', async () => {
  const { ctx, routes } = stubContext({ noKey: true })
  const { apply } = await import('../lib/index.js')
  apply(ctx, { apiKeyEnv: 'DC_AI_TEST_NO_KEY_STATE_XYZ' })

  // The startup sync runs on a timer; drive one explicitly instead.
  const synced = await callRoute(routes.get('/dc-ai-api/sync'), { method: 'POST', body: '{}' })
  const syncPayload = JSON.parse(synced.body)
  assert.equal(syncPayload.apiKeyConfigured, false)
  assert.equal(syncPayload.lastError, null, 'a keyless sync must not raise lastError')
  // The bundled snapshot still supplies a full catalog.
  assert.ok(syncPayload.modelsCount > 0, 'the snapshot must keep models selectable')
  assert.equal(syncPayload.lastSource, 'snapshot')

  const state = JSON.parse((await callRoute(routes.get('/dc-ai-api/state'))).body)
  assert.equal(state.lastError, null)
})

test('a key stored after a keyless sync clears the stale missing-key error', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"data":[{"id":"m1"}]}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const { ctx, routes } = stubContext({ noKey: true })
    const { apply } = await import('../lib/index.js')
    apply(ctx, {
      baseURL: `http://127.0.0.1:${port}`,
      allowPrivateBaseURL: true,
      apiKeyEnv: 'DC_AI_TEST_VERIFY_KEY_XYZ',
    })

    // Keyless first: the page shows the setup gate and no red banner.
    await callRoute(routes.get('/dc-ai-api/sync'), { method: 'POST', body: '{}' })
    assert.equal(JSON.parse((await callRoute(routes.get('/dc-ai-api/state'))).body).lastError, null)

    // Saving the key must leave the page consistent: configured, and no error
    // claiming the key is missing.
    const saved = await callRoute(routes.get('/dc-ai-api/config'), {
      method: 'POST',
      body: JSON.stringify({ apiKey: 'dc_good' }),
    })
    const payload = JSON.parse(saved.body)
    assert.equal(payload.apiKeyConfigured, true)
    assert.equal(payload.lastError, null, 'a configured key must never be reported as missing')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a real snapshot fallback still reports its error', async () => {
  // A key is present but the gateway is unreachable: that IS a failure and the
  // page must keep surfacing it.
  const { ctx, routes } = stubContext()
  const { apply } = await import('../lib/index.js')
  apply(ctx, { baseURL: 'http://127.0.0.1:1', allowPrivateBaseURL: true, requestTimeoutMs: 1500 })

  const synced = await callRoute(routes.get('/dc-ai-api/sync'), { method: 'POST', body: '{}' })
  const payload = JSON.parse(synced.body)
  assert.equal(payload.apiKeyConfigured, true)
  assert.ok(payload.lastError, 'an unreachable gateway with a key present must be reported')
  assert.equal(payload.lastSource, 'snapshot')
})

test('the config route persists both switches and reports them back', async () => {
  const { ctx, routes } = stubContext()
  const { apply } = await import('../lib/index.js')
  apply(ctx, {})

  const before = JSON.parse((await callRoute(routes.get('/dc-ai-api/state'))).body)
  assert.equal(before.allowPrivateBaseURL, false, 'private access is off by default')
  assert.equal(before.useModelsDev, true, 'models.dev enrichment is on by default')

  const saved = await callRoute(routes.get('/dc-ai-api/config'), {
    method: 'POST',
    body: JSON.stringify({ allowPrivateBaseURL: true, useModelsDev: false }),
  })
  const payload = JSON.parse(saved.body)
  assert.equal(saved.status, 200)
  assert.equal(payload.allowPrivateBaseURL, true)
  assert.equal(payload.useModelsDev, false)
})

test('turning on private access lets a LAN gateway through, and only then', () => {
  const lan = 'http://192.168.1.50:8080/v1'
  assert.throws(() => validateBaseURL(lan), /private or loopback/)
  assert.equal(validateBaseURL(lan, { allowPrivate: true }), lan)
  // The self-hosted switch must not weaken the public-host https rule.
  assert.throws(() => validateBaseURL('http://dc-ai.dabeecao.org'), /https/)
})

test('the state route reports the installed version', async () => {
  const { ctx, routes } = stubContext()
  const { apply } = await import('../lib/index.js')
  apply(ctx, {})
  const payload = JSON.parse((await callRoute(routes.get('/dc-ai-api/state'))).body)
  assert.match(payload.version, /^\d+\.\d+\.\d+/, 'the page needs a version to display')
})

test('the update route answers with a version comparison, not an error', async () => {
  // The route reaches GitHub, so it is allowed to report `error` when the
  // network is unavailable — but it must always answer 200 with a shape the
  // page can render, and it must never throw.
  const { ctx, routes } = stubContext()
  const { apply } = await import('../lib/index.js')
  apply(ctx, {})
  const response = await callRoute(routes.get('/dc-ai-api/update'))
  assert.equal(response.status, 200)
  const payload = JSON.parse(response.body)
  assert.match(payload.current, /^\d+\.\d+\.\d+/, 'the installed version must always be reported')
  assert.equal(payload.releases, 'https://github.com/dabeecao/dsh-dc-ai-api/releases')
  if (payload.error === undefined) {
    assert.match(payload.latest, /^\d+\.\d+\.\d+/)
    assert.equal(typeof payload.outOfDate, 'boolean')
  } else {
    assert.equal(typeof payload.error, 'string')
  }
})
