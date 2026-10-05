// Mechanism probe: existing real lifetime and Cordis binding; no product tree loader.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const { createAssemblyLifetime } = await import(pathToFileURL(path.resolve('packages/core/assembly-lifecycle/dist/index.js')))
const { AssemblyLifetimeService, startAssemblyWork } = await import(pathToFileURL(path.resolve('packages/core/assembly-lifecycle/dist/cordis.js')))
const { StorageStartupFailure } = await import(pathToFileURL(path.resolve('packages/infra/storage-sql/dist/index.js')))
const require = createRequire(path.resolve('packages/core/assembly-lifecycle/package.json'))
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')))
const ctx = new Context()
ctx.on('logger/message', () => {})
const trace = [], failures = new Map(), release = Promise.withResolvers()
const actual = createAssemblyLifetime(['a', 'b'], () => trace.push('stopping'))
const ports = [], fibers = [], capturedReady = new Map()
const delegated = {
 ids: actual.ids, closed: actual.closed,
 isPristine: () => actual.isPristine(), tryClaim: () => actual.tryClaim(),
 isCurrent: () => actual.isCurrent(), close: () => actual.close(),
 port(id) { const port = actual.port(id); return {
  isCurrent: () => port.isCurrent(),
  register(work) {
   void work.ready.catch(error => { failures.set(id, error); trace.push('captured:' + id) })
   return port.register(work)
  }
 } }
}
class Port extends AssemblyLifetimeService {
 constructor(ctx, port, id) { super(ctx); this.port = port; this.id = id }
 isCurrent() { return this.port.isCurrent() }
 register(work) { const receipt = this.port.register(work); capturedReady.set(this.id, work.ready); return receipt }
}
assert.equal(delegated.tryClaim(), true)
assert.equal(delegated.tryClaim(), false)
assert.equal(delegated.closed, actual.closed)
const original = new StorageStartupFailure('restore', 'secret-decoy', { snapshot: '/controlled/snapshot' })
for (const id of ['a', 'b']) {
 const scope = ctx.isolate('assemblyLifetime')
 const portFiber = scope.plugin(inner => { new Port(inner, delegated.port(id), id) })
 ports.push(portFiber); await portFiber
 const fiber = scope.plugin({name: 'probe-' + id, inject: ['assemblyLifetime'], apply(inner) {
  startAssemblyWork(inner, async () => { trace.push('setup:' + id); if (id === 'b') throw original }, async () => {
   trace.push('close:' + id); if (id === 'a') { await release.promise; throw new Error('controlled-close-failure') }
  })
 }})
 fibers.push(fiber); await fiber
 if (id === 'a') await capturedReady.get(id)
}
const safeReady = capturedReady.get('b').then(() => {}, () => { throw Object.assign(new Error('apply-failed'), {rowId:'b', code:'apply-failed'}) })
await assert.rejects(safeReady, error => {
 assert.equal(failures.get('b'), original)
 assert.equal(error.code, 'apply-failed'); assert.equal('cause' in error, false)
 assert.equal(JSON.stringify(error).includes('secret-decoy'), false)
 return true
})
let closed = false
void delegated.closed.then(() => { closed = true })
await new Promise(resolve => setImmediate(resolve))
assert.equal(closed, false)
assert.deepEqual(trace.filter(x => x.startsWith('close:')), ['close:b', 'close:a'])
// Negative control: observing only after resource completion cannot report the startup failure now.
let lateObserved = false
void delegated.closed.then(() => { lateObserved = true })
assert.equal(lateObserved, false)
release.resolve()
const report = await delegated.closed
assert.equal(report.complete, false)
assert.deepEqual(report.rows.map(r => [r.id, r.result.codes]), [['b', ['setup']], ['a', ['close']]])
for (const fiber of fibers.reverse()) await fiber.dispose()
for (const fiber of ports.reverse()) await fiber.dispose()
console.log(JSON.stringify({base:'cdd05d1050dc9d7857f7eb3569d834ae4291c4d5',cordis:'4.0.4',trace,privateOriginalIdentity:true,safePublicProjection:true,closedWaitedForActualWork:true,negativeLateObserverBlocked:true,report}))
