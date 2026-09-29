import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { judgeMessage } from '../../../../packages/core/messages/dist/index.js'
import { parseOpaqueIdentifier, unwrap } from '../../../../packages/core/identity-values/dist/index.js'
import {
  jsonNumberSource,
  writeJsonLossless,
} from '../../../../packages/core/content-blocks/dist/index.js'
import {
  invokeModel,
  openRouterCredentialRedactionConfig,
} from '../../../../packages/model/model-request-runtime/dist/index.js'
import {
  openaiDefinitions,
  createOfficialProfileContent,
  createPiAiTransport,
} from '../../../../packages/model/pi-ai-transport/dist/index.js'
import { estimateReservation } from '../../../../tools/model-probe/src/budget.mjs'
import {
  paidInvocation,
  writePrivateEvidence,
} from '../../../../tools/model-probe/src/production-gate.mjs'
import { createPilotMeter } from './candidate.mjs'
import { images, cases, imageHashes } from './fixtures.mjs'
import { safeCausality, safeSourceIdentity, typedRejection } from './evidence.mjs'

export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export const modelIds = Object.freeze(['openai/gpt-6-sol', 'openai/gpt-6-luna', 'openai/gpt-6-sol-pro', 'openai/gpt-6-luna-pro'])
export const gates = Object.freeze(['offgrid', 'square1024', 'large', 'pair'])
export const approvedLedger =
  '/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/tmp/model-request-runtime/ledger.json'
