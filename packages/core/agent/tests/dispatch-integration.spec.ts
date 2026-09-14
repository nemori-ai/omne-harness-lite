import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent, type Scoped } from '@omne-harness-lite/agent/baseline'
import { createScope } from '@omne-harness-lite/scope/baseline'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'baseline-test/waterfall'(this: Scoped<Agent>, payload: { agent: Agent; value: string }, next: () => Promise<string>): Promise<string>
  }
}

describe('built agent and official Cordis composition', () => {
  it('routes waterfall through the matching scope, preserves subject and awaits the chain', async () => {
    const ctx = new Context()
    const agent: Agent = { id: 'target', session: { id: 'target' }, ctx }
    const own = createScope(ctx, agent)
    const sibling = createScope(ctx, {})
    const heard: Agent[] = []
    own.ctx.on('baseline-test/waterfall', async ({ agent: subject, value }, next) => {
      heard.push(subject)
      return `${value}:${await next()}`
    })
    sibling.ctx.on('baseline-test/waterfall', async () => { throw new Error('wrong scope') })
    expect(await agentEvents(ctx, agent).waterfall('baseline-test/waterfall', { value: 'input' }, async () => 'done'))
      .toBe('input:done')
    expect(heard).toEqual([agent])
    await own.dispose()
    await sibling.dispose()
  })

  it('propagates an awaited waterfall failure instead of treating it as a notification', async () => {
    const ctx = new Context()
    const agent: Agent = { id: 'failure', session: { id: 'failure' }, ctx }
    const failure = new Error('rejected middleware')
    ctx.on('baseline-test/waterfall', async () => { throw failure })
    await expect(agentEvents(ctx, agent).waterfall('baseline-test/waterfall', { value: 'input' }, async () => 'done'))
      .rejects.toBe(failure)
  })

  it('removes registration when the calling owner fiber unloads', async () => {
    const ctx = new Context()
    const registry = await ctx.plugin(AgentRegistry)
    const agent: Agent = { id: 'owned', session: { id: 'owned' }, ctx }
    const owner = await ctx.plugin(Object.assign((inner: Context) => {
      inner.agents.register(agent)
    }, { inject: ['agents'] }))
    expect(ctx.agents.get(agent.id)).toBe(agent)
    await owner.dispose()
    expect(ctx.agents.get(agent.id)).toBeUndefined()
    await registry.dispose()
  })
})
