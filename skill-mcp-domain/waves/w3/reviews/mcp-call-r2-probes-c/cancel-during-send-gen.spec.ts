// Probe: a cancel that lands while transport.call is still in flight (key still 'reserved'),
// after the connection was lost and rebuilt to generation 2. Does cancel answer 'signalled'
// and a cancelRequest go to the gen-1 transport?
import { expect, it } from 'vitest'
import { actionNameOf, correlationKeyOf, endpointRefOf, jsonOf } from '@omne-harness/mcp-contract/testing'
import { deferred, settled } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/deferred.ts'
import { alice } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/identities.ts'
import { listing, peer, services } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/peer.ts'
import { never, reshapedTransports } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/transports.ts'
import { adoptStdio } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/world.ts'

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const c1 = correlationKeyOf('c1')

it('cancel during send after generation change', async () => {
  const gate = deferred<void>()
  let calls = 0
  let cancelRequests: number[] = []
  const base = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: { kind: 'silent' } } })
  const transports = reshapedTransports(base.ports.transports, (transport, opened) => ({
    async call(request, signal, observe) {
      const called = await transport.call(request, signal, observe)
      calls += 1
      if (calls !== 1 || 'failure' in called) return called
      await gate.promise
      return { ok: { requestId: called.ok.requestId, answer: never() } }
    },
    cancelRequest: requestId => { cancelRequests.push(opened); return transport.cancelRequest(requestId) },
  }))
  adoptStdio(base, files)
  const { services: s, table } = services({ ...base, ports: { ...base.ports, transports } })
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const current = await s.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const digest = current.ok.actions.find(a => a.name === READ)!.definitionDigest
  const [first] = table.currentOf(alice.tenant, files.holding)
  const call = s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: digest, correlationKey: c1, signal: new AbortController().signal })
  await settled()
  expect(base.requests('tools/call')).toHaveLength(1)
  await table.lose(first!.connection, first!.generation, 'stream-broken', 'connection-unavailable')
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: {} })
  const [second] = table.currentOf(alice.tenant, files.holding)
  expect(second?.generation).toBe(2)
  const answer = await s.invoker.cancel(alice, c1)
  gate.resolve()
  const result = await call
  await settled()
  console.log(JSON.stringify({ answer, result, cancelRequests, cancels: base.cancels() }))
})
