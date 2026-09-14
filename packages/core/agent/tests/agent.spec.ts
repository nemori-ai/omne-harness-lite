// Ported from DeepSeek, MIT; source and changes in provenance.json.
import { describe, expect, it } from 'vitest'
import { Context, Service, symbols } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents } from '@omne-harness-lite/agent/baseline'

import type {
  Agent,
  AgentFactory,
  CreateAgentOptions,
  ResumeAgentOptions,
} from '@omne-harness-lite/agent/baseline'

import type { Scoped } from '@omne-harness-lite/agent/baseline'
type AgentStatus = 'idle' | 'running'
declare module '@deepseek-ai/cordis' {
  interface Events {
    'baseline-test/status'(
      this: Scoped<Agent>,
      payload: { agent: Agent; status: AgentStatus },
    ): void
    'baseline-test/serial'(
      this: Scoped<Agent>,
      payload: { agent: Agent; turn: number; signal: AbortSignal },
    ): Promise<void> | void
  }
}

function stubAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return { id, session: { id }, ctx: new Context(), ...overrides }
}

describe('AgentRegistry', () => {
  it('registers exact entries, emits lifecycle events, and unregisters on owner disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const lifecycle: string[] = []
    ctx.on('agent/created', ({ agent }) => void lifecycle.push(`created:${agent.id}`))
    ctx.on('agent/disposed', ({ agent }) => void lifecycle.push(`disposed:${agent.id}`))

    const agent = stubAgent('a1')
    const dispose = ctx.agents.register(agent)
    expect(ctx.agents.get(agent.id)).toBe(agent)
    expect(ctx.agents.list()).toEqual([agent])
    expect(ctx.agents.roots()).toEqual([agent])
    expect(() => ctx.agents.register(stubAgent('a1'))).toThrow(/already registered/)

    dispose()
    expect(ctx.agents.get(agent.id)).toBeUndefined()
    expect(lifecycle).toEqual(['created:a1', 'disposed:a1'])
  })

  it('rejects an agent whose registry and session identities differ', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const agent = stubAgent('agent-id', { session: { id: 'session-id' } })

    expect(() => ctx.agents.enter(agent, undefined)).toThrow(
      'agent id "agent-id" does not match session id "session-id"',
    )
    expect(ctx.agents.list()).toEqual([])
  })

  it('tracks runtime creator ownership separately from registry order', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const root = stubAgent('root')
    const child = stubAgent('child')
    const detachRoot = ctx.agents.enter(root, undefined)
    ctx.agents.announce(root)
    const detachChild = ctx.agents.enter(child, root)
    ctx.agents.announce(child)

    expect(ctx.agents.list()).toEqual([root, child])
    expect(ctx.agents.roots()).toEqual([root])
    expect(ctx.agents.isOwnedBy(child.id, root)).toBe(true)
    expect(ctx.agents.isOwnedBy(root.id, root)).toBe(false)
    expect(ctx.agents.isOwnedBy(String('missing'), root)).toBe(false)

    detachChild()
    expect(ctx.agents.isOwnedBy(child.id, root)).toBe(false)
    detachRoot()
  })

  it('rolls an entry back and pairs a partially delivered creation when a listener throws', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const lifecycle: string[] = []
    ctx.on('agent/created', ({ agent }) => void lifecycle.push(`created:${agent.id}`))
    ctx.on('agent/created', () => {
      throw new Error('creation veto')
    })
    ctx.on('agent/disposed', ({ agent }) => void lifecycle.push(`disposed:${agent.id}`))

    expect(() => ctx.agents.register(stubAgent('vetoed'))).toThrow('creation veto')
    expect(ctx.agents.get(String('vetoed'))).toBeUndefined()
    expect(lifecycle).toEqual(['created:vetoed', 'disposed:vetoed'])
  })

  it('contains asynchronous creation rejection and every disposal-listener failure', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const warnings: string[] = []
    const heard: string[] = []
    ctx.logger.warn = ((message: unknown) => {
      warnings.push(String(message))
    }) as typeof ctx.logger.warn
    ctx.on('agent/created', () => Promise.reject(new Error('created async')) as never)
    ctx.on('agent/disposed', () => {
      throw new Error('disposed sync')
    })
    ctx.on('agent/disposed', () => Promise.reject(new Error('disposed async')) as never)
    ctx.on('agent/disposed', ({ agent }) => void heard.push(agent.id))

    const dispose = ctx.agents.register(stubAgent('contained'))
    await Promise.resolve()
    dispose()
    await Promise.resolve()

    expect(heard).toEqual(['contained'])
    expect(warnings).toEqual([
      'agent "contained": agent/created listener rejected: Error: created async',
      'agent "contained": agent/disposed listener threw: Error: disposed sync',
      'agent "contained": agent/disposed listener rejected: Error: disposed async',
    ])
  })

  it('separates entry from announcement and stale/idempotent detach cannot remove a replacement', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const lifecycle: string[] = []
    ctx.on('agent/created', ({ agent }) => void lifecycle.push(`created:${agent.id}`))
    ctx.on('agent/disposed', ({ agent }) => void lifecycle.push(`disposed:${agent.id}`))

    const first = stubAgent('split')
    const detachFirst = ctx.agents.enter(first, undefined)
    expect(lifecycle).toEqual([])
    ctx.agents.announce(first)
    expect(() => {
      ctx.agents.announce(first)
    }).toThrow(/already announced/)
    detachFirst()
    detachFirst()

    const replacement = stubAgent('split')
    const detachReplacement = ctx.agents.enter(replacement, undefined)
    detachFirst()
    expect(ctx.agents.get(replacement.id)).toBe(replacement)
    expect(() => {
      ctx.agents.announce(first)
    }).toThrow(/not live/)
    detachReplacement()
    expect(lifecycle).toEqual(['created:split', 'disposed:split'])
  })

  it('defers detach requested by a creation listener until that dispatch unwinds', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const order: string[] = []
    const agent = stubAgent('reentrant')
    ctx.on('agent/created', () => {
      order.push(`first:${ctx.agents.get(agent.id) === agent}`)
      detach()
      order.push(`after-detach:${ctx.agents.get(agent.id) === agent}`)
    })
    ctx.on('agent/created', () => void order.push(`second:${ctx.agents.get(agent.id) === agent}`))
    ctx.on('agent/disposed', () => void order.push('disposed'))
    const detach = ctx.agents.enter(agent, undefined)
    ctx.agents.announce(agent)
    expect(order).toEqual(['first:true', 'after-detach:true', 'second:true', 'disposed'])
    expect(ctx.agents.get(agent.id)).toBeUndefined()
  })
})

