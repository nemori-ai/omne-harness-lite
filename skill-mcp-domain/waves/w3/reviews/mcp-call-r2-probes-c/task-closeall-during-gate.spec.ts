// Probe: closeAll lands while a task operation's gate (decideForUse) is asked, before ensure.
// S8: after closeAll the task operations answer effect-unknown(no-connection).
import { expect, it } from 'vitest'
import { actionNameOf, correlationKeyOf, endpointRefOf, generationOf, jsonOf, taskIdOf } from '@omne-harness/mcp-contract/testing'
import { deferred, settled } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/deferred.ts'
import { alice } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/identities.ts'
import { listing, peer, services, taskHandle, taskStatus } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/peer.ts'
import { adoptStdio } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/world.ts'

const files = endpointRefOf('files')
it('closeAll during task gate', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: taskHandle('t1') }, tasks: { t1: { get: taskStatus('t1', 'working') } } })
  adoptStdio(p, files)
  let stall = false
  let reached = 0
  const gate = deferred<void>()
  const eligibility = { async check(a: any, e: any) { if (stall) { reached += 1; await gate.promise } return p.eligibility.check(a, e) } }
  const { services: s } = services({ ...p, ports: { ...p.ports, eligibility } })
  await s.discovery.refresh(alice, { ref: files })
  const current = await s.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('x')
  const digest = current.ok.actions[0]!.definitionDigest
  const r = await s.invoker.invoke(alice, { ref: files, action: actionNameOf('read'), args: jsonOf({}), expectedDefinition: digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  expect(r).toMatchObject({ kind: 'sent', outcome: { kind: 'task' } })
  await s.connections.release(alice, files)
  stall = true
  const q = s.invoker.queryTask(alice, { ref: files, taskId: taskIdOf('t1'), issuedAt: generationOf(1) })
  await settled()
  expect(reached).toBe(1)
  await s.connections.closeAll()
  gate.resolve()
  console.log('ANSWER', JSON.stringify(await q))
  console.log('AFTER', JSON.stringify(await s.invoker.queryTask(alice, { ref: files, taskId: taskIdOf('t1'), issuedAt: generationOf(1) })))
})
