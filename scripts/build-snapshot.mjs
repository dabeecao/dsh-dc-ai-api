#!/usr/bin/env node
/**
 * Regenerate `lib/snapshot.json` — the offline catalog the plugin falls back
 * to when the gateway cannot be reached (for example before an API key has
 * been stored, or during a network outage).
 *
 * Usage:
 *   DC_AI_API_KEY=dc_... node scripts/build-snapshot.mjs [baseURL]
 *
 * The generated file is checked in so a fresh install can serve a complete
 * model list without network access.
 */
import { writeFile } from 'node:fs/promises'
import {
  fetchEndpointModels,
  fetchModelsDev,
  resolveModels,
} from '../lib/catalog.js'

const baseURL = process.argv[2] ?? process.env.DC_AI_BASE_URL ?? 'https://dc-ai.dabeecao.org'
const MODELS_DEV_URL = 'https://models.dev/api.json'
const apiKey = process.env.DC_AI_API_KEY

if (!apiKey) {
  console.error('DC_AI_API_KEY is required to read the gateway model list')
  process.exit(1)
}

console.error(`fetching ${baseURL}/models ...`)
const endpointModels = await fetchEndpointModels(baseURL, apiKey)

console.error(`fetching ${MODELS_DEV_URL} ...`)
const catalog = await fetchModelsDev(MODELS_DEV_URL)

const models = resolveModels(endpointModels, catalog)
const snapshot = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  baseURL,
  models,
}

const target = new URL('../lib/snapshot.json', import.meta.url)
await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`)
console.error(`wrote ${models.length} models to ${target.pathname}`)
