// Probe: `McpPorts.checkOutput` is a port of the host, but it is called outside `ask`. A validator
// that throws (a JSON Schema engine refusing the peer's output schema) after `markSent`.
import { expect, it } from 'vitest'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  generationOf,
  jsonOf,
  taskIdOf,
} from '@omne-harness/mcp-contract/testing'
import { alice } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/identities.ts'
import { completed, listing, peer, services, taskHandle, taskStatus, text } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/peer.ts'
import { adoptStdio } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/world.ts'

const files = endpointRefOf('files')
const c1 = correlationKeyOf('c1')
const throwing = () => {
  throw new Error('schema engine: unsupported keyword')
}

it('invoke with a validator that throws', async () => {
  const p = peer({
    listing: { '': listing([{ name: 'read', outputSchema: { type: 'object' } }]) },
    calls: { read: completed([text('hi')], { structuredContent: { n: 1 } }) },
  })
  adoptStdio(p, files)
  const { services: s } = services({ ...p, ports: { ...p.ports, checkOutput: throwing } })
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const current = await s.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const digest = current.ok.actions[0]!.definitionDigest
  const req = () => ({
    ref: files,
    action: actionNameOf('read'),
    args: jsonOf({}),
    expectedDefinition: digest,
    correlationKey: c1,
    signal: new AbortController().signal,
  })
  const first = await s.invoker.invoke(alice, req()).then(
    r => ({ resolved: r }),
    (e: unknown) => ({ rejected: String(e) }),
  )
  console.log('first invoke:', JSON.stringify(first))
  console.log('cancel after it:', await s.invoker.cancel(alice, c1))
  console.log('same key again:', JSON.stringify(await s.invoker.invoke(alice, req()).catch((e: unknown) => String(e))))
})

it('taskResult with a validator that throws', async () => {
  const p = peer({
    listing: { '': listing([{ name: 'read', outputSchema: { type: 'object' } }]) },
    calls: { read: taskHandle('t1') },
    tasks: { t1: { get: taskStatus('t1', 'completed', { result: { content: [text('ok')], structuredContent: { n: 1 } } }) } },
  })
  adoptStdio(p, files)
  const { services: s } = services({ ...p, ports: { ...p.ports, checkOutput: throwing } })
  await s.discovery.refresh(alice, { ref: files })
  const current = await s.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const digest = current.ok.actions[0]!.definitionDigest
  await s.invoker.invoke(alice, {
    ref: files,
    action: actionNameOf('read'),
    args: jsonOf({}),
    expectedDefinition: digest,
    correlationKey: c1,
    signal: new AbortController().signal,
  })
  const result = await s.invoker
    .taskResult(alice, { ref: files, taskId: taskIdOf('t1'), issuedAt: generationOf(1) })
    .catch((e: unknown) => String(e))
  console.log('taskResult:', JSON.stringify(result))
  console.log('tasks/get requests:', p.requests('tasks/get').length)
})
