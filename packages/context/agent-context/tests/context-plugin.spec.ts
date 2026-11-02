// `AgentContextProvider` on real Cordis 4.0.4: the real request-context provider, the real
// runtime-context provider, the memory holder double of contextHolderSources (K-RQ), a scripted
// reader eligibility handoff (K-RC), the Model request preparation double, and the stand-in for the
// Model preparation resources key (X-3). The plugin loads only with all six keys, provides two
// services, withdraws what it registered when it stops, and the holder closes its reads only after
// the settlement it pulled has ended.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { agentModelContextKey, agentRequestsKey } from '@omne-harness/agent-cordis-contract/cordis'
import {
  AgentContextProvider,
  MODEL_PREPARATION_RESOURCES,
} from '@omne-harness/agent-context/cordis'
import { ModelRequestPreparationService } from '@omne-harness/model-cordis-contract/cordis'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'
import {
  RequestContextTrustService,
  contextHolderSourcesKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createMemoryContextHolder } from '@omne-harness/request-context-cordis-contract/testing'
import {
  createMemoryAdoptedSource,
  createMemoryReadEligibility,
  createTestingPrincipalBinding,
} from '@omne-harness/request-context-contract/testing'
import { RuntimeContextProvider } from '@omne-harness/runtime-context-cordis/cordis'
import {
  RuntimeContextReaderEligibilityService,
  RuntimeContextTrustService,
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createScriptedReaderEligibility } from '@omne-harness/runtime-context-cordis-contract/testing'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import type { EligibilityId } from '@omne-harness/runtime-context-contract'
import { modelRequestPreparationKey } from '@omne-harness/model-cordis-contract/cordis'
import {
  RESULT_CAPACITY,
  createWorld,
  evidence,
  owner,
  type World,
} from './fixtures/context-world.ts'

// `FiberState` is a const enum in Cordis 4.0.4, erased at runtime: PENDING is its first member,
// ACTIVE its third and FAILED its fourth.
const PENDING = 0
const ACTIVE = 2
const FAILED = 3
const config = { owner, resultCapacity: RESULT_CAPACITY }

class ProbeTrust extends RequestContextTrustService<unknown> {
  readonly principalBinding = createTestingPrincipalBinding<unknown>()
  readonly registrationAuthority = { check: async () => ({ kind: 'allowed' as const }) }
}

/** Every provider the plugin injects, each as its own plugin so a test can leave one out. */
async function providers(w: World) {
  const ports = createTestAuthorityPorts<unknown>()
  ports.bind(w.f.target.scope, w.tenant)
  let held: EligibilityId = { eligibility: 'none' }
  class RcTrust extends RuntimeContextTrustService<unknown> {
    readonly authority = ports.authority
    readonly bindings = ports.bindings
  }
  class Handoff extends RuntimeContextReaderEligibilityService<unknown> {
    current(request: Parameters<RuntimeContextReaderEligibilityService<unknown>['current']>[0]) {
      return createScriptedReaderEligibility<unknown>({
        scopes: [{ scope: w.f.target.scope, tenant: w.tenant }],
        answers: [
          {
            request: {
              principal: 'ada',
              tenant: w.tenant,
              scope: w.f.target.scope,
              consumer: 'model',
            },
            result: { kind: 'current', eligibility: held },
          },
        ],
      }).current(request)
    }
  }
  class Model extends ModelRequestPreparationService<unknown> {
    readonly prepare = (input: Parameters<World['model']['prepare']>[0]) =>
      w.model.prepare(input as never)
  }
  const holder = createMemoryContextHolder<unknown>({
    parts: w.parts as never,
    admits: () => true,
  })
  const plugins = {
    requestContext: async (ctx: Context) => {
      await ctx.plugin(ProbeTrust)
      return ctx.plugin(RequestContextProvider, {
        policies: w.f.policies,
        accounting: {
          sourceAuthority: { check: async () => ({ kind: 'allowed' as const }) },
          readEligibility: createMemoryReadEligibility<unknown>(),
          adoptedSource: createMemoryAdoptedSource<unknown>(),
          recoveryAuthority: {
            check: async () => ({ kind: 'allowed' as const }),
            checkFact: async () => ({ kind: 'allowed' as const }),
          },
          limits: { maxTargets: 4, maxFactsPerTarget: 4, maxRevisionsPerDispatch: 4 },
        },
      })
    },
    contextHolderSources: (ctx: Context) => ctx.plugin(holder.plugin),
    runtimeContextReaderEligibility: (ctx: Context) => ctx.plugin(Handoff),
    runtimeContext: async (ctx: Context) => {
      await ctx.plugin(RcTrust)
      const fiber = await ctx.plugin(RuntimeContextProvider)
      const rc = ctx.get(runtimeContextKey)
      if (rc === undefined) throw new Error('no runtime context')
      const begun = await rc.beginReplay('holder', {
        scope: w.f.target.scope,
        tenant: w.tenant,
        through: null,
        supersedes: null,
      })
      if (begun.kind !== 'replaying') throw new Error(begun.kind)
      await rc.finishReplay('holder', {
        replay: begun.replay,
        material: { registrations: [], checkpoints: [], end: null },
      })
      const issued = await rc.issueEligibility('holder', {
        supersedes: null,
        scope: w.f.target.scope,
        consumer: 'model',
        principal: 'ada',
        tenant: w.tenant,
        keys: [],
        bindings: [],
        registrationRevision: 0,
      })
      if (issued.kind !== 'issued') throw new Error(issued.kind)
      held = issued.eligibility.id
      return fiber
    },
    modelRequestPreparation: (ctx: Context) => ctx.plugin(Model),
    modelPreparationResources: (ctx: Context) =>
      ctx.plugin({
        name: 'x3-stand-in',
        apply(inner: Context) {
          inner.provide(MODEL_PREPARATION_RESOURCES, w.f.preparation)
        },
      }),
  }
  return { plugins, holder }
}
type Key = keyof Awaited<ReturnType<typeof providers>>['plugins']
const KEYS: readonly Key[] = [
  'requestContext',
  'contextHolderSources',
  'runtimeContextReaderEligibility',
  'runtimeContext',
  'modelRequestPreparation',
  'modelPreparationResources',
]

