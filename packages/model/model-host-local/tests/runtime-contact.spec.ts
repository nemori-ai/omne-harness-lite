import type { DurableEvidence } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import { quiet, scriptedReceiver, until, world } from './support/push-world.ts'

const judged: string[] = []
function lock(instance: string): DurableEvidence {
  judged.push(instance)
  return { owner: 'test-lock', record: 'state-lock', revision: '1', digest: `instance:${instance}` }
}

async function started(input: Parameters<typeof world>[0] = { lostContact: lock }) {
  const w = world(input)
  await w.services()
  await w.load()
  return w
}

function unbox<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('ok' in reply) return reply.ok
  throw new Error(JSON.stringify(reply.failure))
}

describe('the contact answer of the local host', () => {
  it('holds a call as soon as its admission returns', async () => {
    const w = await started()
    const gate = Promise.withResolvers<'pass'>()
    w.hooks.resolve = () => gate.promise
    await w.admit('one')
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'holding' })
    gate.resolve('pass')
  })

  it('answers lost for a settled call whose push gave up while its receiver is registered', async () => {
    const w = await started()
    const scripted = scriptedReceiver()
    scripted.state.next = Array.from({ length: 20 }, () => 'unknown' as const)
    await w.register(scripted.receiver)
    await w.admit('one')
    await until(() => w.record('one')?.result?.standing.status === 'unknown', 'the given-up push')
    await quiet()
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'lost', evidence: lock('mcall_one') })
  })

  it('holds a woken call that waits for a free drive', async () => {
    const w = await started()
    const gate = Promise.withResolvers<'pass'>()
    w.hooks.resolve = () => gate.promise
    for (const name of ['one', 'two', 'three', 'four', 'five']) await w.admit(name)
    expect(unbox(await w.contact('five'))).toEqual({ kind: 'holding' })
    gate.resolve('pass')
  })

  it('holds a call whose drive failed and that waits for its next wake', async () => {
    const w = await started()
    w.hooks.loadRecovery = () => 'fail'
    await w.admit('one')
    await until(
      () => w.warnings.some(text => text.includes('drive ended with unavailable')),
      'the failed drive',
    )
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'holding' })
    w.hooks.loadRecovery = () => 'pass'
  })

  it('does not hold a call whose drive stopped with nothing to wake it again', async () => {
    const w = await started()
    w.hooks.resolve = () => 'refuse'
    await w.admit('one')
    await until(
      () => w.warnings.some(text => text.includes('no trusted input')),
      'the refused drive',
    )
    await quiet()
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'lost', evidence: lock('mcall_one') })
  })

  it('answers unknown for a call it does not hold when the host has no judge', async () => {
    const w = await started({})
    w.hooks.resolve = () => 'refuse'
    await w.admit('one')
    await until(
      () => w.warnings.some(text => text.includes('no trusted input')),
      'the refused drive',
    )
    await quiet()
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'unknown' })
  })

  it('answers lost with the judge evidence for a call admitted behind the host, named by the call', async () => {
    const w = await started()
    unbox(await w.admitBehind('one'))
    judged.length = 0
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'lost', evidence: lock('mcall_one') })
    expect(judged[0]).toBe('mcall_one')
    expect(unbox(await w.contact('two'))).toEqual({ kind: 'not-accepted' })
  })

  it('answers settled for a settled call whose result waits for its receiver', async () => {
    const w = await started()
    await w.admit('one')
    await until(() => w.record('one')?.result?.standing.status === 'waiting', 'the waiting result')
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'settled' })
  })

  it('answers settled for a settled call whose push runs before it wrote its record', async () => {
    const w = await started()
    const gate = Promise.withResolvers<'pass'>()
    let resolved = 0
    w.hooks.resolve = () => (++resolved === 1 ? 'pass' : gate.promise)
    await w.admit('one')
    await until(() => resolved === 2, 'the push of the settled call')
    await quiet()
    expect(w.record('one')).toBeUndefined()
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'settled' })
    gate.resolve('pass')
  })

  it('answers settled for a call whose result is saved and acknowledged', async () => {
    const w = await started()
    await w.register(scriptedReceiver().receiver)
    await w.admit('one')
    await until(() => w.record('one')?.cleanup === 'released', 'the released result')
    await quiet()
    expect(unbox(await w.contact('one'))).toEqual({ kind: 'settled' })
  })
})
