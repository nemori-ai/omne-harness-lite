// Reviewer probes, round 4 (not part of the delivery): R2 value trees, refresh exit order.
import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf, requestStateOf, taskIdOf, type PeerReply } from '@omne-harness/mcp-contract/testing'
const T = process.env.PROBE_TESTS ?? '/tmp/r4a/src/packages/mcp/mcp/tests'
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text, taskHandle, taskStatus } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)
const { reshapedTransports } = await import(`${T}/doubles/transports.ts`)
const files = endpointRefOf('files')
const READ = actionNameOf('read')
const ASKS: PeerReply = { kind: 'result', result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } } }

async function arrange(calls: any, tasks?: any, adopt = true) {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls, ...(tasks ? { tasks } : {}) })
  if (adopt) adoptStdio(p, files)
  const seen: any[] = []
  const transports = reshapedTransports(p.ports.transports, t => ({
    call: (r: any, s: any, o: any) => { seen.push({ m: 'call', r }); return t.call(r, s, o) },
    updateTask: (id: any, v: any) => { seen.push({ m: 'updateTask', v }); return t.updateTask(id, v) },
  }))
  const { services: s, table } = services({ ...p, ports: { ...p.ports, transports } })
  return { p, s, table, seen }
}

it('R4-3 R2: continuation whose inputResponses getter answers undefined first, then an unjudged tree', async () => {
  const c = await arrange({ read: [ASKS, completed([text('d')])] })
  expect(await c.s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const cur: any = await c.s.discovery.current(alice, files)
  const first: any = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: cur.ok.actions[0].definitionDigest, correlationKey: correlationKeyOf('c0'), signal: new AbortController().signal })
  expect(first.outcome.kind).toBe('inputRequired')
  let reads = 0
  const cyclic: any = { kind: 'object', entries: [] }
  cyclic.entries.push({ key: 'self', value: cyclic })
  const notJson = { kind: 'number', value: Number.NaN } // a tree judgeJsonValue rejects
  const request: any = { ref: files, action: READ, args: jsonOf({}), issuedAt: first.outcome.issuedAt, requestState: requestStateOf('s1'), correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal }
  Object.defineProperty(request, 'inputResponses', { enumerable: true, get() { reads += 1; return reads === 1 ? undefined : notJson } })
  let answer: any
  try { answer = await c.s.invoker.continueWithInput(alice, request) } catch (e: any) { answer = `rejected ${e?.constructor?.name}: ${e?.message}` }
  const sent = c.seen.filter(x => x.m === 'call').at(-1)
  console.log('R4-3 answer =', JSON.stringify(answer), 'getter reads =', reads, 'transport.call continuation =', JSON.stringify(sent?.r?.continuation), 'frozen =', sent?.r?.continuation?.inputResponses === undefined ? 'n/a' : Object.isFrozen(sent.r.continuation.inputResponses))
  // control: the same unjudged tree given plainly
  const plain = { ...request }
  Object.defineProperty(plain, 'inputResponses', { value: notJson, enumerable: true })
  plain.correlationKey = correlationKeyOf('c2')
  let ctl: any
  try { ctl = await c.s.invoker.continueWithInput(alice, plain) } catch (e: any) { ctl = `rejected ${e?.constructor?.name}` }
  console.log('R4-3 control (plain NaN tree) =', JSON.stringify(ctl))
})

it('R4-4 R2 basics: invalid trees reject (not throw), take no place, ask nothing', async () => {
  const c = await arrange({ read: taskHandle('t1') }, { t1: { get: taskStatus('t1', 'working') } })
  expect(await c.s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const cur: any = await c.s.discovery.current(alice, files)
  const digest = cur.ok.actions[0].definitionDigest
  const bad = { kind: 'number', value: Number.NaN }
  const before = c.seen.length
  let sync = false
  let p1: any
  try { p1 = c.s.invoker.invoke(alice, { ref: files, action: READ, args: bad as any, expectedDefinition: digest, correlationKey: correlationKeyOf('k1'), signal: new AbortController().signal }) } catch { sync = true }
  const r1 = await p1.then(() => 'resolved', (e: any) => e.constructor.name)
  console.log('R4-4 invoke bad args: sync throw =', sync, 'promise =', r1, 'cancel(k1) =', await c.s.invoker.cancel(alice, correlationKeyOf('k1')))
  const started: any = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: digest, correlationKey: correlationKeyOf('k2'), signal: new AbortController().signal })
  const task = { ref: files, taskId: taskIdOf('t1'), issuedAt: started.outcome.issuedAt }
  let sync2 = false; let p2: any
  try { p2 = c.s.invoker.provideTaskInput(alice, task, bad as any) } catch { sync2 = true }
  const r2 = await p2.then(() => 'resolved', (e: any) => e.constructor.name)
  // unknown task, bad tree: TypeError still (judged before the table)
  const r3 = await c.s.invoker.provideTaskInput(alice, { ...task, taskId: taskIdOf('nope') }, bad as any).then(() => 'resolved', (e: any) => e.constructor.name)
  console.log('R4-4 provideTaskInput bad: sync throw =', sync2, 'promise =', r2, 'unknown task + bad =', r3, 'updateTask seen =', c.seen.filter(x => x.m === 'updateTask').length, 'calls after first =', c.seen.length - before)
})

it('R4-5 refresh exit order without a shutdown: signal aborted before refresh, endpoint not adopted', async () => {
  const c = await arrange({ read: completed([text('d')]) }, undefined, false)
  const ac = new AbortController(); ac.abort()
  console.log('R4-5 refresh(not adopted, signal aborted) =', JSON.stringify(await c.s.discovery.refresh(alice, { ref: files, signal: ac.signal })))
  console.log('R4-5 refresh(not adopted, signal live)    =', JSON.stringify(await c.s.discovery.refresh(alice, { ref: files })))
})
