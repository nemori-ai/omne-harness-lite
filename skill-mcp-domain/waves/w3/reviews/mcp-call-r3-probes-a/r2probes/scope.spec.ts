// Reviewer probes, round 2: the teardown and catalog mark handed to the table's scope, against
// the call's answer and closeAll.
import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf } from '@omne-harness/mcp-contract/testing'
const T = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests'
const { deferred, settled } = await import(`${T}/doubles/deferred.ts`)
const { alice } = await import(`${T}/doubles/identities.ts`)
const { listing, peer, services } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)
const files = endpointRefOf('files')
const READ = actionNameOf('read')

it('SC-a: state at the moment the call answers, and closeAll against a mark still in the scope', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: { kind: 'stream-breaks' } } })
  adoptStdio(p, files)
  let holdWrites = false
  const writeGate = deferred<void>()
  const log: string[] = []
  const store = { ...p.store, write: async (k: any, r: any, rev: any) => { if (holdWrites) { log.push('write asked'); await writeGate.promise; log.push('write released') } return p.store.write(k, r, rev) } }
  const { services: s, table } = services({ ...p, ports: { ...p.ports, store } })
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const cur = await s.discovery.current(alice, files)
  if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
  holdWrites = true
  let stateAtAnswer: unknown
  const r = await s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: cur.ok.actions[0]!.definitionDigest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal }).then(v => { stateAtAnswer = table.stateOf(alice.tenant, files.holding); return v })
  console.log('SC-a answer=', JSON.stringify(r), 'state at answer=', JSON.stringify(stateAtAnswer))
  for (let i = 0; i < 5; i++) await settled()
  let closed = false
  const closing = s.connections.closeAll().then(v => { closed = true; log.push('closeAll resolved'); return v })
  for (let i = 0; i < 10; i++) await settled()
  console.log('SC-a closeAll resolved while the mark write waits:', closed, 'log=', log.join(' | '))
  writeGate.resolve()
  await closing
  for (let i = 0; i < 5; i++) await settled()
  console.log('SC-a log after release=', log.join(' | '))
  const after = await s.discovery.current(alice, files)
  console.log('SC-a catalog after=', JSON.stringify(after))
})
