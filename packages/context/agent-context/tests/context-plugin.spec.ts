import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  AgentAdoptionsService,
  agentAdoptionsKey,
  agentCompactionInputsKey,
  agentRequestsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { AgentAdoptions, AgentDefinition } from '@omne-harness/agent-contract'
import type { ContextMeasureEvent, ToolLookup } from '@omne-harness/agent-context'
import {
  AgentContextProvider,
  MODEL_PREPARATION_RESOURCES,
  createAgentContextPlugin,
} from '@omne-harness/agent-context/cordis'
import { ModelRequestPreparationService } from '@omne-harness/model-cordis-contract/cordis'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'
import {
  RequestContextTrustService,
  contextHolderSourcesKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createMemoryContextHolder } from '@omne-harness/request-context-cordis-contract/testing'
import { createTestingPrincipalBinding } from '@omne-harness/request-context-contract/testing'
import { modelRequestPreparationKey } from '@omne-harness/model-cordis-contract/cordis'
import { createWorld, owner, type World } from './fixtures/context-world.ts'

const PENDING = 0
const ACTIVE = 2
const FAILED = 3
const config = { owner }

const CODING: AgentDefinition = {
  category: 'AgentDefinition',
  name: 'coding',
  references: [],
  attributes: [],
  instructions: [
    { id: 'role', text: '# Role\n\nYou are the coding agent.' },
    { id: 'tools', text: '# Tools\n\nUse help first.' },
  ],
}
const CODING_ADOPTION = { owner: 'release', name: 'coding', revision: '1', digest: 'sha256:coding' }
class Adoptions extends AgentAdoptionsService<unknown> {
  readonly resolve: AgentAdoptions<unknown>['resolve'] = async input =>
    input.adoption.name === CODING_ADOPTION.name
      ? { ok: { definition: CODING, evaluator: {} as never, extensions: [] } }
      : { failure: { kind: 'invalid', field: 'adoption', reason: 'not of this deployment' } }
  readonly handover: AgentAdoptions<unknown>['handover'] = async () => ({
    failure: { kind: 'unsupported' },
  })
}

class ProbeTrust extends RequestContextTrustService<unknown> {
  readonly principalBinding = createTestingPrincipalBinding<unknown>()
  readonly registrationAuthority = { check: async () => ({ kind: 'allowed' as const }) }
}

async function providers(w: World) {
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
      })
    },
    contextHolderSources: (ctx: Context) => ctx.plugin(holder.plugin),
    modelRequestPreparation: (ctx: Context) => ctx.plugin(Model),
    modelPreparationResources: (ctx: Context) =>
      ctx.plugin({
        name: 'x3-stand-in',
        apply(inner: Context) {
          inner.provide(MODEL_PREPARATION_RESOURCES, w.f.preparation)
        },
      }),
    agentCompactionInputs: (ctx: Context) =>
      ctx.plugin({
        name: 'frozen-inputs',
        apply(inner: Context) {
          inner.provide(agentCompactionInputsKey, w.compactionInputs)
        },
      }),
    agentAdoptions: (ctx: Context) => ctx.plugin(Adoptions),
  }
  return { plugins, holder }
}
type Key = keyof Awaited<ReturnType<typeof providers>>['plugins']
const KEYS: readonly Key[] = [
  'requestContext',
  'contextHolderSources',
  'modelRequestPreparation',
  'modelPreparationResources',
  'agentAdoptions',
  'agentCompactionInputs',
]

async function assembled(
  leaveOut: Key | null = null,
  Plugin: typeof AgentContextProvider = AgentContextProvider,
) {
  const w = await createWorld()
  const { plugins, holder } = await providers(w)
  const ctx = new Context()
  const fibers = new Map<Key, Awaited<ReturnType<(typeof plugins)[Key]>>>()
  for (const key of KEYS) if (key !== leaveOut) fibers.set(key, await plugins[key](ctx))
  const plugin = await ctx.plugin(Plugin, config)
  return { w, ctx, plugin, holder, fibers }
}

async function prepare(ctx: Context, w: World) {
  const requests = ctx.get(agentRequestsKey)
  if (requests === undefined) throw new Error('services absent')
  return requests.prepare(w.prepareInput())
}

