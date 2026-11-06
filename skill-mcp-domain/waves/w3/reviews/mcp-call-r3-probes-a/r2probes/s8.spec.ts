// Reviewer probes, round 2 (not part of the delivery). closeAll lands while a call or a task
// operation is past its shutdown check and waits on the gate.
import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf, requestStateOf, generationOf, taskIdOf, type PeerReply } from '@omne-harness/mcp-contract/testing'
const T = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests'
const { deferred, settled } = await import(`${T}/doubles/deferred.ts`)
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text, taskHandle, taskStatus } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const ASKS: PeerReply = { kind: 'result', result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } } }

function gatedEligibility(port: any) {
  let gate: { promise: Promise<void>; resolve: () => void } | undefined
  let reached: { promise: Promise<void>; resolve: () => void } | undefined
  return {
    arm() { gate = deferred(); reached = deferred(); return { gate: gate!, reached: reached! } },
    port: { async check(access: any, ref: any) { const g = gate; if (g !== undefined) { gate = undefined; reached!.resolve(); await g.promise } return port.check(access, ref) } },
  }
}

async function arrange(calls: any, tasks?: any) {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls, ...(tasks ? { tasks } : {}) })
  adoptStdio(p, files)
  const elig = gatedEligibility(p.eligibility)
  let storeReads = 0
  const store = { ...p.store, read: (k: any) => { storeReads += 1; return p.store.read(k) } }
  const { services: s } = services({ ...p, ports: { ...p.ports, eligibility: elig.port, store } })
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const cur = await s.discovery.current(alice, files)
  if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
  return { p, s, elig, digest: cur.ok.actions[0]!.definitionDigest, storeReads: () => storeReads }
}

it('S8-a: closeAll while a continuation waits on the gate', async () => {
  const c = await arrange({ read: [ASKS, completed([text('done')])] })
  const first = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  if (first.kind !== 'sent' || first.outcome.kind !== 'inputRequired') throw new Error('not asked')
  const armed = c.elig.arm()
  const cont = c.s.invoker.continueWithInput(alice, { ref: files, action: READ, args: jsonOf({}), issuedAt: first.outcome.issuedAt, correlationKey: correlationKeyOf('c2'), signal: new AbortController().signal, requestState: requestStateOf('s1') })
  await armed.reached
  await c.s.connections.closeAll()
  const readsAtClose = c.storeReads()
  armed.gate.resolve()
  const r = await cont
  console.log('S8-a continueWithInput =', JSON.stringify(r), 'store reads after closeAll =', c.storeReads() - readsAtClose)
})

it('S8-b: closeAll while a first call waits on the gate', async () => {
  const c = await arrange({ read: completed([text('done')]) })
  const armed = c.elig.arm()
  const call = c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  await armed.reached
  await c.s.connections.closeAll()
  const readsAtClose = c.storeReads()
  armed.gate.resolve()
  console.log('S8-b invoke =', JSON.stringify(await call), 'store reads after closeAll =', c.storeReads() - readsAtClose)
})

it('S8-c: closeAll while a task operation (no connection to reuse) waits on the gate', async () => {
  const c = await arrange({ read: taskHandle('t1') }, { t1: { get: taskStatus('t1', 'working') } })
  const started = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  if (started.kind !== 'sent' || started.outcome.kind !== 'task') throw new Error('no task')
  const task = { ref: files, taskId: taskIdOf('t1'), issuedAt: started.outcome.issuedAt }
  await c.s.connections.release(alice, files)
  const armed = c.elig.arm()
  const q = c.s.invoker.queryTask(alice, task)
  await armed.reached
  await c.s.connections.closeAll()
  armed.gate.resolve()
  console.log('S8-c queryTask =', JSON.stringify(await q), 'opens=', c.p.opens(), 'tasks/get=', c.p.requests('tasks/get').length)
  console.log('S8-c queryTask after closeAll (fresh) =', JSON.stringify(await c.s.invoker.queryTask(alice, task)))
})