describe('agentEvents()', () => {
  it('contains each synchronous throw and returned-promise rejection', async () => {
    const ctx = new Context()
    const warnings: string[] = []
    const heard: string[] = []
    ctx.logger.warn = ((message: unknown) => {
      warnings.push(String(message))
    }) as typeof ctx.logger.warn
    const agent = stubAgent('event')
    ctx.on('baseline-test/status', () => {
      throw new Error('sync listener')
    })
    ctx.on('baseline-test/status', () => Promise.reject(new Error('async listener')) as never)
    ctx.on('baseline-test/status', ({ status }) => void heard.push(status))

    agentEvents(ctx, agent).emit('baseline-test/status', { status: 'running' })
    await Promise.resolve()
    expect(heard).toEqual(['running'])
    expect(warnings).toEqual([
      'agent event "baseline-test/status" listener threw: Error: sync listener',
      'agent event "baseline-test/status" listener rejected: Error: async listener',
    ])
  })

  it('dispatches serial listeners with the fused agent subject', async () => {
    const ctx = new Context()
    const agent = stubAgent('serial-event')
    const signal = new AbortController().signal
    const heard: Array<{ agent: Agent; turn: number; signal: AbortSignal }> = []
    ctx.on('baseline-test/serial', async ({ agent: subject, turn, signal: receivedSignal }) => {
      await Promise.resolve()
      heard.push({ agent: subject, turn, signal: receivedSignal })
    })

    await agentEvents(ctx, agent).serial('baseline-test/serial', { turn: 3, signal })

    expect(heard).toEqual([{ agent, turn: 3, signal }])
  })

  it('injects the fused subject even when the payload carries a conflicting agent field', async () => {
    const ctx = new Context()
    const agent = stubAgent('fused-subject')
    const other = stubAgent('payload-agent')
    const heard: Agent[] = []
    ctx.on('baseline-test/status', ({ agent: subject }) => void heard.push(subject))
    // A structurally acceptable payload may carry an extra `agent` field; the
    // dispatcher's injected subject must win over it.
    const payload: { status: AgentStatus; agent: Agent } = { status: 'running', agent: other }

    agentEvents(ctx, agent).emit('baseline-test/status', payload)

    expect(heard).toEqual([agent])
  })
})

