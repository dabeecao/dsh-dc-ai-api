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
  SUPPORTED_APIS,
} from '../lib/catalog.js'

const baseURL = process.argv[2] ?? process.env.DC_AI_BASE_URL ?? 'https://dc-ai.dabeecao.org'
const MODELS_DEV_URL = 'https://models.dev/api.json'
const apiKey = process.env.DC_AI_API_KEY

if (!apiKey) {
  console.error('DC_AI_API_KEY is required to read the gateway model list')
  process.exit(1)
}

/**
 * The snapshot describes models, not a protocol: ladders stay in the vendor's
 * own spelling and `buildProfile` rewrites them per protocol at sync time. So
 * one protocol's listing is enough to build it, as long as every protocol
 * agrees on which models exist.
 *
 * That agreement is checked rather than assumed. A gateway that served a model
 * on the OpenAI path but not the Gemini one would make the offline catalog
 * wrong for a Gemini install, and the failure would only appear later, as a
 * model that vanishes from the picker when the gateway is next reachable.
 */
async function readCatalogAcrossProtocols() {
  const perProtocol = new Map()
  for (const api of SUPPORTED_APIS) {
    const models = await fetchEndpointModels(baseURL, apiKey, undefined, { api })
    perProtocol.set(api, models.map((model) => model.id).sort())
    console.error(`  ${api.padEnd(21)} ${models.length} models`)
  }
  const [reference, ...rest] = [...perProtocol.entries()]
  const [referenceApi, referenceIds] = reference
  for (const [api, ids] of rest) {
    const onlyInReference = referenceIds.filter((id) => !ids.includes(id))
    const onlyHere = ids.filter((id) => !referenceIds.includes(id))
    if (onlyInReference.length === 0 && onlyHere.length === 0) continue
    console.error(
      `warning: ${api} disagrees with ${referenceApi}` +
        (onlyInReference.length > 0 ? `; missing ${onlyInReference.join(', ')}` : '') +
        (onlyHere.length > 0 ? `; extra ${onlyHere.join(', ')}` : ''),
    )
  }
  return referenceApi
}

console.error(`fetching ${baseURL}/models ...`)
const listingApi = await readCatalogAcrossProtocols()
const endpointModels = await fetchEndpointModels(baseURL, apiKey, undefined, { api: listingApi })

console.error(`fetching ${MODELS_DEV_URL} ...`)
const catalog = await fetchModelsDev(MODELS_DEV_URL)

const models = resolveModels(endpointModels, catalog)
const snapshot = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  baseURL,
  modelsDevURL: MODELS_DEV_URL,
  /** Which protocol produced the listing; every protocol is checked to agree. */
  listingApi,
  models,
}

const target = new URL('../lib/snapshot.json', import.meta.url)
await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`)
console.error(`wrote ${models.length} models to ${target.pathname}`)
