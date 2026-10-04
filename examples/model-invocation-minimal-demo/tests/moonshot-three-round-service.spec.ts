import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import type { AssetDefinition, AssetHolding } from '@omne-harness-lite/asset-model'
import {
  assemblyManifestMigrations,
  createAssemblyManifestStore,
} from '@omne-harness-lite/assembly-manifest-store'
import { createAssetRegistry, type AssetRegistry } from '@omne-harness-lite/asset-registry-local'
import { type AssetRegistryService } from '@omne-harness-lite/asset-registry'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { CURRENT_EVALUATION_INPUTS as CURRENT_EVALUATION_INPUTS_SERVICE } from '@omne-harness-lite/asset-evaluation/cordis'
import { type CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import {
  createRegistryHistoryReader,
  type RegistryHistoryReader,
} from '@omne-harness-lite/evaluation-input-store/registry-history'
import { judgeMessage } from '@omne-harness-lite/messages'
import { MEMBERSHIPS_SERVICE } from '@omne-harness-lite/organization-governance/cordis'
import { type MembershipsService } from '@omne-harness-lite/organization-governance'
import { createMoonshotInputMeter, createOfficialProfileContent, moonshotAutomaticConfiguration, moonshotDefinitions } from '@omne-harness-lite/pi-ai-transport'
import { type InputMeter, type MeterContribution } from '@omne-harness-lite/model-request-runtime'
import { SESSION_TENANCY as SESSION_TENANCY_SERVICE } from '@omne-harness-lite/session-tenancy/cordis'
import { type SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { modelName, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment, publication, rootBody, ROOT } from './model-request-support.ts'
import { activateModelFixture, actor, ref } from './support.ts'

// Official Moonshot bindings (definition 3 / mp4-18) through the actual acceptance
// assembly: Cordis transport service, official model contribution, durable session log.
// The upstream is a controlled local HTTPS stand-in; no OpenRouter fact is observed.
const AT = '2026-09-30T00:00:00Z'
const VISIBLE = { toHuman: true, toModel: true }
// Display name both selected routes reported in the archived 2026-09-27 raw streams.
const SERVING = 'Moonshot AI'
const models = [
  { model: 'moonshotai/kimi-k3', provider: 'moonshotai/mxfp4', k3: true },
  { model: 'moonshotai/kimi-k2.7-code', provider: 'moonshotai/int4', k3: false },
] as const
type Case = (typeof models)[number]
const TOOL = { category: 'tool', name: 'example:read' } as const
const TOOL_NAME = modelName(TOOL.name)
const TOOL_DEFINITION = {
  name: TOOL.name,
  paradigm: 'single',
  description: 'Read a fixture value',
  origin: { kind: 'authored' },
  input: { type: 'object', properties: {}, additionalProperties: false },
  permissions: { execute: { default: 'auto' } },
} as const satisfies ToolDefinition
const PARAMETERS = { reasoningEffort: 'high', maxOutputTokens: 1024 } as const

let png: Buffer
beforeAll(async () => {
  png = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer()
})

function user(id: string, withImage = false) {
  const judged = judgeMessage({
    type: 'user',
    id,
    createdAt: AT,
    blocks: [
      { id: `${id}-text`, kind: 'text', text: `Request ${id}`, visibility: VISIBLE },
      ...(withImage
        ? [
            {
              id: `${id}-image`,
              kind: 'image',
              mediaType: 'image/png',
              data: { inline: png.toString('base64') },
              visibility: VISIBLE,
            },
          ]
        : []),
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('user fixture invalid')
  return judged.ok
}

function tracked(original: InputMeter) {
  const calls = { full: 0, replay: [] as MeterContribution[], fresh: [] as MeterContribution[] }
  const meter: InputMeter = {
    ...original,
    measureFull(value) {
      calls.full++
      return original.measureFull(value)
    },
    measureReplay(value) {
      const result = original.measureReplay(value)
      calls.replay.push(result)
      return result
    },
    measureNew(value) {
      const result = original.measureNew(value)
      calls.fresh.push(result)
      return result
    },
  }
  return { meter, calls }
}

function definitionOf(entry: Case) {
  const definition = moonshotDefinitions.find(value => value.modelId === entry.model)
  if (!definition) throw new Error('official Moonshot definition missing')
  return definition
}

async function moonshotConfig(entry: Case, label: string, meter: InputMeter) {
  const definition = definitionOf(entry)
  const base = await callDeployment(label)
  const profile = createOfficialProfileContent(definition, {
    providers: [entry.provider],
    allowFallback: false,
    configuration: moonshotAutomaticConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    ...base,
    officialManifest: { ordinal: 1, entries: [profile.ok] },
    modelRequest: {
      ...base.modelRequest,
      tokenMargin: { multiplier: 1.2, reserveTokens: 256 },
      transport: {
        ...base.modelRequest.transport,
        definitions: [definition],
        inputMeters: [meter],
      },
    },
  }
}

type Tls = Awaited<ReturnType<typeof createLocalTls>>
function wireMessages(tls: Tls, index: number): unknown[] {
  const body = tls.requests[index]?.body
  if (typeof body !== 'object' || body === null || !('messages' in body))
    throw new Error('captured wire missing')
  const messages = body.messages
  if (!Array.isArray(messages)) throw new Error('captured messages missing')
  return messages
}
function expectRouteWire(tls: Tls, entry: Case) {
  for (const request of tls.requests) {
    // K3 passes the accepted effort; K2.7 Code drops it and sends no reasoning member.
    if (entry.k3) expect(request.body).toMatchObject({ reasoning: { effort: 'high' } })
    else expect(request.body).not.toHaveProperty('reasoning')
    expect(request.body).toMatchObject({
      model: entry.model,
      provider: { order: [entry.provider], allow_fallbacks: false, require_parameters: true },
    })
    expect(JSON.stringify(request.body)).not.toContain('cache_control')
  }
}
/** Earlier wire history is replayed byte-for-byte as the next request's prefix. */
function expectPrefixReplay(tls: Tls) {
  for (let index = 1; index < tls.requests.length; index++) {
    const previous = wireMessages(tls, index - 1)
    const current = wireMessages(tls, index)
    expect(current.slice(0, previous.length).map(item => JSON.stringify(item))).toEqual(
      previous.map(item => JSON.stringify(item)),
    )
  }
}

describe.each(models)('$model three rounds through the actual service assembly', entry => {
  it('without tools: inline PNG, plain reasoning replay, full-only estimate', async () => {
    const { meter, calls } = tracked(createMoonshotInputMeter(definitionOf(entry)))
    const config = await moonshotConfig(entry, 'moonshot-service-text', meter)
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      () => entry.model,
      JSON.stringify({
        prompt_tokens: 10000,
        completion_tokens: 3,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        cost: 0.0000117,
      }),
      SERVING,
    )
    tls.setMode('reasoning')
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'moonshot-service-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('moonshot-service-key'),
          body: Buffer.from('local-only'),
        })),
      ).toEqual({ stored: true })
      expect(await app.selectModel(who, session, entry.model)).toEqual({ selected: entry.model })
      for (let round = 1; round <= 3; round++) {
        const prior = { full: calls.full, replay: calls.replay.length, fresh: calls.fresh.length }
        const sent = await app.startServiceCall(who, session, {
          user: user(`moonshot-turn-${round}`, round === 1),
          parameters: PARAMETERS,
          host: host.host,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw new Error(JSON.stringify(sent))
        const response = sent.result.replyPending
        expect(tls.requests).toHaveLength(round)
        expect(response.inputCalibration.observedInput).toMatchObject({ kind: 'from_usage' })
        expect(writeJsonLossless(response.usage.input_tokens)).toBe('10000')
        expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.0000117')
        expect(await app.persistModelReply(who, session, response)).toHaveProperty('settled')
        // Full reference estimate every round; φ/δ contribute nothing (R-A full-only).
        // The display-name provider differs from the fixed tag, so the prior observation
        // is set aside as a basis change before any marginal component is consulted.
        expect(calls.full - prior.full).toBe(2)
        expect(calls.replay.slice(prior.replay)).toEqual([])
        expect(calls.fresh.slice(prior.fresh)).toEqual([])
      }
      expect(tls.requests).toHaveLength(3)
      expectRouteWire(tls, entry)
      expectPrefixReplay(tls)
      expect(wireMessages(tls, 2).slice(-5)).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Request moonshot-turn-1' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
            },
          ],
        },
        { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
        { role: 'user', content: [{ type: 'text', text: 'Request moonshot-turn-2' }] },
        { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
        { role: 'user', content: [{ type: 'text', text: 'Request moonshot-turn-3' }] },
      ])
      expect(tls.failures).toEqual([])
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })

  it('with a paired tool call and result across three rounds', async () => {
    const { meter, calls } = tracked(createMoonshotInputMeter(definitionOf(entry)))
    const base = await moonshotConfig(entry, 'moonshot-service-tools', meter)
    let registry: AssetRegistry | undefined
    let storage: AtomicStorage | undefined
    let context: Context | undefined
    const bridge: Pick<AssetRegistryService, 'lookup'> = {
      async lookup(session, category, name, within) {
        return registry === undefined
          ? { failure: 'unavailable' }
          : registry.lookup(session, category, name, within)
      },
    }
    const config = {
      ...base,
      modelRequest: {
        ...base.modelRequest,
        assetRegistry: bridge,
        evaluationInputs: {
          ...base.modelRequest.evaluationInputs,
          deployedOfficial: [
            { capability: ROOT, meta: false },
            { capability: TOOL, meta: false },
          ],
          async prepare(who: Parameters<typeof publication>[0]) {
            const source = publication(who)
            const original = source.definitions[0]
            const version = original?.versions[0]
            if (original === undefined || version === undefined) throw new Error('root missing')
            const root: AssetDefinition = {
              ...original,
              versions: [
                {
                  ...version,
                  content: {
                    category: 'agent_definition',
                    body: toOpaqueJson({
                      ...rootBody(),
                      references: [{ capability: TOOL, resident: true }],
                    }),
                  },
                },
              ],
            }
            const tool: AssetDefinition = {
              id: 'ast_example_read',
              capability: TOOL,
              origin: 'official',
              versions: [
                {
                  number: 1,
                  publishedAt: AT,
                  content: { category: 'tool', definition: TOOL_DEFINITION },
                },
              ],
            }
            const holding: AssetHolding = {
              holder: { layer: 'factory' },
              capability: TOOL,
              asset: tool.id,
              basis: { kind: 'official' },
              immutable: false,
              assignments: [],
              versionSelection: { kind: 'current' },
              since: AT,
            }
            return {
              publication: {
                ...source,
                definitions: [root, tool],
                scopes: source.scopes.map(scope =>
                  scope.holder.layer === 'factory'
                    ? { ...scope, holdings: [...scope.holdings, holding] }
                    : scope,
                ),
              },
              recipe: { rootDefinition: ROOT },
            }
          },
        },
      },
    }
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      () => entry.model,
      undefined,
      SERVING,
    )
    tls.setMode('tool')
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      hooks: {
        extraMigrations: assemblyManifestMigrations,
        storageOpened(opened) {
          storage = opened
        },
        fiberCreated(name, fiber) {
          if (name === 'evaluationInputs') context = fiber.ctx
        },
      },
    })
    const host = createDemoCallHost()
    let manifest: ReturnType<typeof createAssemblyManifestStore> | undefined
    let history: RegistryHistoryReader | undefined
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      if (storage === undefined || context === undefined)
        throw new Error('provider capture missing')
      const currentInputs = context.get(CURRENT_EVALUATION_INPUTS_SERVICE)
      const tenancy = context.get(SESSION_TENANCY_SERVICE)
      const memberships = context.get(MEMBERSHIPS_SERVICE)
        if (memberships === undefined) throw Error('membership service not ready in fixture')
      const clock = context.get('clock')
      if (
        typeof currentInputs?.read !== 'function' ||
        typeof tenancy?.holdingTenant !== 'function' ||
        typeof memberships?.participate !== 'function' ||
        typeof clock?.now !== 'function'
      )
        throw new Error('actual provider port missing')
      manifest = createAssemblyManifestStore(storage)
      history = createRegistryHistoryReader({
        storage,
        manifestHistory: manifest,
        sessionTenancy: tenancy,
        memberships,
        storeKey: config.modelRequest.evaluationInputs.storeKey,
        diagnostics: () => {},
        onDiagnosticFailure: () => {},
        monotonicNow: () => process.hrtime.bigint(),
      })
      registry = createAssetRegistry({
        manifest,
        clock,
        sessionTenancy: tenancy,
        currentInputs,
        historicalBody: history,
        deployedMeta: [],
        diagnostic: () => {},
        diagnosticFailure: () => {},
        monotonicNow: () => process.hrtime.bigint(),
        conflictPolicy: { maxRetries: 0 },
        maxInFlight: 2,
      })
      const prepared = await app.prepareSession(who, 'moonshot-service-tools-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      const current = await currentInputs.read(session, who.tenant)
      if (!('input' in current)) throw new Error('actual current inputs unavailable')
      const evaluated = evaluate(current.input)
      if (!('ok' in evaluated)) throw new Error(`evaluation rejected: ${JSON.stringify(evaluated)}`)
      expect(
        await registry.fill(session, evaluated.ok, 'moonshot_tool_eval', evaluated.ok.composition),
      ).toHaveProperty('snapshots')
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(await app.selectModel(who, session, entry.model)).toEqual({ selected: entry.model })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('moonshot-tools-key'),
          body: Buffer.from('controlled-tools-key'),
        })),
      ).toEqual({ stored: true })
      const first = await app.startServiceCall(who, session, {
        user: user('moonshot-tool-1'),
        tools: [TOOL_NAME],
        parameters: PARAMETERS,
        host: host.host,
      })
      if (!('result' in first) || !('replyPending' in first.result))
        throw new Error(`first tool call failed: ${JSON.stringify(first)}`)
      const call = first.result.replyPending.reply.blocks.find(block => block.kind === 'tool_call')
      if (call?.kind !== 'tool_call' || !call.complete)
        throw new Error('actual complete tool call missing')
      expect(await app.persistModelReply(who, session, first.result.replyPending)).toHaveProperty(
        'settled',
      )
      const result = judgeMessage({
        type: 'tool',
        id: 'moonshot-tool-result',
        callId: call.callId,
        createdAt: AT,
        blocks: [
          {
            id: 'moonshot-tool-result-block',
            kind: 'tool_result',
            callId: call.callId,
            outcome: 'completed',
            visibility: VISIBLE,
            blocks: [
              {
                id: 'moonshot-tool-result-text',
                kind: 'text',
                text: 'value=42',
                visibility: VISIBLE,
              },
            ],
          },
        ],
      })
      if (!('ok' in result) || result.ok.type !== 'tool') throw new Error('result fixture invalid')
      expect(
        await app.appendServiceToolResult(who, session, { message: result.ok, host: host.host }),
      ).toEqual({ appended: true })
      tls.setMode('reasoning')
      for (const round of [2, 3]) {
        const sent = await app.startServiceCall(who, session, {
          user: user(`moonshot-tool-${round}`),
          tools: [TOOL_NAME],
          parameters: PARAMETERS,
          host: host.host,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw new Error(`round ${round} failed: ${JSON.stringify(sent)}`)
        expect(await app.persistModelReply(who, session, sent.result.replyPending)).toHaveProperty(
          'settled',
        )
        expect(tls.requests).toHaveLength(round)
      }
      expect(calls.full).toBe(6)
      expect(calls.replay).toEqual([])
      expect(calls.fresh).toEqual([])
      expectRouteWire(tls, entry)
      expectPrefixReplay(tls)
      for (const request of tls.requests)
        expect(request.body).toMatchObject({ tools: [{ function: { name: TOOL_NAME } }] })
      expect(wireMessages(tls, 2).slice(-5)).toMatchObject([
        { role: 'assistant', tool_calls: [{ function: { name: TOOL_NAME, arguments: '{}' } }] },
        { role: 'tool', content: 'value=42' },
        { role: 'user', content: [{ type: 'text', text: 'Request moonshot-tool-2' }] },
        { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
        { role: 'user', content: [{ type: 'text', text: 'Request moonshot-tool-3' }] },
      ])
      expect(tls.failures).toEqual([])
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await registry?.close()
      await history?.close()
      await manifest?.close()
      await tls.close()
    }
  })

  // The archived real-route stream carries each fragment as plain `reasoning` plus one
  // identical `reasoning.text` detail; the details-only variant is counterexample 10 of
  // the adopted visible-reasoning estimate. Both replay as details and are estimated.
  const fragments = ['private ', 'reasoning']
  const detail = (text: string) => [{ type: 'reasoning.text', text, format: 'unknown', index: 0 }]
  it.each([
    {
      shape: 'archived real shape',
      deltas: fragments.map(text => ({ reasoning: text, reasoning_details: detail(text) })),
      thinking: 'private reasoning',
    },
    {
      shape: 'details only',
      deltas: fragments.map(text => ({ reasoning_details: detail(text) })),
      thinking: '',
    },
  ])('$shape reasoning_details history: three rounds, full estimated', async variant => {
    const original = createMoonshotInputMeter(definitionOf(entry))
    const full: string[] = []
    const meter: InputMeter = {
      ...original,
      measureFull(value) {
        const result = original.measureFull(value)
        full.push(result.kind)
        return result
      },
    }
    const config = await moonshotConfig(entry, 'moonshot-service-details', meter)
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      () => entry.model,
      undefined,
      SERVING,
      variant.deltas,
    )
    tls.setMode('reasoning')
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'moonshot-service-details')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('moonshot-details-key'),
          body: Buffer.from('local-only'),
        })),
      ).toEqual({ stored: true })
      expect(await app.selectModel(who, session, entry.model)).toEqual({ selected: entry.model })
      for (let round = 1; round <= 3; round++) {
        const before = await app.readSessionLog(who, session)
        if (!('entries' in before)) throw new Error('durable log unavailable')
        const sent = await app.startServiceCall(who, session, {
          user: user(`moonshot-details-${round}`),
          parameters: PARAMETERS,
          host: host.host,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw new Error(JSON.stringify(sent))
        const thinking = sent.result.replyPending.reply.blocks.find(
          block => block.kind === 'thinking',
        )
        expect(thinking).toMatchObject({ kind: 'thinking', text: variant.thinking })
        expect(await app.persistModelReply(who, session, sent.result.replyPending)).toHaveProperty(
          'settled',
        )
        // One HTTP request per round; the durable history is only appended to.
        expect(tls.requests).toHaveLength(round)
        const after = await app.readSessionLog(who, session)
        if (!('entries' in after)) throw new Error('durable log unavailable')
        expect(after.entries.slice(0, before.entries.length)).toEqual(before.entries)
      }
      // Two plans per round, every one a full estimate (R-A full-only).
      expect(full).toEqual(Array(6).fill('estimated'))
      expectRouteWire(tls, entry)
      expectPrefixReplay(tls)
      // The wire replays the reader-merged detail, never a meter-only `reasoning` string.
      const merged = { reasoning_details: detail('private reasoning') }
      expect(wireMessages(tls, 2).slice(-4)).toEqual([
        { role: 'assistant', content: 'first second', ...merged },
        { role: 'user', content: [{ type: 'text', text: 'Request moonshot-details-2' }] },
        { role: 'assistant', content: 'first second', ...merged },
        { role: 'user', content: [{ type: 'text', text: 'Request moonshot-details-3' }] },
      ])
      expect(tls.failures).toEqual([])
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})
