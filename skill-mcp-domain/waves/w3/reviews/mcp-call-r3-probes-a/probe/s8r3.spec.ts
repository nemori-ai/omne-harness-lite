// Reviewer probes, round 3 (not part of the delivery): S8 "an operation in flight checks the
// shutdown before its next step, and answers the same" on paths other than the gate wait.
import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf, requestStateOf, taskIdOf, type PeerReply } from '@omne-harness/mcp-contract/testing'
const T = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests'
const { deferred } = await import(`${T}/doubles/deferred.ts`)
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text, taskHandle, taskStatus } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)
const { reshapedTransports } = await import(`${T}/doubles/transports.ts`)

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const ASKS: PeerReply = { kind: 'result', result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } } }

/** Store whose reads after arm() wait on a gate; transports whose methods log whether the table was shut when entered. */
async function arrange(calls: any, tasks?: any) {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls, ...(tasks ? { tasks } : {}) })
  adoptStdio(p, files)
  let gate: any, reached: any
  const store = { ...p.store, read: async (k: any) => { const g = gate; if (g) { gate = undefined; reached.resolve(); await g.promise } return p.store.read(k) } }
  const log: string[] = []
  let shutFlag = () => false
  const transports = reshapedTransports(p.ports.transports, t => ({
    call: (r: any, s: AbortSignal, o: any) => { log.push(`call shut=${shutFlag()}`); return t.call(r, s, o) },
    getTask: (id: any) => { log.push(`getTask shut=${shutFlag()}`); return t.getTask(id) },
    listActions: (c: any) => { log.push(`listActions shut=${shutFlag()}`); return t.listActions(c) },
    cancelRequest: (id: any) => { log.push(`cancelRequest shut=${shutFlag()}`); return t.cancelRequest(id) },
  }))
  const { services: s, table } = services({ ...p, ports: { ...p.ports, store, transports } })
  shutFlag = () => table.isShut()
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const cur = await s.discovery.current(alice, files)
  if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
  return { p, s, table, log, digest: cur.ok.actions[0]!.definitionDigest, armStore() { gate = deferred(); reached = deferred(); return { gate, reached } } }
}

it('R3-a: closeAll while a continuation waits on the store read (step 5)', async () => {
  const c = await arrange({ read: [ASKS, completed([text('done')])] })
  const first = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  if (first.kind !== 'sent' || first.outcome.kind !== 'inputRequired') throw new Error('not asked')
  const armed = c.armStore()
  const cont = c.s.invoker.continueWithInput(alice, { ref: files, action: READ, args: jsonOf({}), issuedAt: first.outcome.issuedAt, correlationKey: correlationKeyOf('c2'), signal: new AbortController().signal, requestState: requestStateOf('s1') })
  await armed.reached.promise
  await c.s.connections.closeAll()
  armed.gate.resolve()
  console.log('R3-a continueWithInput =', JSON.stringify(await cont), 'log=', c.log.join(','))
})

it('R3-b: closeAll while a first call waits on the store read (step 5)', async () => {
  const c = await arrange({ read: completed([text('done')]) })
  const armed = c.armStore()
  const call = c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  await armed.reached.promise
  await c.s.connections.closeAll()
  armed.gate.resolve()
  console.log('R3-b invoke =', JSON.stringify(await call), 'log=', c.log.join(','))
})

it('R3-c: a task operation on a reused connection; closeAll called in the same turn, right after', async () => {
  const c = await arrange({ read: taskHandle('t1') }, { t1: { get: taskStatus('t1', 'working') } })
  const started = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  if (started.kind !== 'sent' || started.outcome.kind !== 'task') throw new Error('no task')
  const task = { ref: files, taskId: taskIdOf('t1'), issuedAt: started.outcome.issuedAt }
  const before = c.p.requests('tasks/get').length
  const q = c.s.invoker.queryTask(alice, task)
  const closing = c.s.connections.closeAll()
  const r = await q
  await closing
  console.log('R3-c queryTask in flight =', JSON.stringify(r), 'tasks/get received by peer=', c.p.requests('tasks/get').length - before, 'log=', c.log.join(','))
  console.log('R3-c queryTask after closeAll =', JSON.stringify(await c.s.invoker.queryTask(alice, task)))
})

it('R3-d: closeAll while a refresh waits on the store read in publish', async () => {
  const c = await arrange({ read: completed([text('done')]) })
  const armed = c.armStore()
  const before = c.p.requests('tools/list').length
  const r = c.s.discovery.refresh(alice, { ref: files })
  await armed.reached.promise
  await c.s.connections.closeAll()
  armed.gate.resolve()
  console.log('R3-d refresh =', JSON.stringify(await r), 'tools/list received by peer=', c.p.requests('tools/list').length - before, 'log=', c.log.join(','))
})

