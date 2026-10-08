import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { physicalBatches } from './sql-batches-fixture.ts'
import { deriveCreationKey } from '../src/call-references.ts'
import { dirname, join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
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
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { CURRENT_EVALUATION_INPUTS as CURRENT_EVALUATION_INPUTS_SERVICE } from '@omne-harness-lite/asset-evaluation/cordis'
import { type CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import {
  createRegistryHistoryReader,
  type RegistryHistoryReader,
} from '@omne-harness-lite/evaluation-input-store/registry-history'
import { judgeMessage } from '@omne-harness-lite/messages'
import { MEMBERSHIPS_SERVICE } from '@omne-harness-lite/organization-governance/cordis'
import { type MembershipsService } from '@omne-harness-lite/organization-governance'
import { SESSION_TENANCY as SESSION_TENANCY_SERVICE } from '@omne-harness-lite/session-tenancy/cordis'
import { type SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { modelName, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import { createAcceptanceApplication } from '../src/index.ts'
import {
  createOfficialProfileContent,
  createOpenAiInputMeter,
  openaiDefinitions,
  openaiConfiguration,
} from '@omne-harness-lite/pi-ai-transport'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment, publication, rootBody, ROOT } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, PASSWORD, ref } from './support.ts'

const MODELS = [
  'openai/gpt-6-luna',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
]
const AT = '2026-09-28T00:00:00Z'
const VISIBLE = { toHuman: true, toModel: true }
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
    blocks: [{ id: `${id}-text`, kind: 'text', text: `Request ${id}`, visibility: VISIBLE }],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('user fixture invalid')
  return judged.ok
}

describe('OpenAI controlled TLS delivery through actual Cordis providers', () => {
  it.each(MODELS)(
    '%s preserves tools, history and developer reminder through settlement and reopen',
    async MODEL => {
      const definition = openaiDefinitions.find(value => value.modelId === MODEL)
      if (definition === undefined) throw new Error('exact OpenAI definition missing')
      const profile = createOfficialProfileContent(definition, {
        providers: ['openai'],
        allowFallback: false,
        configuration: openaiConfiguration,
      })
      if ('rejected' in profile) throw new Error('OpenAI profile rejected')
      const original = await callDeployment(`openai-${MODEL.slice(7)}`)
      const base = {
        ...original,
        officialManifest: { ordinal: 1, entries: [profile.ok] },
        modelRequest: {
          ...original.modelRequest,
          transport: {
            ...original.modelRequest.transport,
            definitions: [definition],
            inputMeters: [createOpenAiInputMeter(definition)],
          },
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
      const tls = await createLocalTls(
        join(dirname(config.databaseFile), 'tls'),
        async () => {},
        0,
        MODEL,
        undefined,
        'OpenAI',
        [
          {
            reasoning_details: [
              { type: 'reasoning.encrypted', data: 'fixture-only-ciphertext', index: 0 },
            ],
          },
        ],
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
      let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
      let manifest: ReturnType<typeof createAssemblyManifestStore> | undefined
      let history: RegistryHistoryReader | undefined
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
        const first = await app.startServiceCall(who, prepared.session, {
          user: user('first-tool-user'),
          tools: [TOOL_NAME],
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
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
        const second = await app.startServiceCall(who, prepared.session, {
          user: user('second-tool-user'),
          tools: [TOOL_NAME],
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
        })
        if (!('result' in second) || !('replyPending' in second.result))
          throw new Error(`second tool call failed: ${JSON.stringify(second)}`)
        expect(bridgeLookups).toBeGreaterThan(firstLookups)
        const secondLookups = bridgeLookups
        expect(
          await app.persistModelReply(who, prepared.session, second.result.replyPending),
        ).toHaveProperty('settled')
        expect(tls.requests).toHaveLength(2)
        expect(tls.requests[0]?.body).toMatchObject({ tools: [{ function: { name: TOOL_NAME } }] })
        expect(tls.requests[1]?.body).toMatchObject({
          messages: [
            { role: 'user' },
            { role: 'assistant', tool_calls: [{ id: call.callId }] },
            { role: 'tool', tool_call_id: call.callId, content: 'value=42' },
            { role: 'user' },
          ],
        })
        // Consume the actual Cordis service to add a request-local reminder to the
        // already durable tool conversation. No runner or tool executor is simulated.
        const bound = await app.bindModelRuntime(who, prepared.session)
        if (!('service' in bound)) throw new Error('actual runtime service missing')
        const effective = await bound.service.effectiveModel({ session: prepared.session })
        if (!('effectiveModel' in effective)) throw new Error('effective model missing')
        const reminder = judgeMessage({
          type: 'system_reminder',
          id: 'openai-reminder',
          createdAt: AT,
          nature: 'event',
          source: { kind: 'extension', extension: 'delivery-business-reminder' },
          blocks: [
            {
              id: 'openai-reminder-text',
              kind: 'text',
              text: 'Keep the tool result value=42 unchanged.',
              visibility: VISIBLE,
            },
          ],
        })
        if (!('ok' in reminder) || reminder.ok.type !== 'system_reminder')
          throw new Error('reminder invalid')
        const opened = await bound.service.openCall({
          creationKey: deriveCreationKey({
            session: prepared.session,
            userMessage: 'openai-reminder-request',
          }),
          session: prepared.session,
          target: MODEL,
          basis: effective.effectiveModel,
          messages: [
            user('first-tool-user'),
            first.result.replyPending.reply,
            result.ok,
            user('second-tool-user'),
            second.result.replyPending.reply,
            reminder.ok,
          ],
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          tools: [TOOL_NAME],
          host: host.host,
        })
        if (!('callId' in opened) || !('state' in opened) || opened.state !== 'open')
          throw new Error(`reminder open failed: ${JSON.stringify(opened)}`)
        if (MODEL !== 'openai/gpt-6-luna') tls.setMode('reasoning')
        const third = await bound.service.dispatch({
          session: prepared.session,
          callId: opened.callId,
        })
        if (!('replyPending' in third))
          throw new Error(`reminder dispatch failed: ${JSON.stringify(third)}`)
        const thirdSettlement = await app.persistModelReply(
          who,
          prepared.session,
          third.replyPending,
        )
        if (!('settled' in thirdSettlement)) throw new Error('reminder reply not durable')
        expect(thirdSettlement.settled.response.response?.replyDisposition).toBe('persisted')
        expect(
          await bound.service.readAttempts({ session: prepared.session, callId: opened.callId }),
        ).toHaveProperty('state', 'complete')
        expect(tls.requests).toHaveLength(3)
        expect(tls.requests[2]?.body).toMatchObject({
          model: MODEL,
          provider: { order: ['openai'], allow_fallbacks: false, require_parameters: true },
          reasoning: { effort: 'low' },
          tools: [{ function: { name: TOOL_NAME } }],
          messages: [
            { role: 'user' },
            { role: 'assistant', tool_calls: [{ id: call.callId }] },
            { role: 'tool', tool_call_id: call.callId, content: 'value=42' },
            { role: 'user' },
            { role: 'assistant', content: 'first second' },
            {
              role: 'developer',
              content: expect.arrayContaining([
                { type: 'text', text: 'Keep the tool result value=42 unchanged.' },
              ]),
            },
          ],
        })
        if (MODEL !== 'openai/gpt-6-luna') {
          // Keep the durable encrypted reply intact. A changed value under its
          // original identity is a source failure; an intact source-less replay
          // still has no applicable full-input counting basis for its ciphertext.
          const reply = third.replyPending.reply
          expect(reply.blocks).toContainEqual(
            expect.objectContaining({
              kind: 'thinking',
              opaque: toOpaqueJson({
                routeName: MODEL,
                reasoning_details: [
                  { type: 'reasoning.encrypted', data: 'fixture-only-ciphertext', index: 0 },
                ],
              }),
            }),
          )
          const beforeEncrypted = await app.readSessionLog(who, prepared.session)
          expect(JSON.stringify(beforeEncrypted)).toContain('fixture-only-ciphertext')
          for (const mixed of [false, true]) {
            const history = judgeMessage({
              ...reply,
              blocks: mixed
                ? reply.blocks
                : reply.blocks.filter(block => block.kind === 'thinking'),
            })
            if (!('ok' in history)) throw new Error('encrypted history invalid')
            const messages = [user('encrypted-replay-user'), history.ok]
            const originalMessages = JSON.stringify(messages)
            expect(
              await bound.service.openCall({
                creationKey: deriveCreationKey({
                  session: prepared.session,
                  userMessage: 'encrypted-replay-user',
                }),
                session: prepared.session,
                target: MODEL,
                basis: effective.effectiveModel,
                messages,
                parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
                tools: [],
                host: host.host,
              }),
            ).toEqual(
              mixed
                ? {
                    invalidInput: {
                      reason: 'input_size_unavailable',
                      metrics: ['maxInputTokens'],
                    },
                  }
                : { unavailable: true },
            )
            expect(JSON.stringify(messages)).toBe(originalMessages)
            expect(tls.requests).toHaveLength(3)
            // No dispatched/opened/response/termination record for either refusal.
            expect(await app.readSessionLog(who, prepared.session)).toEqual(beforeEncrypted)
          }
        }
        const beforeUnknown = await app.readSessionLog(who, prepared.session)
        if (!('entries' in beforeUnknown)) throw new Error('durable prefix missing')
        expect(
          await app.startServiceCall(who, prepared.session, {
            user: user('unknown-tool-user'),
            tools: ['example__missing'],
            parameters: {},
            host: host.host,
          }),
        ).toMatchObject({ invalidInput: { reason: 'unknownTool' } })
        expect(bridgeLookups).toBeGreaterThan(secondLookups)
        expect(tls.requests).toHaveLength(3)
        const afterUnknown = await app.readSessionLog(who, prepared.session)
        if (!('entries' in afterUnknown)) throw new Error('durable prefix missing')
        expect(afterUnknown.entries.slice(beforeUnknown.entries.length)).toHaveLength(1)
        expect(JSON.stringify(afterUnknown.entries.at(-1))).toContain('unknown-tool-user')
        await host.stop()
        expect(
          await app.appendServiceToolResult(who, prepared.session, {
            message: result.ok,
            host: host.host,
          }),
        ).toEqual({ failure: 'stageClosed' })
        const durable = await app.readSessionLog(who, prepared.session)
        if (!('entries' in durable)) throw new Error('durable history missing')
        const serialized = JSON.stringify(durable.entries)
        expect(serialized.match(/"replyDisposition":"persisted"/gu)).toHaveLength(3)
        expect(serialized).toContain('OpenAI')
        expect(serialized).toContain(MODEL)
        expect(serialized).toContain('value=42')
        // Inspect the actual SQL commits: each assistant and response must
        // occupy the same durable batch, with upstream facts kept separate from estimates.
        if (config.sessionLog === undefined) throw new Error('session log configuration absent')
        const batches = physicalBatches(config.databaseFile).filter(batch =>
          batch.entries.some(entry => entry.payload.category === 'response'),
        )
        expect(batches).toHaveLength(3)
        for (const batch of batches) {
          expect(batch).toMatchObject({
            entries: [
              { payload: { category: 'message', value: { type: 'assistant' } } },
              {
                payload: {
                  category: 'response',
                  value: {
                    outcome: 'complete',
                    replyDisposition: 'persisted',
                    route: {
                      servingProvider: 'OpenAI',
                      upstreamModel: MODEL,
                      adaptation: { definition: { modelId: MODEL, revision: definition.revision } },
                    },
                    usage: {
                      input_tokens: 5,
                      output_tokens: 3,
                      cache_read_tokens: 4,
                      cache_write_tokens: 0,
                      source: 'upstream',
                    },
                    cost: { cost_usd: new LosslessNumber('0.0000117'), source: 'upstream_usage' },
                  },
                },
              },
            ],
          })
        }
        expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
        await registry.close()
        await history.close()
        await manifest.close()
        const reopened = createAcceptanceApplication(config, {
          hooks: { extraMigrations: assemblyManifestMigrations },
          stage: 'modelRequest',
          developmentTransport: tls.developmentTransport,
          diagnostics: { record() {} },
        })
        let reopenedDiagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
        try {
          await reopened.ready
          const authenticated = await reopened.authenticate('alice', PASSWORD)
          if (!('account' in authenticated)) throw new Error('reopen authentication failed')
          reopenedDiagnostics = await activateModelFixture(reopened, authenticated, config)
          expect(await reopened.readSessionLog(authenticated, prepared.session)).toEqual(durable)
          expect(tls.requests).toHaveLength(3)
        } finally {
          const closed = reopenedDiagnostics
            ? await reopenedDiagnostics.closeAfterBusiness(() => reopened.close())
            : await reopened.close()
          expect(closed.complete).toBe(true)
        }
        expect(tls.failures).toEqual([])
        expect(await host.stop()).toEqual({ released: true })
      } finally {
        await host.stop()
        if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
        else await app.close()
        await registry?.close()
        await history?.close()
        await manifest?.close()
        await tls.close()
      }
    },
  )
})