export const budget = Object.freeze({ limitUsd: '100', researchLimitUsd: '60' })
function javascriptFiles(directory) {
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?javascriptFiles(join(directory,entry.name)):entry.name.endsWith(".js")?[join(directory,entry.name)]:[])
}
export const sourcePaths = Object.freeze([...new Set([
  "tools/model-probe/src/budget.mjs",
  "pnpm-lock.yaml",
  "packages/model/pi-ai-transport/node_modules/js-tiktoken/dist/index.cjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/images/64x64.png",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/images/256x32.png",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/images/65x65.png",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/images/1024x1024.png",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/images/2049x2903.png",
  "tools/model-probe/src/network.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/catalog.mjs",
  "tools/model-probe/src/production-gate.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/core.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/evidence.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/prepare.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/local.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/paid.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/review.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/preflight-negative.mjs",
  "packages/core/messages/dist/index.js",
  "packages/core/content-blocks/dist/index.js",
  "packages/model/model-request-runtime/dist/index.js",
  "packages/model/pi-ai-transport/dist/index.js",
  "packages/model/pi-ai-transport/src/official-models/openai.ts",
  "packages/model/pi-ai-transport/src/input-meters/openai-images.ts",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/candidate.mjs",
  "tmp/model-request-runtime/eight-vendor-owner/openai-image-range-pilot/fixtures.mjs",
  "packages/model/pi-ai-transport/src/calibration.ts",
  "packages/model/pi-ai-transport/src/transport.ts",
  "packages/model/model-request-runtime/src/invoke.ts",
  "examples/model-invocation-minimal-demo/src/demo.ts"
, ...javascriptFiles("packages/model/pi-ai-transport/dist"), ...javascriptFiles("packages/model/model-request-runtime/dist"), ...javascriptFiles("examples/model-invocation-minimal-demo/dist")])].sort())
export const sourceCommit = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
export async function sourceDigests() {
  return Object.fromEntries(
    await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])),
  )
}
export function definition(modelId) {
 assert.ok(modelIds.includes(modelId), 'model outside exact four-model image pilot')
 const official = openaiDefinitions.find(d => d.modelId === modelId)
 assert.ok(official && official.capabilities.inputModalities.includes('image'))
 // Isolated caller-supplied research contribution. The official table is untouched.
 const value = {...official, revision:'image-range-pilot-2', implementation:{name:'pi-ai:openai',revision:'image-range-pilot-2'}}
 return {provider:'openai', value}
}
export function applicable(modelId, gate) {
 definition(modelId)
 return modelId.endsWith('-pro') ? gate === 'pair' : ['offgrid', 'square1024', 'large'].includes(gate)
}
export function profile(modelId) {
 const {provider,value} = definition(modelId)
 const result = createOfficialProfileContent(value, {
   providers:[provider], allowFallback:false,
   configuration:{revision:'image-range-pilot-2',values:{cache:{mode:'automatic'}}},
 })
 assert.ok('ok' in result, 'research profile rejected')
 return result.ok
}
export function meter(modelId) { return createPilotMeter(definition(modelId).value) }
const at = '2026-09-29T00:00:00Z'
export function textMessage(type, text, id) {
  const result = judgeMessage({
    type,
    id,
    createdAt: at,
    blocks: [
      { id: `${id}-text`, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
    ],
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'attempt_started', attempt: 1, reason: 'first', at } }
      : {}),
  })
  if (!('ok' in result)) throw new Error(`message rejected: ${result.rejected}`)
  return result.ok
}
export async function requestFor(scenario, builtProfile = profile(scenario.modelId)) {
  const { provider, value } = definition(scenario.modelId)
  const blocks = [{ id:'prompt', kind:'text', text:'Reply exactly OK.', visibility:{toHuman:true,toModel:true}},
    ...cases[scenario.gate].map((name,index)=>({id:`image-${index}`,kind:'image',mediaType:'image/png',data:{inline:images[name].data},visibility:{toHuman:true,toModel:true}}))]
  const judged = judgeMessage({type:'user',id:'pilot-user',createdAt:at,blocks})
  assert.ok('ok' in judged)
  const messages = [judged.ok]
  return {
    calibration: { kind: 'none', reason: 'no_observation' },
    // Every pilot is an independent first request with no original response group.
    outputHistory: [],
    tokenMargin: scenario.tokenMargin,
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('priority-gate-public', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: scenario.modelId,
    provider,
    parameters: {
      reasoningEffort: 'low',
      maxOutputTokens: scenario.maxOutputTokens,
    },
    tools: [],
    messages,
    snapshot: {
      adaptation: builtProfile.adaptation,
      providers: builtProfile.providers,
      allowFallback: builtProfile.allowFallback,
      ...value.capabilities,
      updatedAt: at,
    },
  }
}
export const transportPolicy = () => ({
  maxConnections: 1,
  idleConnectionTimeoutMs: 5000,
  connectTimeoutMs: 5000,
  maxErrorBodyBytes: 8192,
  maxSseEventBytes: 65536,
  credentialRedaction: openRouterCredentialRedactionConfig,
})
export const invocationPolicy = scenario => ({
  now: () => new Date().toISOString(),
  schedule(ms, fn) {
    const timer = setTimeout(fn, ms)
    return () => clearTimeout(timer)
  },
  firstContentTimeoutMs: scenario.requestBounds.firstContentTimeoutMs,
  idleContentTimeoutMs: scenario.requestBounds.idleContentTimeoutMs,
  statusCauseTable: {
    401: 'credential_unavailable',
    429: 'upstream_unavailable',
    503: 'upstream_unavailable',
  },
  credentialRedaction: openRouterCredentialRedactionConfig,
  diagnostic: () => {},
})
export function createTransport(scenario, options = {}) {
  const { value } = definition(scenario.modelId)
  return createPiAiTransport({
    definitions: [value],
    inputMeters: [meter(scenario.modelId)],
    policy: transportPolicy(),
    ...options,
  })
}
export async function planFor(scenario, transport) {
  const request = await requestFor(scenario)
  const result = transport.plan(request)
  if (!('planned' in result))
    throw new Error(`production planner rejected gate: ${JSON.stringify(result)}`)
  const planned = result.planned
  assert.equal(planned.body.provider.order[0], definition(scenario.modelId).provider)
  assert.equal(planned.body.tools, undefined)
  assert.equal(planned.inputLimitEvidence.images, cases[scenario.gate].length)
  return { request, planned }
}
export function validateScenario(s) {
  assert.equal(s.format, 1)
  assert.equal(s.caseKind, 'image_range_pilot')
  assert.ok(applicable(s.modelId, s.gate), 'gate not applicable on current production meter/route')
  assert.ok(['pending', 'approved'].includes(s.reviewStatus))
  const { provider, value } = definition(s.modelId)
  assert.equal(s.provider, provider)
  assert.equal(s.definitionRevision, value.revision)
  assert.deepEqual(s.implementation, value.implementation)
  assert.equal(s.expectedEndpointTag, provider)
  assert.ok(
    Number.isSafeInteger(s.maxOutputTokens) &&
      s.maxOutputTokens > 0 &&
      s.maxOutputTokens <= value.capabilities.maxOutputTokens,
  )
  assert.equal(s.sourceCommit, sourceCommit())
  assert.deepEqual(s.imageSha256, imageHashes(s.gate))
  assert.equal(s.maxOutputTokens, 512)
  assert.deepEqual(s.requestBounds, {firstContentTimeoutMs:60000,idleContentTimeoutMs:120000,totalTimeoutMs:120000})
  assert.deepEqual(s.tokenMargin, {multiplier:1.1,reserveTokens:256})
  for (const key of ['profileSha256', 'publicWireSha256'])
    if (s[key] !== null) assert.match(s[key], /^[0-9a-f]{64}$/)
  assert.deepEqual(Object.keys(s.sourceSha256).sort(), [...sourcePaths].sort())
  return s
}
export async function verifySources(s) {
  assert.deepEqual(s.sourceSha256, await sourceDigests())
  assert.equal(s.profileSha256, hash(JSON.stringify(profile(s.modelId))))
  assert.deepEqual(s.imageSha256, imageHashes(s.gate))
}
export async function readFrozen(path, digest) {
  assert.match(digest, /^[a-f0-9]{64}$/)
  const bytes = await readFile(path)
  assert.equal(hash(bytes), digest, 'frozen SHA mismatch')
  return JSON.parse(bytes.toString('utf8'))
}
export async function verifyCatalog(catalog, catalogPath, scenario) {
  const { dirname, join } = await import('node:path')
  assert.equal(
    catalog.captureSource,
    'openrouter-public-api',
    'fixture catalog forbidden in paid mode',
  )
  const directory = await readFile(join(dirname(catalogPath), 'directory.raw.json'))
  const endpoint = await readFile(join(dirname(catalogPath), 'endpoint.raw.json'))
  assert.equal(hash(directory), catalog.directoryRawSha256)
  assert.equal(hash(endpoint), catalog.endpointRawSha256)
  const listed = JSON.parse(directory.toString('utf8')).data?.find(x => x.id === scenario.modelId)
  const raw = JSON.parse(endpoint.toString('utf8')).data?.endpoints?.find(
    x => x.tag === scenario.expectedEndpointTag,
  )
  assert.ok(listed && raw && raw.status === 0)
  assert.equal(raw.provider_name, 'OpenAI')
  const card = catalog.cards?.find(x => x.id === scenario.modelId)
  assert.deepEqual(
    card?.endpoints?.find(x => x.tag === scenario.expectedEndpointTag)?.pricing,
    raw.pricing,
  )
}
export function pricing(catalog, scenario, maxAgeMs) {
  assert.equal(catalog.format, 1)
  const age = Date.now() - Date.parse(catalog.observedAt)
  assert.ok(
    Number.isSafeInteger(maxAgeMs) &&
      maxAgeMs > 0 &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= maxAgeMs,
    'stale or future catalog',
  )
  const card = catalog.cards?.find(c => c.id === scenario.modelId)
  assert.equal(card?.state, 'directory_present')
  const endpoint = card.endpoints?.find(e => e.tag === scenario.expectedEndpointTag)
  assert.equal(endpoint?.provider, 'OpenAI')
  assert.equal(endpoint?.status, 0)
  assert.ok(endpoint.pricing)
  return endpoint.pricing
}
export function reservation(prices, scenario) {
  return estimateReservation(
    prices,
    definition(scenario.modelId).value.capabilities.maxInputTokens,
    definition(scenario.modelId).value.capabilities.maxOutputTokens,
  )
}
export function assertGateOutcome(scenario, outcome) {
  assert.ok('outcome' in outcome, `pre-send branch: ${JSON.stringify(outcome)}`)
  assert.equal(outcome.outcome, 'complete', 'upstream gate did not complete')
  const text=outcome.blocks.filter(b=>b.kind==='text').map(b=>b.text).join('').trim()
  assert.match(text,/^OK[.!]?$/, 'image pilot response did not complete the fixed prompt')
}

export async function publicCase({
  scenario,
  prices,
  ledger,
  outputDir,
  credential,
  transportOptions = {},
}) {
  const transport = createTransport(scenario, transportOptions)
  try {
    const { request, planned } = await planFor(scenario, transport)
    const wireSha256 = hash(planned.serialized)
    assert.equal(wireSha256, scenario.publicWireSha256, 'public wire changed after approval')
    const estimateUsd = reservation(prices, scenario)
    const paid = await paidInvocation(
      ledger,
      { model: scenario.modelId, provider: scenario.provider, stage: 'research', estimateUsd },
      async entryId => {
        let outcome
        try {
          outcome = await invokeModel({
            ...request,
            transport,
            credential,
            signal: AbortSignal.timeout(scenario.requestBounds.totalTimeoutMs),
            policy: invocationPolicy(scenario),
            onAccepted: () => {},
          }).outcome
        } catch {
          await writePrivateEvidence(
            `${outputDir}/public-${entryId}.json`,
            JSON.stringify(
              {
                entryId,
                wireSha256,
                stage: 'invoke_exception',
                cost: null,
                ...safeCausality(null, credential),
              },
              null,
              2,
            ) + '\n',
          )
          throw new Error('invocation threw; cost unknown')
        }
        const safe = {
          entryId,
          modelId: scenario.modelId,
          gate: scenario.gate,
          wireSha256,
          estimateUsd,
          phase: scenario.modelId.endsWith('-pro') ? 'pro-acceptance-only-after-base-pilot' : 'base-finite-size-range',
          upstreamModel: safeSourceIdentity(outcome.upstreamModel, credential),
          servingProvider: safeSourceIdentity(outcome.servingProvider, credential),
          observedInput: 'inputCalibration' in outcome ? outcome.inputCalibration.observedInput : null,
          measurementRaw: writeJsonLossless(planned.measurement),
          measurement: JSON.parse(writeJsonLossless(planned.measurement)),
          outcome: 'outcome' in outcome ? outcome.outcome : outcome.rejected,
          rejectionReason: 'reason' in outcome ? outcome.reason : null,
          typedRejection: typedRejection(outcome),
          ...safeCausality(outcome, credential),
          usageRaw: 'usage' in outcome ? writeJsonLossless(outcome.usage) : null,
          costRaw: 'cost' in outcome ? writeJsonLossless(outcome.cost) : null,
          usage: 'usage' in outcome ? JSON.parse(writeJsonLossless(outcome.usage)) : null,
          cost: 'cost' in outcome ? JSON.parse(writeJsonLossless(outcome.cost)) : null,
          blocks: 'blocks' in outcome ? outcome.blocks.map(b => ({kind:b.kind,...(b.kind==='text'?{text:{bytes:Buffer.byteLength(b.text),sha256:hash(b.text)}}:{})})) : [],
        }
        await writePrivateEvidence(
          `${outputDir}/public-${entryId}.json`,
          JSON.stringify(safe, null, 2) + '\n',
        )
        return {
          actualUsd:
            'cost' in outcome && outcome.cost?.cost_usd !== 'unknown'
              ? jsonNumberSource(outcome.cost.cost_usd)
              : undefined,
          safe,
          outcome,
        }
      },
    )
    assertGateOutcome(scenario, paid.receipt.outcome)
    return { entryId: paid.id, ...paid.receipt.safe }
  } finally {
    await transport.close()
  }
}
