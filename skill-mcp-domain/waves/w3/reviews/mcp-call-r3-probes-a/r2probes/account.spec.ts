// Reviewer probe, round 2: two tasks with the same id on two peer accounts of one holding.
import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf, millisOf, taskIdOf } from '@omne-harness/mcp-contract/testing'
const T = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests'
const { alice } = await import(`${T}/doubles/identities.ts`)
const { listing, peer, services, taskHandle, taskStatus } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio, MAIN } = await import(`${T}/doubles/world.ts`)
const files = endpointRefOf('files')
const READ = actionNameOf('read')

it('ACC: account A task ref after account B started a task with the same id', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: taskHandle('t1') }, tasks: { t1: { get: taskStatus('t1', 'working') } } })
  adoptStdio(p, files)
  const { services: s } = services(p)
  const run = async (key: string) => {
    expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: {} })
    const cur = await s.discovery.current(alice, files)
    if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
    return s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: cur.ok.actions[0]!.definitionDigest, correlationKey: correlationKeyOf(key), signal: new AbortController().signal })
  }
  const a = await run('c1')
  if (a.kind !== 'sent' || a.outcome.kind !== 'task') throw new Error('no task A')
  const refA = { ref: files, taskId: taskIdOf('t1'), issuedAt: a.outcome.issuedAt }
  p.adoption.update(alice.tenant, files, { body: jsonOf({ name: 'files', transport: 'stdio', auth: 'static', launch: { command: 'mcp' } }), settings: { target: { kind: 'absent' }, credential: { kind: 'value', value: MAIN }, connectTimeout: { kind: 'value', value: millisOf(30_000) } } })
  p.credentials.store({ tenant: alice.tenant, holding: files.holding, binding: MAIN, secret: 's' })
  const b = await run('c2')
  if (b.kind !== 'sent' || b.outcome.kind !== 'task') throw new Error('no task B: ' + JSON.stringify(b))
  console.log('ACC issuedAt A=', a.outcome.issuedAt, 'B=', b.outcome.issuedAt, 'opens=', p.opens())
  const before = p.requests('tasks/get').length
  const q = await s.invoker.queryTask(alice, refA)
  const sent = p.requests('tasks/get').slice(before)
  console.log('ACC queryTask(refA)=', JSON.stringify(q).slice(0, 120), 'tasks/get sent=', sent.length)
})
