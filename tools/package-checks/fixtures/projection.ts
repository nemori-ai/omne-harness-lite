import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import SessionStore from '@omne-harness-lite/session/baseline'
import SessionProjectionRegistry, { type ProjectionDefinition } from '@omne-harness-lite/session-projection/baseline'

// Exercise declaration merging through published entries, without internal
// dist/types paths or workspace aliases.
declare module '@omne-harness-lite/session/baseline' {
  interface SessionEventMap { 'consumer/amount': { amount: number } }
}
declare module '@omne-harness-lite/session-projection/baseline' {
  interface SessionProjectionStateMap { 'consumer/total': number }
  interface SessionProjectionMap { 'consumer/total': { total: number } }
}

const definition = {
  key: 'consumer/total',
  stateSchema: z.number(),
  init: () => 0,
  apply: (state, event) => event.type === 'consumer/amount' ? state + event.data.amount : state,
  stateVersion: 1,
  wire: {
    viewSchema: z.object({ total: z.number() }),
    view: (total: number) => ({ total }),
  },
} satisfies ProjectionDefinition<'consumer/total', number>

const ctx = new Context()
const sessions = await ctx.plugin(SessionStore)
const projections = await ctx.plugin(SessionProjectionRegistry)
const owner = await ctx.plugin(Object.assign((inner: Context) => {
  inner.sessionProjections.register(definition)
}, { inject: ['sessionProjections'] }))
const session = ctx.sessions.create()
session.append('consumer/amount', { amount: 3 })
session.append('consumer/amount', { amount: 4 })
const total: number | undefined = ctx.sessionProjections.stateOf(session, 'consumer/total')
assert.equal(total, 7)
assert.deepEqual(ctx.sessionProjections.snapshot(session, ['consumer/total']).values, { 'consumer/total': { total: 7 } })
await owner.dispose()
assert.equal(ctx.sessionProjections.stateOf(session, 'consumer/total'), undefined)
await projections.dispose()
await sessions.dispose()
console.log('PASS: public Session/projection declaration merging, real fold and owner withdrawal')
