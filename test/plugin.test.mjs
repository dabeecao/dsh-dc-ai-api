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
  for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '[::1]', 'fd00::1', 'metadata.google.internal']) {
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
  assert.throws(() => validateBaseURL('https://127.0.0.1:8080'), /loopback or private/)
  assert.throws(() => validateBaseURL('https://169.254.169.254'), /loopback or private/)
  assert.throws(() => validateBaseURL('not a url'), /valid absolute URL/)

  assert.equal(
    validateBaseURL('http://127.0.0.1:8080/v1', { allowPrivate: true }),
    'http://127.0.0.1:8080/v1',
  )
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
  const server = createServer((req, res) => {
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
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

/**
 * Minimal Cordis context stub: only the services `apply()` reads.
 * @param {{ rejection?: number }} [options] - connection admission result.
 * @returns {object} stub context plus the captured route table.
 */
function stubContext(options = {}) {
  const routes = new Map()
  const effects = []
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
        return { resolve: async () => ({ value: 'dc_test' }), set: async () => {} }
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
  return { ctx, routes }
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
  assert.match(JSON.parse(bad.body).error, /loopback or private/)
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