async function assembled(leaveOut: Key | null = null) {
  const w = await createWorld()
  const { plugins, holder } = await providers(w)
  const ctx = new Context()
  const fibers = new Map<Key, Awaited<ReturnType<(typeof plugins)[Key]>>>()
  for (const key of KEYS) if (key !== leaveOut) fibers.set(key, await plugins[key](ctx))
  const plugin = await ctx.plugin(AgentContextProvider, config)
  return { w, ctx, plugin, holder, fibers }
}

async function readAndPrepare(ctx: Context, w: World) {
  const reader = ctx.get(agentModelContextKey)
  const requests = ctx.get(agentRequestsKey)
  if (reader === undefined || requests === undefined) throw new Error('services absent')
  const read = await reader.read(w.readInput())
  if (!('ok' in read)) throw new Error(`read refused: ${JSON.stringify(read.failure)}`)
  return requests.prepare(w.prepareInput(read.ok))
}

describe('AgentContextProvider on real Cordis', () => {
  it('loads with every key, provides both services, and serves a read and a prepare', async () => {
    const { ctx, plugin, w } = await assembled()
    expect(plugin.state).toBe(ACTIVE)
    const prepared = await readAndPrepare(ctx, w)
    expect('ok' in prepared && prepared.ok.kind).toBe('assembled')
  })

  for (const key of KEYS)
    it(`stays pending and provides nothing while ${key} is absent`, async () => {
      const { ctx, plugin } = await assembled(key)
      expect(plugin.state).toBe(PENDING)
      expect(ctx.get(agentRequestsKey)).toBeUndefined()
      expect(ctx.get(agentModelContextKey)).toBeUndefined()
    })

  it('injects no key of model selection, the journal or the extensions', () => {
    expect(Object.keys(AgentContextProvider.inject).sort()).toEqual(
      [
        contextHolderSourcesKey,
        MODEL_PREPARATION_RESOURCES,
        modelRequestPreparationKey,
        requestContextKey,
        runtimeContextKey,
        runtimeContextReaderEligibilityKey,
      ].sort(),
    )
    expect(AgentContextProvider.inject[runtimeContextKey]).toEqual({ consumer: 'model' })
  })

  it('stops: the keys go, kept references answer unavailable, and its source set is withdrawn', async () => {
    const { ctx, plugin, w, holder } = await assembled()
    const requests = ctx.get(agentRequestsKey)
    const reader = ctx.get(agentModelContextKey)
    if (requests === undefined || reader === undefined) throw new Error('services absent')
    expect('ok' in (await readAndPrepare(ctx, w))).toBe(true)
    await plugin.dispose()
    expect(ctx.get(agentRequestsKey)).toBeUndefined()
    expect(ctx.get(agentModelContextKey)).toBeUndefined()
    const closed = {
      failure: { kind: 'unavailable', owner: 'agent-context', diagnostic: 'agent-context-closed' },
    }
    expect(await reader.read(w.readInput())).toEqual(closed)
    const context = {
      recipient: w.selection.recipient,
      content: 'full' as const,
      source: evidence('read'),
      coverage: evidence('read'),
    }
    expect(await requests.prepare(w.prepareInput(context))).toEqual(closed)
    // The holder pulled the settlement once, and it settled.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(holder.settlements()).toEqual([{ kind: 'settled' }])
    const served = await ctx.get(requestContextKey)?.assembly(w.f.target).assemble(w.f.call)
    expect(served?.kind).toBe('unavailable')
  })

  it('the holder closes its reads only after the settlement of an operation in flight', async () => {
    const { ctx, w, holder, fibers } = await assembled()
    const gate = Promise.withResolvers<void>()
    const history = w.f.sources.history
    const read = history.read.bind(history)
    let held = false
    history.read = async input => {
      if (!held) {
        held = true
        await gate.promise
      }
      return read(input)
    }
    const inFlight = readAndPrepare(ctx, w)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(held).toBe(true)
    const stopping = fibers.get('contextHolderSources')?.dispose()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(holder.settlements()).toEqual([])
    expect(holder.readsClosed).toBe(false)
    gate.resolve()
    await inFlight
    await stopping
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(holder.settlements()).toEqual([{ kind: 'settled' }])
    expect(holder.readsClosed).toBe(true)
    expect(ctx.get(agentRequestsKey)).toBeUndefined()
  })

  it('fails to load a configuration without a result capacity', async () => {
    const w = await createWorld()
    const { plugins } = await providers(w)
    const ctx = new Context()
    for (const key of KEYS) await plugins[key](ctx)
    const plugin = ctx.plugin(AgentContextProvider, { owner } as never)
    await Promise.resolve(plugin).catch(() => undefined)
    expect(plugin.state).toBe(FAILED)
    expect(ctx.get(agentRequestsKey)).toBeUndefined()
  })
})
