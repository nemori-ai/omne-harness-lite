// Probe: `markSent` records the view's generation at the time `transport.call` returned, not the
// generation the call was sent on (`ensured.generation`). If the same Connection object is lost
// and rebuilt while `call` is in flight, does `cancel` answer `signalled` for a call sent on a
// generation that is no longer current?
import { expect, it } from 'vitest'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  jsonOf,
} from '@omne-harness/mcp-contract/testing'
import { deferred, settled } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/deferred.ts'
import { alice } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/identities.ts'
import {
  listing,
  peer,
  services,
} from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/peer.ts'
import { adoptStdio } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/world.ts'

const files = endpointRefOf('files')
const c1 = correlationKeyOf('c1')

it('generation recorded by markSent', async () => {
  const gate = deferred<void>()
  let gated = 0
  const p = peer(
    { listing: { '': listing([{ name: 'read' }]) }, calls: { read: { kind: 'silent' } } },
    {
      callGate: {
        after: () => {
          gated += 1
          return gated === 1 ? gate.promise : Promise.resolve()
        },
      },
    },
  )
  adoptStdio(p, files)
  // The first call's answer settles only when the probe says so: a transport whose close
  // surfaces the stream break on a later turn.
  const late = deferred<never>()
  let calls = 0
  const inner = p.ports.transports
  const transports = {
    async open(material: Parameters<typeof inner.open>[0], signal: Parameters<typeof inner.open>[1]) {
      const opened = await inner.open(material, signal)
      if ('failure' in opened) return opened
      const t = opened.ok
      return {
        ok: {
          generation: t.generation,
          discover: () => t.discover(),
          listActions: (c: Parameters<typeof t.listActions>[0]) => t.listActions(c),
          async call(...args: Parameters<typeof t.call>) {
            const called = await t.call(...args)
            calls += 1
            if (calls === 1 && 'ok' in called) return { ok: { requestId: called.ok.requestId, answer: late.promise } }
            return called
          },
          cancelRequest: (id: string) => t.cancelRequest(id),
          getTask: (id: Parameters<typeof t.getTask>[0]) => t.getTask(id),
          updateTask: (id: Parameters<typeof t.updateTask>[0], r: Parameters<typeof t.updateTask>[1]) => t.updateTask(id, r),
          getTaskResult: (id: Parameters<typeof t.getTaskResult>[0]) => t.getTaskResult(id),
          cancelTask: (id: Parameters<typeof t.cancelTask>[0]) => t.cancelTask(id),
          close: () => t.close(),
        },
      }
    },
  }
  const { services: s, table } = services({ ...p, ports: { ...p.ports, transports } })
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const current = await s.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const digest = current.ok.actions[0]!.definitionDigest
  const [first] = table.currentOf(alice.tenant, files.holding)
  console.log('generation at send:', first?.generation)
  const call = s.invoker.invoke(alice, {
    ref: files,
    action: actionNameOf('read'),
    args: jsonOf({}),
    expectedDefinition: digest,
    correlationKey: c1,
    signal: new AbortController().signal,
  })
  await settled()
  console.log('tools/call received:', p.requests('tools/call').length)
  // While `call` has not returned to the call port: the connection is lost and built again.
  console.log('lose:', await table.lose(first!.connection, first!.generation, 'stream-broken', 'connection-unavailable'))
  console.log('refresh:', JSON.stringify(await s.discovery.refresh(alice, { ref: files })))
  const [second] = table.currentOf(alice.tenant, files.holding)
  console.log('generation now:', second?.generation, 'same view object:', second?.connection === first?.connection)
  gate.resolve()
  await settled()
  await settled()
  const answer = await s.invoker.cancel(alice, c1)
  console.log('cancel of the call sent on the earlier generation:', answer)
  console.log('result:', JSON.stringify(await Promise.race([call, settled().then(() => 'pending')])))
  console.log('cancelRequest notifications:', p.cancels())
})
