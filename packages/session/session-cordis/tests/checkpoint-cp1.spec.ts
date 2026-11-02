// CP1, the first in-line checkpoint (R3, RUN-5): the session provider and the session SQL storage
// on one real Cordis root, over the real sqlite-provider. A session is created, one input is
// appended through the work face in one command, and the operation is queried and is `committed`;
// a principal of another tenant is answered `denied`. The storage is `createSessionStoragePair`
// over real files, one real write Worker for each transaction domain and the real read Workers.
// Everything else (identity, evidence, the access policy) is a double of session-contract.
// @module-tag slow
// Why slow: real sqlite-provider Workers and real files in a temporary directory.
import { afterEach, describe, expect, it } from 'vitest'
import { operationId, ordinaryInput, succeeded } from '@omne-harness/session-contract/testing'
import { assemble, type Assembly } from './fixtures/assembly.ts'
import { sqlBackend } from './fixtures/sql-backend.ts'

const open: Assembly[] = []
afterEach(async () => {
  for (const assembly of open.splice(0)) await assembly.close()
})

async function build(): Promise<Assembly> {
  const assembly = await assemble({ backend: sqlBackend })
  open.push(assembly)
  return assembly
}

describe('CP1: create, append through the work face, query; another tenant is denied', () => {
  it('commits both commands to the real SQL storage and answers committed on query', async () => {
    const a = await build()
    const intake = await a.caller('intake')

    const created = await a.create(intake)
    const appended = await a.accept(intake, 'first-input', 'session-1', 'hello from the checkpoint')
    expect(BigInt(appended.revision)).toBeGreaterThan(BigInt(created.revision))

    const query = succeeded(
      await intake.session().work.queryOperation({
        ...a.access(),
        operation: operationId('accept-first-input'),
      }),
      'queryOperation',
    )
    expect(query).toEqual({ kind: 'committed', receipt: appended })

    // The same operation, repeated, is recognized: the same revision, answered as recovered.
    const again = await a.accept(intake, 'first-input', 'session-1', 'hello from the checkpoint')
    expect(again).toEqual({ ...appended, recovered: true })
  })

  it('answers denied to a principal of another tenant, the same as for a session that never was', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    const coordinator = await a.caller('coordinator')
    await a.create(intake)
    await a.accept(intake, 'first-input')

    const stranger = await coordinator.session().work.readWork(a.other())
    expect(stranger).toEqual({ failure: { kind: 'denied', action: 'readWork' } })
    const never = await coordinator.session().work.readWork(a.access('never-created'))
    expect(never).toEqual({ failure: { kind: 'denied', action: 'readWork' } })

    // The stranger also cannot append to, or query the operations of, the session of the other tenant.
    const appended = await intake.session().work.accept({
      ...a.access(),
      principal: 'b:stranger',
      operation: operationId('accept-from-b'),
      value: ordinaryInput('from-b'),
    })
    expect(appended).toEqual({ failure: { kind: 'denied', action: 'accept' } })
    const queried = await intake.session().work.queryOperation({
      ...a.access(),
      principal: 'b:stranger',
      operation: operationId('accept-first-input'),
    })
    expect(queried).toEqual({ failure: { kind: 'denied', action: 'queryOperation' } })
  })

  it('ordered shutdown on the real store: the storage closes after the command in flight has ended', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    await a.create(intake)
    // The stand-in storage row closes the real provider, so a close that came early would break the command.
    await a.mountStorageRow(() => a.backend.dispose())
    a.log.length = 0
    const gate = a.hold()
    const inflight = a.accept(intake, 'last-command')
    await gate.arrived
    const shutting = a.shutdown()
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(a.log).toContain('stop:session-provider')
    expect(a.log).not.toContain('storage-closing')

    gate.release()
    const results = await shutting
    expect(results['session-provider']).toEqual({ kind: 'settled' })
    // The command ended with a receipt on the real store before the store was closed.
    expect((await inflight).revision).toBeDefined()
    const order = [
      'commit-settled',
      'stopped:session-provider',
      'storage-closing',
      'storage-closed',
    ].map(entry => a.log.indexOf(entry))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })

  it('the notice of a commit carries the entry kinds read from the history of the store', async () => {
    const a = await build()
    await a.listen()
    const intake = await a.caller('intake')
    await a.create(intake)
    await expect.poll(() => a.events.length).toBe(1)
    expect(a.events[0]![4]).toEqual(['session.adoption'])
  })
})
