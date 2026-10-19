import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { MemoryState } from '../src/testing/state.ts'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { callCommands, recoveryCommands } from '../src/testing/calls.ts'
import { callId, fixture, identity, instance, op, owner, proof, unbox } from './memory-fixture.ts'

function setup() {
  const f = fixture()
  const memory = createMemoryModelCommands(f.options)
  return { ...f, store: { control: memory.control }, commands: memory.commands }
}
it('admission freezes input, isolates tenants and recognizes a legally reminted tenant', async () => {
  const f = setup()
  const first = unbox(await f.commands.admit(f.admit))
  const text = tenantCodec.encode(f.tenant)
  if (!text.ok) throw new Error('tenant fixture')
  const reminted = tenantCodec.parse(text.value)
  if (!reminted.ok) throw new Error('tenant fixture')
  expect(unbox(await f.commands.admit({ ...f.admit, tenant: reminted.value }))).toEqual({
    ...first,
    recovered: true,
  })
  expect(await f.commands.admit({ ...f.admit, tenant: structuredClone(f.tenant) })).toEqual({
    failure: { kind: 'denied', action: 'tenant' },
  })
  expect(await f.commands.admit({ ...f.admit, principal: { subject: 'trusted' } })).toEqual({
    failure: { kind: 'denied', action: 'facts' },
  })
  const record = unbox(await f.commands.loadRecovery(f.admit))
  expect(record.request).toEqual(f.admit.request)
  expect(record.initiator).toEqual({ owner: 'identity', subject: 'trusted', revision: '1' })
  expect(record.tasks).toEqual(['execute'])
})
it('tenant-wide operation bindings reject cross-call, cross-method and changed inputs', async () => {
  const f = setup()
  unbox(await f.commands.admit(f.admit))
  expect(await f.commands.admit({ ...f.admit, call: callId('other') })).toMatchObject({
    failure: { kind: 'conflict' },
  })
  expect(await f.commands.control(f.admit)).toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    await f.commands.admit({ ...f.admit, capacity: { ...f.admit.capacity, bytes: '99999' } }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  f.store.control.replaceOwners([])
  expect(unbox(await f.commands.admit(f.admit)).recovered).toBe(true)
  expect(
    await f.commands.admit({ ...f.admit, call: callId('other'), operation: op('other') }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'consumer.owner' } })
  f.denied.add('facts')
  expect(await f.commands.admit(f.admit)).toMatchObject({ failure: { kind: 'denied' } })
})
for (const effect of ['applied', 'not-applied'] as const)
  it(`preserves ${effect} unknown until explicitly revealed without applying twice`, async () => {
    const f = setup()
    f.store.control.injectUnknown({ ...f.admit, method: 'admit', effect })
    expect(await f.commands.admit(f.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
    expect(unbox(await f.commands.query(f.admit))).toEqual({ kind: 'unknown' })
    expect(
      unbox(await f.commands.scanPending({ ...f.admit, after: null, limit: 1 })).calls,
    ).toEqual([f.admit.call])
    if (effect === 'not-applied')
      expect(await f.commands.loadRecovery(f.admit)).toMatchObject({
        failure: { kind: 'commit-unknown' },
      })
    expect(await f.commands.admit({ ...f.admit, operation: op('bypass-unknown') })).toMatchObject({
      failure: { kind: 'commit-unknown', operation: f.admit.operation },
    })
    expect(await f.commands.admit(f.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
    expect(
      await f.commands.admit({ ...f.admit, capacity: { ...f.admit.capacity, bytes: '12345' } }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    expect(() =>
      f.store.control.reveal({
        ...f.admit,
        result: effect === 'applied' ? 'rolled-back' : 'committed',
      }),
    ).toThrow(TypeError)
    f.store.control.reveal({
      ...f.admit,
      result: effect === 'applied' ? 'committed' : 'not-committed',
    })
    expect(unbox(await f.commands.query(f.admit)).kind).toBe(
      effect === 'applied' ? 'committed' : 'not-committed',
    )
    expect(unbox(await f.commands.admit(f.admit)).recovered).toBe(effect === 'applied')
  })
it('claim recognizes its original generation and excludes old writes after succession', async () => {
  const f = setup()
  unbox(await f.commands.admit(f.admit))
  const input = {
    ...f.admit,
    operation: op('claim'),
    instance: instance(),
    continuity: proof(f.admit.call),
  }
  const first = unbox(await f.commands.claim(input))
  expect(unbox(await f.commands.claim(input))).toEqual(first)
  const second = unbox(
    await f.commands.claim({ ...input, operation: op('claim-two'), instance: instance('two') }),
  )
  expect(second.generation).toBe('2')
  expect(await f.commands.claim(input)).toEqual({
    failure: { kind: 'stale-instance', instance: input.instance },
  })
  expect(unbox(await f.commands.scanPending({ ...f.admit, after: null, limit: 1 })).calls).toEqual([
    f.admit.call,
  ])
  expect(await f.commands.scanPending({ ...f.admit, after: 'forged', limit: 1 })).toMatchObject({
    failure: { field: 'after' },
  })
  expect(await f.commands.scanPending({ ...f.admit, after: null, limit: 3 })).toMatchObject({
    failure: { field: 'limit' },
  })
})
it('refuses guarded, duplicate and missing evidence owner declarations at construction', () => {
  const f = fixture()
  expect(
    () =>
      new MemoryState({
        ...f.options,
        owners: [{ ...owner, work: { kind: 'guarded', participant: owner.evidence } }],
      }),
  ).toThrow(/not ready/u)
  expect(() => new MemoryState({ ...f.options, owners: [owner, owner] })).toThrow(/duplicate/u)
  expect(() => new MemoryState({ ...f.options, evidence: [] })).toThrow(/evidence/u)
})
it('protects receipts from caller mutation and validates a forged tenant before invoking authority', async () => {
  const f = setup()
  const original = unbox(await f.commands.admit(f.admit))
  const baseline = { ...original }
  Object.assign(original, { revision: '999', call: 'mcall_corrupt' })
  expect(unbox(await f.commands.admit(f.admit))).toEqual({ ...baseline, recovered: true })
  let calls = 0
  const authority = {
    ...f.options.authority,
    authorize: (input: Parameters<typeof f.options.authority.authorize>[0]) => {
      calls += 1
      return f.options.authority.authorize(input)
    },
  }
  const store = new MemoryState({ ...f.options, authority })
  const command = recoveryCommands(store)
  expect(
    await command.scanPending({
      ...f.admit,
      tenant: structuredClone(f.tenant),
      after: null,
      limit: 1,
    }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(calls).toBe(0)
})
it('derives one finite reservation total across tenants and does not reserve after rejection', async () => {
  const a = fixture()
  const other = identity('6')
  const authority = {
    ...a.options.authority,
    authorize: () => ({ ok: { owner: 'test', subject: 'test', revision: '1' } }),
  }
  const store = new MemoryState({
    ...a.options,
    authority,
    limits: {
      ...a.options.limits,
      capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100' },
    },
  })
  const commands = callCommands(store)
  const input = { ...a.admit, capacity: { bytes: '90000', blocks: '40', attachmentBytes: '40' } }
  unbox(await commands.admit(input))
  expect(await commands.admit({ ...input, tenant: other })).toMatchObject({
    failure: { kind: 'capacity' },
  })
  expect(store.reserved('bytes')).toBe(90000n)
  expect(await commands.admit({ ...input, tenant: other })).toMatchObject({
    failure: { kind: 'capacity' },
  })
})
it('rejects asynchronous authority and adapter reentry before any partial admission is visible', async () => {
  const f = fixture()
  const authority = f.options.authority
  const authorize = authority.authorize.bind(authority)
  const memory = createMemoryModelCommands(f.options)
  Object.assign(authority, {
    authorize: () =>
      Promise.resolve({ ok: { owner: 'identity', subject: 'trusted', revision: '1' } }),
  })
  expect(() => memory.commands.admit(f.admit)).toThrow(/synchronous/u)
  Object.assign(authority, {
    authorize: () => {
      void memory.commands.query(f.admit)
      return { ok: { owner: 'identity', subject: 'trusted', revision: '1' } }
    },
  })
  expect(() => memory.commands.admit(f.admit)).toThrow(/reentry/u)
  Object.assign(authority, { authorize })
  expect(unbox(await memory.commands.recall({ ...f.admit, admission: f.admit.operation }))).toEqual(
    { kind: 'not-accepted', operation: f.admit.operation },
  )
  expect(Object.keys(memory).sort()).toEqual(['commands', 'control'])
})