it('R3-e: a sent call, closeAll, then the caller aborts its signal', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: completed([text('x')]) } })
  adoptStdio(p, files)
  const log: string[] = []
  let shutFlag = () => false
  const { never } = await import(`${T}/doubles/transports.ts`)
  const transports = reshapedTransports(p.ports.transports, t => ({
    call: async (r: any, s: AbortSignal, o: any) => { const res: any = await t.call(r, s, o); log.push('call returned'); return 'ok' in res ? { ok: { requestId: res.ok.requestId, answer: never() } } : res },
    cancelRequest: (id: any) => { log.push(`cancelRequest shut=${shutFlag()}`); return t.cancelRequest(id) },
  }))
  const { services: s, table } = services({ ...p, ports: { ...p.ports, transports } })
  shutFlag = () => table.isShut()
  await s.discovery.refresh(alice, { ref: files })
  const cur = await s.discovery.current(alice, files)
  if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
  const ac = new AbortController()
  const call = s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: cur.ok.actions[0]!.definitionDigest, correlationKey: correlationKeyOf('c1'), signal: ac.signal })
  await new Promise(r => setImmediate(r))
  console.log('R3-e before closeAll log=', log.join(','), 'tools/call=', p.requests('tools/call').length)
  const closing = s.connections.closeAll()
  ac.abort()
  const r = await call
  await closing
  await new Promise(r => setImmediate(r))
  console.log('R3-e invoke =', JSON.stringify(r), 'log=', log.join(','), 'peer cancels=', p.cancels())
})

it('R3-g: closeAll while the gate waits on the adoption read (eligibility not yet asked)', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: completed([text('x')]) } })
  adoptStdio(p, files)
  let gate: any, reached: any
  const adoption = { endpoints: (a: any, sc: any) => p.adoption.endpoints(a, sc), endpoint: async (a: any, ref: any) => { const g = gate; if (g) { gate = undefined; reached.resolve(); await g.promise } return p.adoption.endpoint(a, ref) } }
  for (const op of ['invoke', 'refresh'] as const) {
  const { services: s } = services({ ...p, ports: { ...p.ports, adoption } })
  await s.discovery.refresh(alice, { ref: files })
  const cur = await s.discovery.current(alice, files)
  if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
    gate = deferred(); reached = deferred()
    const g = gate, rr = reached
    const pending: Promise<any> = op === 'invoke'
      ? s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: cur.ok.actions[0]!.definitionDigest, correlationKey: correlationKeyOf('g-' + op), signal: new AbortController().signal })
      : s.discovery.refresh(alice, { ref: files })
    await rr.promise
    await s.connections.closeAll()
    const elig = p.eligibility.calls()
    g.resolve()
    const r = await pending
    console.log(`R3-g ${op} =`, JSON.stringify(r), 'eligibility checks after closeAll =', p.eligibility.calls() - elig)
  }
})

it.skip('R3-f: closeAll landing k microtasks after invoke / queryTask (sweep)', async () => {
  const rows: string[] = []
  for (const op of ['invoke', 'queryTask'] as const) {
    for (let k = 0; k < 200; k++) {
      const c = await arrange({ read: taskHandle('t1') }, { t1: { get: taskStatus('t1', 'working') } })
      const started = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c0'), signal: new AbortController().signal })
      if (started.kind !== 'sent' || started.outcome.kind !== 'task') throw new Error('no task')
      c.log.length = 0
      const p = op === 'invoke'
        ? c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
        : c.s.invoker.queryTask(alice, { ref: files, taskId: taskIdOf('t1'), issuedAt: started.outcome.issuedAt })
      for (let i = 0; i < k; i++) await Promise.resolve()
      const closing = c.s.connections.closeAll()
      let settledBefore = false
      const r: any = await p
      await closing.catch(() => undefined)
      const bad = c.log.filter(l => l.endsWith('shut=true'))
      const row = `${op} k=${k} result=${JSON.stringify(r).slice(0, 90)} portAfterShut=${JSON.stringify(bad)}`
      if (bad.length > 0) rows.push(row)
      if (k % 20 === 0 || bad.length > 0) console.log(row)
      if (c.log.some(l => l.endsWith('shut=false') && /call|getTask/.test(l))) { console.log(`${op} sent before closeAll at k=${k}; stop`); break }
    }
  }
  console.log('R3-f rows with a transport method entered after shut:', rows.length)
})