describe('AgentRegistry factory seam', () => {
  function stubFactory() {
    const calls: {
      create: Array<{ ownerCtx: Context; options: CreateAgentOptions }>
      resume: Array<{ ownerCtx: Context; options: ResumeAgentOptions }>
    } = { create: [], resume: [] }
    const factory: AgentFactory = {
      async createAgent(ownerCtx, options) {
        calls.create.push({ ownerCtx, options })
        return { agent: stubAgent(options.sessionId), dispose: () => Promise.resolve() }
      },
      async resume(ownerCtx, options) {
        calls.resume.push({ ownerCtx, options })
        return { agent: stubAgent(options.resumeSessionId), dispose: () => Promise.resolve() }
      },
    }
    return { factory, calls }
  }

  it('requires a factory and delegates through the calling context', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await expect(ctx.agents.create({ sessionId: String('s') })).rejects.toThrow(/no agent factory/)
    const { factory, calls } = stubFactory()
    ctx.agents.setFactory(factory)

    let callerFiber: Context['fiber'] | undefined
    await ctx.plugin(
      Object.assign(
        async (inner: Context) => {
          callerFiber = inner.fiber
          await inner.agents.create({ sessionId: String('create-s') })
          await inner.agents.resume({ resumeSessionId: String('resume-s') })
        },
        { inject: ['agents'] },
      ),
    )
    expect(calls.create[0]?.ownerCtx.fiber).toBe(callerFiber)
    expect(calls.resume[0]?.ownerCtx.fiber).toBe(callerFiber)
    expect(calls.create[0]?.options.parentAgent).toBeUndefined()
    expect(calls.resume[0]?.options.parentAgent).toBeUndefined()
  })

  it('keeps the runtime parent in options separately from the caller context', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const { factory, calls } = stubFactory()
    ctx.agents.setFactory(factory)
    const parent = stubAgent('parent')
    const unregister = ctx.agents.register(parent)

    await ctx.agents.create({ sessionId: String('child'), parentAgent: parent })

    expect(calls.create[0]?.options.parentAgent).toBe(parent)
    unregister()
  })

  it('rejects a second factory and clears the slot with its owner (HMR)', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const owner = await ctx.plugin(
      Object.assign(
        (inner: Context) => {
          inner.agents.setFactory(stubFactory().factory)
          expect(() => inner.agents.setFactory(stubFactory().factory)).toThrow(/already registered/)
        },
        { inject: ['agents'] },
      ),
    )
    await expect(ctx.agents.create({ sessionId: String('before-s') })).resolves.toBeDefined()
    await owner.dispose()
    await expect(ctx.agents.create({ sessionId: String('after-s') })).rejects.toThrow(
      /no agent factory/,
    )
  })

  it('canonicalizes an already traced Service before tracing it for the caller', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const states = new WeakMap<object, string[]>()
    class TracedFactory extends Service implements AgentFactory {
      constructor(inner: Context) {
        super(inner, 'tracedFactory')
        states.set(this, [])
      }
      private calls(): string[] {
        const original =
          (this as unknown as { [symbols.original]?: TracedFactory })[symbols.original] ?? this
        const calls = states.get(original)
        if (calls === undefined) throw new Error('factory receiver was not canonicalized')
        return calls
      }
      async createAgent(_ownerCtx: Context, options: CreateAgentOptions) {
        this.calls().push('create')
        return { agent: stubAgent(options.sessionId), dispose: () => Promise.resolve() }
      }
      async resume(_ownerCtx: Context, options: ResumeAgentOptions) {
        this.calls().push('resume')
        return { agent: stubAgent(options.resumeSessionId), dispose: () => Promise.resolve() }
      }
    }
    await ctx.plugin(TracedFactory)
    const traced = (ctx as Context & { tracedFactory: TracedFactory }).tracedFactory
    ctx.agents.setFactory(traced)
    await ctx.agents.create({ sessionId: String('create-s') })
    await ctx.agents.resume({ resumeSessionId: String('resume-s') })
    const raw = (traced as unknown as { [symbols.original]?: TracedFactory })[symbols.original]
    expect(states.get(raw!)).toEqual(['create', 'resume'])
  })
})
