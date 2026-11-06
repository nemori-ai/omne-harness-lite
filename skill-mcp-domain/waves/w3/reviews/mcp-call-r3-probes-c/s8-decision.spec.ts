// Reviewer probes, round 3, C face (not part of the delivery).
// (1) closeAll lands while a continuation (and, as control, a first call) waits on the store read
//     (the second `under`); after the read answers, the next decision is step 6 (`issuedOn`).
// (2) closeAll lands, at k microtasks, while a task operation is between its connection and its
//     transport request: does the transport get the request after the shutdown began?
import { expect, it } from 'vitest'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  generationOf,
  jsonOf,
  requestStateOf,
  taskIdOf,
  type PeerReply,
} from '@omne-harness/mcp-contract/testing'
const T = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests'
const { deferred } = await import(`${T}/doubles/deferred.ts`)
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text, taskHandle, taskStatus } = await import(
  `${T}/doubles/peer.ts`
)
const { reshapedTransports } = await import(`${T}/doubles/transports.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const ASKS: PeerReply = {
  kind: 'result',
  result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } },
}

function gatedStore(store: any) {
  let armed: { reached: any; held: any } | undefined
  let reads = 0
  return {
    reads: () => reads,
    arm() {
      armed = { reached: deferred(), held: deferred() }
      return armed
    },
    port: {
      ...store,
      async read(key: any) {
        reads += 1
        const hold = armed
        if (hold !== undefined) {
          armed = undefined
          hold.reached.resolve()
          await hold.held.promise
        }
        return store.read(key)
      },
    },
  }
}

async function arrange(calls: any) {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls })
  adoptStdio(p, files)
  const store = gatedStore(p.store)
  const { services: s } = services({ ...p, ports: { ...p.ports, store: store.port } })
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const cur = await s.discovery.current(alice, files)
  if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
  return { p, s, store, digest: cur.ok.actions[0]!.definitionDigest }
}

it('C3-1a: closeAll while a continuation waits on the store read', async () => {
  const c = await arrange({ read: [ASKS, completed([text('done')])] })
  const first = await c.s.invoker.invoke(alice, {
    ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest,
    correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal,
  })
  if (first.kind !== 'sent' || first.outcome.kind !== 'inputRequired') throw new Error('not asked')
  const armed = c.store.arm()
  const cont = c.s.invoker.continueWithInput(alice, {
    ref: files, action: READ, args: jsonOf({}), issuedAt: first.outcome.issuedAt,
    correlationKey: correlationKeyOf('c2'), signal: new AbortController().signal,
    requestState: requestStateOf('s1'),
  })
  await armed.reached.promise
  await c.s.connections.closeAll()
  armed.held.resolve()
  const r = await cont
  console.log('C3-1a continueWithInput =', JSON.stringify(r))
})

it('C3-1b: closeAll while a first call waits on the store read (control)', async () => {
  const c = await arrange({ read: completed([text('done')]) })
  const armed = c.store.arm()
  const call = c.s.invoker.invoke(alice, {
    ref: files, action: READ, args: jsonOf({}), expectedDefinition: c.digest,
    correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal,
  })
  await armed.reached.promise
  await c.s.connections.closeAll()
  armed.held.resolve()
  console.log('C3-1b invoke =', JSON.stringify(await call))
})

it('C3-2: closeAll at k microtasks after a task operation on a reused connection', async () => {
  const seen: string[] = []
  for (let k = 0; k < 40; k += 1) {
    let shut = false
    const enteredAfterShut: boolean[] = []
    const p = peer({
      listing: { '': listing([{ name: 'read' }]) },
      calls: { read: taskHandle('t1') },
      tasks: { t1: { get: taskStatus('t1', 'working') } },
    })
    adoptStdio(p, files)
    const transports = reshapedTransports(p.ports.transports, (transport: any) => ({
      getTask(id: any) {
        enteredAfterShut.push(shut)
        return transport.getTask(id)
      },
    }))
    const { services: s } = services({ ...p, ports: { ...p.ports, transports } })
    await s.discovery.refresh(alice, { ref: files })
    const cur = await s.discovery.current(alice, files)
    if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
    const started = await s.invoker.invoke(alice, {
      ref: files, action: READ, args: jsonOf({}), expectedDefinition: cur.ok.actions[0]!.definitionDigest,
      correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal,
    })
    if (started.kind !== 'sent' || started.outcome.kind !== 'task') throw new Error('no task')
    const task = { ref: files, taskId: taskIdOf('t1'), issuedAt: generationOf(1) }
    const q = s.invoker.queryTask(alice, task)
    for (let i = 0; i < k; i += 1) await Promise.resolve()
    shut = true
    const closing = s.connections.closeAll()
    const r = await q
    await closing
    seen.push(`k=${k} entered=${JSON.stringify(enteredAfterShut)} answer=${JSON.stringify(r)} tasks/get at peer=${p.requests('tasks/get').length} state=${JSON.stringify(await s.status.inspect(alice, files))}`)
    if (enteredAfterShut.includes(false)) break
  }
  console.log(seen.join('\n'))
})

it('C3-3: closeAll while a first call waits on the gate, and step 4 refuses with a setting defect', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: completed([text('hi')]) } })
  const { storedRecord } = await import(`${T}/doubles/world.ts`)
  const { armedEligibility } = await import(`${T}/doubles/stalls.ts`)
  const { digestDefinition } = await import('@omne-harness/mcp-contract')
  adoptStdio(p, files, { settings: { connectTimeout: { kind: 'absent' } } })
  await storedRecord(p, { tenant: alice.tenant, account: { kind: 'anonymous' }, holding: files.holding }, ['read'])
  const armed = armedEligibility(p.eligibility)
  const { services: s } = services({ ...p, ports: { ...p.ports, eligibility: armed.port } })
  const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
  const gate = armed.arm()
  const call = s.invoker.invoke(alice, {
    ref: files, action: READ, args: jsonOf({}), expectedDefinition: digest,
    correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal,
  })
  await gate.reached
  await s.connections.closeAll()
  gate.release()
  console.log('C3-3 invoke =', JSON.stringify(await call))
  console.log('C3-3 invoke started after closeAll =', JSON.stringify(await s.invoker.invoke(alice, {
    ref: files, action: READ, args: jsonOf({}), expectedDefinition: digest,
    correlationKey: correlationKeyOf('c2'), signal: new AbortController().signal,
  })))
})
