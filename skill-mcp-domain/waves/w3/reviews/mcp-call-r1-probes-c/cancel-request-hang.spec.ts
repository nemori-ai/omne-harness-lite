// Probe: after a cancel or an abort, the call port awaits `cancelRequest` with no bound. A
// transport whose cancel notification never completes (an HTTP POST of notifications/cancelled
// on a legacy session that the peer never answers) keeps `invoke` from returning.
import { expect, it } from 'vitest'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  jsonOf,
} from '@omne-harness/mcp-contract/testing'
import { settled } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/deferred.ts'
import { alice } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/identities.ts'
import { listing, peer, services } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/peer.ts'
import { adoptStdio } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/world.ts'

const files = endpointRefOf('files')
const c1 = correlationKeyOf('c1')

it('invoke waits for cancelRequest', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: { kind: 'silent' } } })
  adoptStdio(p, files)
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
          call: (...args: Parameters<typeof t.call>) => t.call(...args),
          cancelRequest: () => new Promise<void>(() => {}),
          getTask: (id: Parameters<typeof t.getTask>[0]) => t.getTask(id),
          updateTask: (id: Parameters<typeof t.updateTask>[0], r: Parameters<typeof t.updateTask>[1]) => t.updateTask(id, r),
          getTaskResult: (id: Parameters<typeof t.getTaskResult>[0]) => t.getTaskResult(id),
          cancelTask: (id: Parameters<typeof t.cancelTask>[0]) => t.cancelTask(id),
          close: () => t.close(),
        },
      }
    },
  }
  const { services: s } = services({ ...p, ports: { ...p.ports, transports } })
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const current = await s.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const digest = current.ok.actions[0]!.definitionDigest
  const controller = new AbortController()
  let done = false
  const call = s.invoker.invoke(alice, {
    ref: files,
    action: actionNameOf('read'),
    args: jsonOf({}),
    expectedDefinition: digest,
    correlationKey: c1,
    signal: controller.signal,
  }).then(r => { done = true; return r })
  await settled()
  expect(p.requests('tools/call')).toHaveLength(1)
  controller.abort()
  for (let i = 0; i < 20; i += 1) await settled()
  console.log('invoke returned after the abort, cancelRequest pending:', done)
  void call
})
