import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import type { AssetDefinition, AssetHolding } from '@omne-harness-lite/asset-model'
import {
  assemblyManifestMigrations,
  createAssemblyManifestStore,
} from '@omne-harness-lite/assembly-manifest-store'
import {
  createAssetRegistry,
  type AssetRegistry,
  type AssetRegistryService,
} from '@omne-harness-lite/asset-registry'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import {
  CURRENT_EVALUATION_INPUTS_SERVICE,
  type CurrentEvaluationInputs,
} from '@omne-harness-lite/evaluation-input-store'
import {
  createRegistryHistoryReader,
  type RegistryHistoryReader,
} from '@omne-harness-lite/evaluation-input-store/registry-history'
import { judgeMessage } from '@omne-harness-lite/messages'
import { MEMBERSHIPS_SERVICE } from '@omne-harness-lite/organization-governance/cordis'
import { type MembershipsService } from '@omne-harness-lite/organization-governance'
import {
  SESSION_TENANCY_SERVICE,
  type SessionTenancyService,
} from '@omne-harness-lite/session-tenancy-table'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { modelName, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment, publication, rootBody, ROOT } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const models = [
  { variant: 'pro', model: 'deepseek/deepseek-v4-pro-0813' },
  { variant: 'flash', model: 'deepseek/deepseek-v4.1-flash' },
] as const
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

describe.each(models)('$model service tool history', ({ variant, model }) => {
  it('uses the actual registry and manifest, then sends one paired durable tool result', async () => {
    const base = await callDeployment(`service-real-tools-${variant}`, variant)
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
      model,
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
      const currentInputs: CurrentEvaluationInputs = context.get(CURRENT_EVALUATION_INPUTS_SERVICE)
      const tenancy: SessionTenancyService = context.get(SESSION_TENANCY_SERVICE)
      const memberships: MembershipsService | undefined = context.get(MEMBERSHIPS_SERVICE)
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
      if (!('ok' in evaluated)) throw new Error(`evaluation rejected: ${JSON.stringify(evaluated)}`)
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
      expect(await manifest.readHead(prepared.session)).toHaveProperty('head', beforeFill.head + 1)
      expect(
        await registry.lookup(prepared.session, 'tool', TOOL_NAME, { kind: 'session' }),
      ).toHaveProperty('entry')
      expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({
        attached: true,
      })
      expect(await app.selectModel(who, prepared.session, model)).toEqual({ selected: model })
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
      const call = first.result.replyPending.reply.blocks.find(block => block.kind === 'tool_call')
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
      if (!('ok' in result) || result.ok.type !== 'tool') throw new Error('result fixture invalid')
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
      expect(tls.requests).toHaveLength(2)
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
      let businessClose: Awaited<ReturnType<typeof app.close>> | undefined
      const closed = await diagnostics.closeAfterBusiness(async () => {
        businessClose = await app.close()
        return businessClose
      })
      expect(businessClose?.complete).toBe(true)
      expect(closed.complete).toBe(true)
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
  })
})
