import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Registry, { type Agent } from '@omne-harness-lite/agent/baseline'
import { createScope, NamedEntries, ScopedLayers, type Scope } from '@omne-harness-lite/agent/scope-baseline'
import { snapshotJsonValue } from '@omne-harness-lite/dsh-baseline/baseline/values'
import { deadline } from '@omne-harness-lite/dsh-baseline/baseline/timeout'

assert.deepEqual(snapshotJsonValue({ n: 1 }), { n: 1 })
const abort = new AbortController()
const timer = deadline(abort.signal, 1000, 'SOURCE_DEADLINE')
abort.abort('caller')
assert.equal(timer.signal.reason, 'caller')
timer[Symbol.dispose]()

const ctx = new Context()
const registry = await ctx.plugin(Registry)
const actor: Agent = { id: 'source-fixture', session: { id: 'source-fixture' }, ctx }
class Layer {
  named = new NamedEntries<string>(name => new Error(`duplicate ${name}`))
  isEmpty() { return this.named.isEmpty() }
}
const layers = new ScopedLayers(() => new Layer(), () => {})
let scoped!: Scope
const scopeOwner = await ctx.plugin((inner: Context) => { scoped = createScope(inner, actor) })
let observed = 0
scoped.ctx.on('agent/created', () => { observed += 1 })
layers.effect(scoped.ctx, layer => layer.named.insert('entry', 'owned'), { label: 'source-fixture' })
const detach = ctx.agents.register(actor)
assert.equal(observed, 1, 'agent dispatch and public scope must share one identity registry')
assert.equal(layers.merge(actor, layer => layer.named).get('entry'), 'owned')
assert.equal(layers.merge({}, layer => layer.named).size, 0)
const child: Agent = { id: 'child-fixture', session: { id: 'child-fixture' }, ctx }
const childScope = createScope(scoped.ctx, child, { parent: actor })
assert.equal(layers.merge(child, layer => layer.named).get('entry'), 'owned')
const detachChild = ctx.agents.register(child)
assert.equal(observed, 2, 'parent scoped listener receives child-scoped agent events')
await childScope.dispose()
await detachChild()
await scoped.dispose()
assert.equal(layers.peek(actor), undefined)
await detach()
await scopeOwner.dispose()
await registry.dispose()
console.log('PASS: built source helpers, shared agent scope routing and owned store teardown')
