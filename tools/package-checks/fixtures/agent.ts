import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, {
  type Agent,
  type AgentFactory,
  type AgentHandle,
} from '@omne-harness-lite/agent/baseline'

// A trusted identity-only fixture. This is not a Session or an Agent Loop.
const ctx = new Context()
const registry = await ctx.plugin(AgentRegistry)
const events: string[] = []
ctx.on('agent/created', ({ agent }) => void events.push(`created:${agent.id}`))
ctx.on('agent/disposed', ({ agent }) => void events.push(`disposed:${agent.id}`))
const factory: AgentFactory = {
  async createAgent(ownerCtx, options) {
    const agent: Agent = {
      id: options.sessionId,
      session: { id: options.sessionId },
      ctx: ownerCtx,
    }
    const detach = ownerCtx.agents.register(agent)
    return {
      agent,
      dispose: async () => {
        await detach()
      },
    }
  },
  async resume() {
    throw new Error('persistence is not part of this fixture')
  },
}
const provider = await ctx.plugin(
  Object.assign(
    (inner: Context) => {
      inner.agents.setFactory(factory)
    },
    { inject: ['agents'] },
  ),
)
let handle!: AgentHandle
const owner = await ctx.plugin(
  Object.assign(
    async (inner: Context) => {
      handle = await inner.agents.create({ sessionId: 'fixture' })
    },
    { inject: ['agents'] },
  ),
)
assert.equal(ctx.agents.get('fixture'), handle.agent)
const task = ctx.agents.withInitiator(handle.agent, async () => {
  await Promise.resolve()
  return ctx.agents.requireInitiator()
})
assert.equal(await task, handle.agent)
assert.equal(ctx.agents.currentInitiator(), undefined)
await owner.dispose()
assert.equal(ctx.agents.get('fixture'), undefined)
await handle.dispose() // Already removed by owner; exact detach stays idempotent.
assert.deepEqual(events, ['created:fixture', 'disposed:fixture'])
await provider.dispose()
await assert.rejects(ctx.agents.create({ sessionId: 'unavailable' }), /no agent factory/)
const retained = ctx.agents
let dependencyReleased = false
await ctx.plugin(
  Object.assign(
    (inner: Context) => {
      inner.effect(() => () => {
        dependencyReleased = true
      })
      inner.agents.register({ id: 'dependent', session: { id: 'dependent' }, ctx: inner })
    },
    { inject: ['agents'] },
  ),
)
assert.equal(dependencyReleased, false)
assert.ok(retained.get('dependent'))
// Keep this consumer alive: dependency loss must trigger its own cleanup.
await registry.dispose()
assert.equal(dependencyReleased, true)
assert.equal(retained.get('dependent'), undefined)
assert.deepEqual(events.slice(-2), ['created:dependent', 'disposed:dependent'])
assert.throws(() => retained.currentInitiator(), /disposed/)
const privateAgentSource = '@omne-harness-lite/agent/src/index.ts'
await assert.rejects(import(privateAgentSource), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
})
console.log(
  'PASS: isolated tarball consumer, ownership, dependency removal, factory removal and initiator',
)