describe('AgentContextProvider on real Cordis', () => {
  it('loads with every key, provides the request service, and serves a prepare', async () => {
    const { ctx, plugin, w } = await assembled()
    expect(plugin.state).toBe(ACTIVE)
    const prepared = await prepare(ctx, w)
    expect('ok' in prepared && prepared.ok.kind).toBe('assembled')
  })

  for (const key of KEYS)
    it(`stays pending and provides nothing while ${key} is absent`, async () => {
      const { ctx, plugin } = await assembled(key)
      expect(plugin.state).toBe(PENDING)
      expect(ctx.get(agentRequestsKey)).toBeUndefined()
    })

  it('injects the adoptions of Agent and no key of model selection, the journal or the extensions', () => {
    expect(Object.keys(AgentContextProvider.inject).sort()).toEqual(
      [
        contextHolderSourcesKey,
        MODEL_PREPARATION_RESOURCES,
        modelRequestPreparationKey,
        requestContextKey,
        agentAdoptionsKey,
        agentCompactionInputsKey,
      ].sort(),
    )
  })

  it('stops: the keys go, kept references answer unavailable, and its source set is withdrawn', async () => {
    const { ctx, plugin, w, holder } = await assembled()
    const requests = ctx.get(agentRequestsKey)
    if (requests === undefined) throw new Error('services absent')
    expect('ok' in (await prepare(ctx, w))).toBe(true)
    await plugin.dispose()
    expect(ctx.get(agentRequestsKey)).toBeUndefined()
    const closed = {
      failure: { kind: 'unavailable', owner: 'agent-context', diagnostic: 'agent-context-closed' },
    }
    expect(await requests.prepare(w.prepareInput())).toEqual(closed)
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
    const inFlight = prepare(ctx, w)
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

  it('reads the instructions of the adopted definition through agentAdoptions, ahead of the registered sections', async () => {
    const { ctx, w } = await assembled()
    const requests = ctx.get(agentRequestsKey)
    const face = ctx.get(requestContextKey)
    if (requests === undefined || face === undefined) throw new Error('services absent')
    await ctx.plugin({
      name: 'contributor',
      inject: { [requestContextKey]: { scope: w.f.target.scope } },
      apply(inner: Context) {
        const registered = inner.requestContext.contributeSection({
          kind: 'section',
          name: 'workspace/guide',
          source: owner,
          order: '1',
          template: '# Workspace guide',
          uses: [],
        })
        if (registered.kind !== 'registered') throw new Error(registered.reason)
      },
    })
    const prepared = await requests.prepare(w.prepareInput({ definition: CODING_ADOPTION }))
    if (!('ok' in prepared) || prepared.ok.kind !== 'assembled')
      throw new Error(`expected assembled, got ${JSON.stringify(prepared)}`)
    const [system] = prepared.ok.input.system
    expect(system?.kind).toBe('text')
    const text = system?.kind === 'text' ? system.text : ''
    expect(text.indexOf('# Role')).toBe(0)
    expect(text.indexOf('# Tools')).toBeGreaterThan(text.indexOf('# Role'))
    expect(text.indexOf('# Workspace guide')).toBeGreaterThan(text.indexOf('# Tools'))
  })

  it('fails closed when the adopted definition cannot be resolved: no candidate, no empty prompt', async () => {
    const { ctx, w } = await assembled()
    const requests = ctx.get(agentRequestsKey)
    if (requests === undefined) throw new Error('services absent')
    const prepared = await requests.prepare(
      w.prepareInput({ definition: { ...CODING_ADOPTION, name: 'unknown' } }),
    )
    expect('failure' in prepared && prepared.failure).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('definition-invalid'),
    })
  })

  it('fails to load a configuration with a field that it does not have', async () => {
    const w = await createWorld()
    const { plugins } = await providers(w)
    const ctx = new Context()
    for (const key of KEYS) await plugins[key](ctx)
    const plugin = ctx.plugin(AgentContextProvider, { owner, resultCapacity: {} } as never)
    await Promise.resolve(plugin).catch(() => undefined)
    expect(plugin.state).toBe(FAILED)
    expect(ctx.get(agentRequestsKey)).toBeUndefined()
  })
})

describe('createAgentContextPlugin on real Cordis (SPEC「测量事件」)', () => {
  it('hands the observer to the preparation the plugin serves', async () => {
    const events: ContextMeasureEvent[] = []
    const Plugin = createAgentContextPlugin({ measure: event => events.push(event) })
    const { ctx, plugin, w } = await assembled(null, Plugin)
    expect(plugin.state).toBe(ACTIVE)
    const prepared = await prepare(ctx, w)
    expect('ok' in prepared && prepared.ok.kind).toBe('assembled')
    expect(events.map(event => `${event.operation}:${event.phase}`)).toEqual([
      'prepare:start',
      'prepare:end',
    ])
  })

  it('makes the tool lookup once from the context of the plugin and reads the sixth group through it', async () => {
    const made: Context[] = []
    const asked: string[] = []
    const lookup: ToolLookup<unknown> = async ({ binding }) => {
      asked.push(binding.name)
      return { kind: 'unavailable', diagnostic: `scripted: ${binding.name}` }
    }
    const Plugin = createAgentContextPlugin({
      toolLookup: ctx => {
        made.push(ctx)
        return lookup
      },
    })
    const { ctx, plugin, w } = await assembled(null, Plugin)
    expect(plugin.state).toBe(ACTIVE)
    expect(made).toHaveLength(1)
    expect(made[0]?.fiber).toBe(plugin)
    const requests = ctx.get(agentRequestsKey)
    if (requests === undefined) throw new Error('services absent')
    const bindings = [{ owner: 'session', name: 'Files', revision: '0.0.0', digest: 'sha256:f' }]
    const prepared = await requests.prepare(
      w.prepareInput({ conditions: { ...w.conditions, bindings } }),
    )
    expect(asked).toEqual(['Files'])
    expect('failure' in prepared && prepared.failure).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('scripted: Files'),
    })
    expect(made).toHaveLength(1)
  })

  it('has the inject and the configuration of the provider, and no event without an observer', async () => {
    const Plugin = createAgentContextPlugin()
    expect(Plugin).not.toBe(AgentContextProvider)
    expect(Plugin.inject).toBe(AgentContextProvider.inject)
    expect(Plugin.Config).toBe(AgentContextProvider.Config)
    const { ctx, w } = await assembled(null, Plugin)
    const prepared = await prepare(ctx, w)
    expect('ok' in prepared && prepared.ok.kind).toBe('assembled')
  })
})
