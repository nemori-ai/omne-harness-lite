// Reviewer probes (not part of the delivery). Imports the member by absolute path.
import { describe, expect, it } from 'vitest'
import { digestDefinition, type DefinitionDigest, type InvokeRequest } from '@omne-harness/mcp-contract'
import type { McpTransportFactory } from '@omne-harness/mcp-contract/provider'
import { actionNameOf, correlationKeyOf, endpointRefOf, jsonOf, type Replies } from '@omne-harness/mcp-contract/testing'
const T = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests'
const { settled, deferred } = await import(`${T}/doubles/deferred.ts`)
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text } = await import(`${T}/doubles/peer.ts`)
const { stallingEligibility } = await import(`${T}/doubles/stalls.ts`)
const { adoptStdio, storedRecord } = await import(`${T}/doubles/world.ts`)

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const c1 = correlationKeyOf('c1')
const anonymousKey = { tenant: alice.tenant, account: { kind: 'anonymous' as const }, holding: files.holding }

async function arranged(read: Replies) {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read } })
  adoptStdio(p, files)
  const stored = await storedRecord(p, anonymousKey, ['read'])
  const digest = stored.actions[0]?.definitionDigest
  if (digest === undefined) throw new Error('no digest')
  return { p, digest }
}
function request(expectedDefinition: DefinitionDigest, signal?: AbortSignal): InvokeRequest {
  return { ref: files, action: READ, args: jsonOf({}), expectedDefinition, correlationKey: c1, signal: signal ?? new AbortController().signal }
}
async function turns(n: number) { for (let i = 0; i < n; i++) await settled() }

describe('probes', () => {
  it('P1: a cancelRequest that never settles keeps invoke from answering after cancel', async () => {
    const { p, digest } = await arranged({ kind: 'silent' })
    const inner = p.ports.transports
    let cancelRequests = 0
    const hanging: McpTransportFactory = {
      async open(material, signal) {
        const opened = await inner.open(material, signal)
        if ('failure' in opened) return opened
        const t = opened.ok
        return { ok: {
          generation: t.generation, discover: () => t.discover(), listActions: c => t.listActions(c),
          call: (r, s, o) => t.call(r, s, o),
          cancelRequest: () => { cancelRequests += 1; return new Promise<void>(() => {}) },
          getTask: x => t.getTask(x), updateTask: (x, y) => t.updateTask(x, y), getTaskResult: x => t.getTaskResult(x),
          cancelTask: x => t.cancelTask(x), close: () => t.close(),
        } }
      },
    }
    const { services: s } = services({ ...p, ports: { ...p.ports, transports: hanging } })
    let answered: unknown = 'pending'
    const call = s.invoker.invoke(alice, request(digest)).then(v => { answered = v })
    await turns(3)
    expect(p.requests('tools/call')).toHaveLength(1)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    await turns(20)
    console.log('P1 cancelRequests=', cancelRequests, 'invoke answer after cancel =', JSON.stringify(answered))
    void call
  })

  it('P2: a cancel during the gate followed by a refusing step: the call answers the refusal, not cancelled; a later cancel answers unknown', async () => {
    const { p, digest } = await arranged(completed([text('hi')]))
    const stalled = stallingEligibility(p.eligibility, 1)
    const { services: s } = services({ ...p, ports: { ...p.ports, eligibility: stalled.port } })
    const stale = digestDefinition({ name: READ, definition: jsonOf({ name: 'read', other: 1 }) })
    const call = s.invoker.invoke(alice, request(stale))
    await settled()
    const first = await s.invoker.cancel(alice, c1)
    stalled.gate.resolve()
    const result = await call
    const second = await s.invoker.cancel(alice, c1)
    console.log('P2 first cancel=', first, 'invoke=', JSON.stringify(result), 'second cancel=', second)
  })

  it('P3: a store read that never answers keeps invoke from answering after the caller aborts', async () => {
    const { p, digest } = await arranged(completed([text('hi')]))
    const store = { ...p.store, read: () => new Promise<never>(() => {}) }
    const { services: s } = services({ ...p, ports: { ...p.ports, store } })
    const abort = new AbortController()
    let answered: unknown = 'pending'
    void s.invoker.invoke(alice, request(digest, abort.signal)).then(v => { answered = v })
    await turns(3)
    abort.abort()
    await turns(20)
    console.log('P3 invoke answer after abort =', JSON.stringify(answered))
  })
})

describe('probe P4', () => {
  it('P4: a checkOutput that throws (e.g. a schema engine on an invalid peer schema) rejects invoke and leaves the key in use', async () => {
    const p = peer({ listing: { '': listing([{ name: 'read', outputSchema: { type: 'object' } }]) }, calls: { read: completed([text('hi')], { structuredContent: { a: 1 } }) } })
    adoptStdio(p, files)
    const ports = { ...p.ports, checkOutput: () => { throw new Error('schema is invalid') } }
    const { services: s } = services({ ...p, ports })
    await s.discovery.refresh(alice, { ref: files })
    const cur = await s.discovery.current(alice, files)
    if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
    const digest = cur.ok.actions[0]!.definitionDigest
    let first: unknown
    try { first = await s.invoker.invoke(alice, request(digest)) } catch (e) { first = `rejected: ${String(e)}` }
    const calls = p.requests('tools/call').length
    const again = await s.invoker.invoke(alice, request(digest))
    const cancel = await s.invoker.cancel(alice, c1)
    console.log('P4 first=', JSON.stringify(first), 'tools/call=', calls, 'again=', JSON.stringify(again), 'cancel=', cancel)
  })
})

describe('probe P5', () => {
  it('P5: taskResult with a throwing checkOutput reads as no answer (abandoned)', async () => {
    const { taskIdOf, generationOf } = await import('@omne-harness/mcp-contract/testing')
    const p = peer({
      listing: { '': listing([{ name: 'read', outputSchema: { type: 'object' } }]) },
      calls: { read: { kind: 'result', result: { resultType: 'task', taskId: 't1' } } },
      tasks: { t1: { get: { kind: 'result', result: { taskId: 't1', status: 'completed', result: { content: [text('ok')], structuredContent: { n: 1 } } } } } },
    })
    adoptStdio(p, files)
    const ports = { ...p.ports, checkOutput: () => { throw new Error('schema is invalid') } }
    const { services: s } = services({ ...p, ports })
    await s.discovery.refresh(alice, { ref: files })
    const cur = await s.discovery.current(alice, files)
    if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
    const digest = cur.ok.actions[0]!.definitionDigest
    const started = await s.invoker.invoke(alice, request(digest))
    const r = await s.invoker.taskResult(alice, { ref: files, taskId: taskIdOf('t1'), issuedAt: generationOf(1) })
    console.log('P5 started=', JSON.stringify(started).slice(0, 80), 'taskResult=', JSON.stringify(r), 'tasks/get=', p.requests('tasks/get').length)
  })
})
