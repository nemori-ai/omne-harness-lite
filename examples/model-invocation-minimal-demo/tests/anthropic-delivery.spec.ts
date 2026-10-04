import { deriveCreationKey } from '../src/call-references.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import type { AssetDefinition, AssetHolding } from '@omne-harness-lite/asset-model'
import {
  assemblyManifestMigrations,
  createAssemblyManifestStore,
} from '@omne-harness-lite/assembly-manifest-store'
import { createAssetRegistry, type AssetRegistry } from '@omne-harness-lite/asset-registry-local'
import { type AssetRegistryService } from '@omne-harness-lite/asset-registry'
import { readOpaqueJson, toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { CURRENT_EVALUATION_INPUTS as CURRENT_EVALUATION_INPUTS_SERVICE } from '@omne-harness-lite/asset-evaluation/cordis'
import { type CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import {
  createRegistryHistoryReader,
  type RegistryHistoryReader,
} from '@omne-harness-lite/evaluation-input-store/registry-history'
import { judgeMessage, type LoggedMessage } from '@omne-harness-lite/messages'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { anthropicDefinitions, createAnthropicInputMeter, createOfficialProfileContent } from '@omne-harness-lite/pi-ai-transport'
import { type InputMeter } from '@omne-harness-lite/model-request-runtime'
import { MEMBERSHIPS_SERVICE } from '@omne-harness-lite/organization-governance/cordis'
import { type MembershipsService } from '@omne-harness-lite/organization-governance'
import { SESSION_TENANCY as SESSION_TENANCY_SERVICE } from '@omne-harness-lite/session-tenancy/cordis'
import { type SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { modelName, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import { createAcceptanceApplication } from '../src/index.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment, publication, rootBody, ROOT } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const AT = '2026-09-28T00:00:00Z'
const VISIBLE = { toHuman: true, toModel: true }
const IMAGE = readFileSync(
  new URL(
    '../../../packages/model/pi-ai-transport/tests/fixtures/anthropic/reference-1x1.png',
    import.meta.url,
  ),
).toString('base64')
const WIRE_IMAGE = { type: 'image_url', image_url: { url: `data:image/png;base64,${IMAGE}` } }
function imageBlock(id: string) {
  return { id, kind: 'image', mediaType: 'image/png', data: { inline: IMAGE }, visibility: VISIBLE }
}
// Controlled opaque payload checks byte-for-byte preservation, not signature validity
// or the applicability of the current rough estimate to hidden full thinking.
const SIGNED_REASONING = [
  {
    type: 'reasoning.text',
    text: 'Summarized thinking: inspect the image.',
    signature: 'controlled-signature+/==',
    id: 'signed-thinking-1',
    format: 'anthropic-claude-v1',
    index: 0,
  },
]
const CASES = anthropicDefinitions.flatMap(definition =>
  ['plain', 'signed'].map(mode => ({ definition, modelId: definition.modelId, mode })),
)
const TOOL = { category: 'tool', name: 'example:read' } as const
const TOOL_NAME = modelName(TOOL.name)
const DEFINITION = {
  name: TOOL.name,
  paradigm: 'single',
  description: 'Read a fixture value',
  origin: { kind: 'authored' },
  input: { type: 'object', properties: {}, additionalProperties: false },
  permissions: { execute: { default: 'auto' } },
} as const satisfies ToolDefinition

function user(id: string) {
  const judged = judgeMessage({
    type: 'user',
    id,
    createdAt: AT,
    blocks: [
      { id: `${id}-text`, kind: 'text', text: `Request ${id}`, visibility: VISIBLE },
      ...(id === 'thinking-user' ? [imageBlock('user-image')] : []),
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('user fixture invalid')
  return judged.ok
}

function withoutPlannerCache(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPlannerCache)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, member]) =>
      key === 'cache_control' &&
      member !== null &&
      typeof member === 'object' &&
      'type' in member &&
      member.type === 'ephemeral' &&
      'ttl' in member &&
      member.ttl === '1h'
        ? []
        : [[key, withoutPlannerCache(member)]],
    ),
  )
}

describe('Anthropic controlled TLS service delivery (not upstream certification)', () => {
  it.each(CASES)(
    '$modelId $mode preserves full image/thinking/tool/reminder history',
    async ({ definition, mode }) => {
      const MODEL = definition.modelId
      const base = await callDeployment('anthropic-delivery')
      const profile = createOfficialProfileContent(definition, {
        providers: ['anthropic'],
        allowFallback: false,
        configuration: {
          revision: 'delivery-1',
          values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
        },
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      const actualMeter = createAnthropicInputMeter(definition)
      const measured: Parameters<InputMeter['measureFull']>[0][] = []
      const marginalNew: Parameters<InputMeter['measureNew']>[0][] = []
      const meter: InputMeter = {
        ...actualMeter,
        measureFull(input) {
          const result = actualMeter.measureFull(input)
          expect(result.kind).toBe('estimated')
          measured.push(input)
          return result
        },
        measureNew(input) {
          marginalNew.push(input)
          return actualMeter.measureNew(input)
        },
      }
      let registry: AssetRegistry | undefined
      let bridgeLookups = 0
      let storage: AtomicStorage | undefined
      let context: Context | undefined
      const bridge: Pick<AssetRegistryService, 'lookup'> = {
        async lookup(session, category, name, within) {
          bridgeLookups++
          return registry === undefined
            ? { failure: 'unavailable' }
            : registry.lookup(session, category, name, within)
        },
      }
      const config = {
        ...base,
        officialManifest: { ordinal: 1, entries: [profile.ok] },
        modelRequest: {
          ...base.modelRequest,
          transport: {
            ...base.modelRequest.transport,
            definitions: [definition],
            inputMeters: [meter],
          },
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
                    content: { category: 'tool', definition: DEFINITION },
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
      // Deliberately differs from the estimate: actual usage must survive unchanged.
      const usage = JSON.stringify({
        prompt_tokens: 10000,
        completion_tokens: 3,
        prompt_tokens_details: { cached_tokens: 3000, cache_write_tokens: 2000 },
        cost: 0.0001234567890123,
      })
      const tls = await createLocalTls(
        join(dirname(config.databaseFile), 'tls'),
        async () => {},
        2000,
        MODEL,
        usage,
        'Anthropic',
        mode === 'signed' ? [{ reasoning_details: SIGNED_REASONING }] : undefined,
      )
      tls.setMode('reasoning')
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
      let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
      let manifest: ReturnType<typeof createAssemblyManifestStore> | undefined
      let history: RegistryHistoryReader | undefined
      try {
        await app.ready
        const who = await actor(app)
        diagnostics = await activateModelFixture(app, who, config)
        if (storage === undefined || context === undefined)
          throw new Error('provider capture missing')
        const currentInputs = context.get(
          CURRENT_EVALUATION_INPUTS_SERVICE,
        )
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
        const prepared = await app.prepareSession(who, 'service-real-tools-session')
        if (!('session' in prepared)) throw new Error('session preparation failed')
        expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
        const current = await currentInputs.read(prepared.session, who.tenant)
        if (!('input' in current)) throw new Error('actual current inputs unavailable')
        const evaluated = evaluate(current.input)
        if (!('ok' in evaluated))
          throw new Error(`evaluation rejected: ${JSON.stringify(evaluated)}`)
        const beforeFill = await manifest.readHead(prepared.session)
        if (!('head' in beforeFill)) throw new Error('manifest head unavailable before fill')
        expect(
          await registry.fill(
            prepared.session,
            evaluated.ok,
            'service_tool_eval',
            evaluated.ok.composition,
          ),
        ).toHaveProperty('snapshots')
        expect(await manifest.readHead(prepared.session)).toHaveProperty(
          'head',
          beforeFill.head + 1,
        )
        expect(
          await registry.lookup(prepared.session, 'tool', TOOL_NAME, { kind: 'session' }),
        ).toHaveProperty('entry')
        expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({
          attached: true,
        })
        expect(await app.selectModel(who, prepared.session, MODEL)).toEqual({ selected: MODEL })
        expect(
          await app.publishCredential(who, async checked => ({
            account: checked.account,
            tenant: checked.tenant,
            sourceRef: ref('service-tools-key'),
            body: Buffer.from('controlled-tools-key'),
          })),
        ).toEqual({ stored: true })
        const thought = await app.startServiceCall(who, prepared.session, {
          user: user('thinking-user'),
          tools: [TOOL_NAME],
          parameters: { reasoningEffort: 'high', maxOutputTokens: 1024 },
          host: host.host,
        })
        if (!('result' in thought) || !('replyPending' in thought.result))
          throw new Error(`thinking call failed: ${JSON.stringify(thought)}`)
        expect(thought.result.replyPending.reply.blocks).toContainEqual(
          expect.objectContaining({
            kind: 'thinking',
            text: mode === 'signed' ? '' : 'private reasoning',
          }),
        )
        expect(
          await app.persistModelReply(who, prepared.session, thought.result.replyPending),
        ).toHaveProperty('settled')
        tls.setMode('tool')
        const first = await app.startServiceCall(who, prepared.session, {
          user: user('first-tool-user'),
          tools: [TOOL_NAME],
          // Preserved thinking binds its original prompt; keep signed turns' effort stable.
          parameters: {
            reasoningEffort: mode === 'signed' ? 'high' : 'low',
            maxOutputTokens: 1024,
          },
          host: host.host,
        })
        if (!('result' in first) || !('replyPending' in first.result))
          throw new Error(`first tool call failed: ${JSON.stringify(first)}`)
        expect(bridgeLookups).toBeGreaterThan(0)
        const firstLookups = bridgeLookups
        const call = first.result.replyPending.reply.blocks.find(
          block => block.kind === 'tool_call',
        )
        if (call?.kind !== 'tool_call' || !call.complete)
          throw new Error('actual complete tool call missing')
        expect(
          await app.persistModelReply(who, prepared.session, first.result.replyPending),
        ).toHaveProperty('settled')
        const result = judgeMessage({
          type: 'tool',
          id: 'actual-tool-result',
          callId: call.callId,
          createdAt: AT,
          blocks: [
            {
              id: 'actual-tool-result-block',
              kind: 'tool_result',
              callId: call.callId,
              outcome: 'completed',
              visibility: VISIBLE,
              blocks: [
                {
                  id: 'actual-tool-result-text',
                  kind: 'text',
                  text: 'value=42',
                  visibility: VISIBLE,
                },
                imageBlock('tool-result-image'),
              ],
            },
          ],
        })
        if (!('ok' in result) || result.ok.type !== 'tool')
          throw new Error('result fixture invalid')
        expect(
          await app.appendServiceToolResult(who, prepared.session, {
            message: result.ok,
            host: host.host,
          }),
        ).toEqual({ appended: true })
        expect(
          await app.appendServiceToolResult(who, prepared.session, {
            message: result.ok,
            host: host.host,
          }),
        ).toEqual({ invalidInput: { reason: 'malformed' } })
        const other = await actor(app, 'other')
        expect(
          await app.appendServiceToolResult(other, prepared.session, {
            message: result.ok,
            host: host.host,
          }),
        ).toEqual({ failure: 'identityMismatch' })
        tls.setMode('complete')
        const durable = await app.readSessionLog(who, prepared.session)
        if (!('entries' in durable)) throw new Error('durable history missing')
        const messages: LoggedMessage[] = []
        for (const entry of durable.entries) {
          if (
            !entry.readKeys.some(key => {
              const decoded = decodeModelLogKey(key)
              return 'ok' in decoded && decoded.ok.kind === 'messages'
            })
          )
            continue
          const payload = entry.payload
          if (payload === null || typeof payload !== 'object' || !('value' in payload))
            throw new Error('message payload missing')
          const checked = judgeMessage(payload.value)
          if (!('ok' in checked) || checked.ok.type === 'system')
            throw new Error('logged message invalid')
          messages.push(checked.ok)
        }
        expect(messages).toHaveLength(5)
        if (mode === 'signed') {
          const thinking = messages[1]?.blocks.find(block => block.kind === 'thinking')
          if (thinking?.kind !== 'thinking' || thinking.opaque === undefined)
            throw new Error('durable signed thinking missing')
          expect(readOpaqueJson(thinking.opaque)).toEqual({
            routeName: MODEL,
            reasoning_details: SIGNED_REASONING,
          })
        }
        const reminder = judgeMessage({
          type: 'system_reminder',
          id: 'delivery-reminder',
          createdAt: AT,
          nature: 'event',
          source: { kind: 'attempt_started', attempt: 1, reason: 'first', at: AT },
          blocks: [
            {
              id: 'reminder-text',
              kind: 'text',
              text: 'Use the tool result: 值为42.',
              visibility: VISIBLE,
            },
          ],
        })
        if (!('ok' in reminder)) throw new Error('reminder invalid')
        const bound = await app.bindModelRuntime(who, prepared.session)
        if (!('service' in bound)) throw new Error('service binding missing')
        const effective = await bound.service.effectiveModel({ session: prepared.session })
        if (!('effectiveModel' in effective)) throw new Error('effective model missing')
        // Caller-provided reminder belongs to this request; all prior turns are actual durable values.
        const opened = await bound.service.openCall({
          creationKey: deriveCreationKey({
            session: prepared.session,
            userMessage: 'anthropic-reminder-request',
          }),
          session: prepared.session,
          target: MODEL,
          basis: effective.effectiveModel,
          messages: [...messages, reminder.ok],
          tools: [TOOL_NAME],
          parameters: { reasoningEffort: 'high', maxOutputTokens: 1024 },
          host: host.host,
        })
        if (!('callId' in opened))
          throw new Error(`reminder call failed: ${JSON.stringify(opened)}`)
        const final = await bound.service.dispatch({
          session: prepared.session,
          callId: opened.callId,
        })
        if (!('replyPending' in final))
          throw new Error(`reminder dispatch failed: ${JSON.stringify(final)}`)
        expect(bridgeLookups).toBeGreaterThan(firstLookups)
        expect(
          await app.persistModelReply(who, prepared.session, final.replyPending),
        ).toHaveProperty('settled')
        expect(tls.requests).toHaveLength(3)
        const finalPlans = [...new Map(measured.map(input => [input.serialized, input])).values()]
        expect(finalPlans.length + marginalNew.length).toBeGreaterThanOrEqual(3)
        for (const [index, request] of tls.requests.entries()) {
          const full = finalPlans.find(
            input => JSON.stringify(request.body) === JSON.stringify(JSON.parse(input.serialized)),
          )
          if (full !== undefined) expect(request.body).toEqual(JSON.parse(full.serialized))
          else {
            if (
              request.body === null ||
              typeof request.body !== 'object' ||
              !('messages' in request.body) ||
              !Array.isArray(request.body.messages)
            )
              throw new Error('actual marginal wire has no messages')
            const { messages, ...envelope } = request.body
            const projected = messages.map(withoutPlannerCache)
            expect(
              marginalNew.some(input => {
                if (JSON.stringify(input.envelope) !== JSON.stringify(envelope)) return false
                let next = 0
                for (const unit of input.units) {
                  const found = projected.findIndex(
                    (candidate, index) =>
                      index >= next && JSON.stringify(candidate) === JSON.stringify(unit),
                  )
                  if (found < 0) return false
                  next = found + 1
                }
                return input.units.length > 0
              }),
            ).toBe(true)
          }
          expect(request.body).toMatchObject({
            model: MODEL,
            provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
            tools: [{ function: { name: TOOL_NAME, parameters: DEFINITION.input } }],
          })
          expect(request.authorization).toBe('Bearer controlled-tools-key')
        }
        expect(tls.requests[2]?.body).toMatchObject({
          reasoning: { effort: 'high' },
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Request thinking-user' }, WIRE_IMAGE],
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'first second' }],
              ...(mode === 'signed'
                ? { reasoning_details: SIGNED_REASONING }
                : { reasoning: 'private reasoning' }),
            },
            { role: 'user', content: [{ type: 'text', text: 'Request first-tool-user' }] },
            { role: 'assistant', tool_calls: [{ id: call.callId }] },
            {
              role: 'tool',
              tool_call_id: call.callId,
              content: [{ type: 'text', text: 'value=42' }],
            },
            { role: 'user', content: [WIRE_IMAGE] },
            {
              role: 'user',
              content: [
                { type: 'text', text: '[system_reminder "delivery-reminder"]' },
                {
                  type: 'text',
                  text: 'Use the tool result: 值为42.',
                  cache_control: { type: 'ephemeral', ttl: '1h' },
                },
              ],
            },
          ],
        })
        if (mode === 'signed') {
          for (const request of tls.requests.slice(1)) {
            expect(request.body).toMatchObject({
              messages: expect.arrayContaining([
                {
                  role: 'assistant',
                  content: [{ type: 'text', text: 'first second' }],
                  reasoning_details: SIGNED_REASONING,
                },
              ]),
            })
          }
        }
        const read = await app.readSessionLog(who, prepared.session)
        if (!('entries' in read)) throw new Error('settled history missing')
        const responses = read.entries.filter(entry =>
          entry.readKeys.some(key => {
            const decoded = decodeModelLogKey(key)
            return 'ok' in decoded && decoded.ok.kind === 'response'
          }),
        )
        expect(responses).toHaveLength(3)
        for (const index of [0, 2]) {
          const response = writeJsonLossless(responses[index]?.payload)
          expect(JSON.parse(response)).toMatchObject({ value: { usage: { input_tokens: 5000 } } })
          expect(response).toContain('"cache_read_tokens":3000')
          expect(response).toContain('"cache_write_tokens":2000')
          expect(response).toContain('"output_tokens":3')
          expect(response).toContain('"cost_usd":0.0001234567890123')
          expect(response).toContain('"source":"upstream_usage"')
          expect(response).toContain(MODEL)
          expect(response).toContain('Anthropic')
        }
        // The tool response intentionally has its own actual usage; do not reuse a prior estimate/account.
        expect(writeJsonLossless(responses[1]?.payload)).toContain('"cache_read_tokens":4')
        expect(writeJsonLossless(responses[1]?.payload)).toContain('"cache_write_tokens":0')
        expect(tls.failures).toEqual([])
        await host.stop()
        expect(
          await app.appendServiceToolResult(who, prepared.session, {
            message: result.ok,
            host: host.host,
          }),
        ).toEqual({ failure: 'stageClosed' })
        const closed = await diagnostics.closeAfterBusiness(async () => {
          const business = await app.close()
          expect(business.complete).toBe(true)
          return business
        })
        expect(closed.complete).toBe(true)
        expect(await host.stop()).toEqual({ released: true })
      } finally {
        await host.stop()
        if (diagnostics === undefined) await app.close()
        else await diagnostics.closeAfterBusiness(() => app.close())
        await registry?.close()
        await history?.close()
        await manifest?.close()
        await tls.close()
      }
    },
  )
})
