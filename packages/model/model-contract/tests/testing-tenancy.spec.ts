import { reservedReference } from './reference-input.ts'
import { describe, expect, it } from 'vitest'
import { deriveGuardControlOperation } from '@omne-harness/model-contract'
import {
  access,
  ackInput,
  admission,
  admitCall,
  alice,
  call,
  callRef,
  failureOf,
  must,
  operation,
  scriptedProvider,
  settleCall,
  tenantA,
  tenantB,
  version,
} from './scripted-support.ts'

type Scripted = ReturnType<typeof scriptedProvider>

const queryOf = (scripted: Scripted, who: ReturnType<typeof access>, label: string) =>
  scripted.controller.queryCommit({ ...who, operation: operation(label) })

describe('a scripted unknown commit and the tenants', () => {
  it('answers a query of another tenant for a held operation as for an operation never used', async () => {
    const scripted = scriptedProvider()
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('shared'),
      effect: 'applied',
      query: 'stays-unknown',
    })
    await scripted.provider.runtime.calls.admit(admission('a', { operation: operation('shared') }))
    const own = access('a')
    expect(must(await queryOf(scripted, own, 'shared'))).toEqual({ kind: 'unknown' })
    const foreign = { ...own, tenant: tenantB }
    const held = await queryOf(scripted, foreign, 'shared')
    expect(held).toEqual(await queryOf(scripted, foreign, 'never-used'))
    expect(must(held)).toEqual({ kind: 'not-committed' })
  })

  it('does not settle the held query of one tenant when another tenant sends the same operation', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('shared'),
      effect: 'applied',
      query: 'stays-unknown',
    })
    await calls.admit(admission('a', { operation: operation('shared') }))
    must(await calls.admit(admission('b', { tenant: tenantB, operation: operation('shared') })))
    expect(must(await queryOf(scripted, access('a'), 'shared'))).toEqual({ kind: 'unknown' })
    must(await calls.admit(admission('a', { operation: operation('shared') })))
    expect(must(await queryOf(scripted, access('a'), 'shared'))).toEqual({
      kind: 'committed',
      value: { revision: '1' },
    })
  })

  it('does not use up the script of one tenant when another tenant sends the same operation first', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('shared'),
      effect: 'dropped',
      query: 'answers',
    })
    const foreign = await calls.admit(
      admission('b', { tenant: tenantB, operation: operation('shared') }),
    )
    expect(must(foreign).recovered).toBe(false)
    expect(
      failureOf(await calls.admit(admission('a', { operation: operation('shared') }))),
    ).toEqual({ kind: 'commit-unknown', operation: operation('shared') })
  })

  it('keeps a script for each tenant that names the same operation', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    for (const tenant of [tenantA, tenantB])
      scripted.controller.commitUnknown({
        tenant,
        action: 'admit',
        operation: operation('shared'),
        effect: 'dropped',
        query: 'answers',
      })
    const unknown = { kind: 'commit-unknown', operation: operation('shared') }
    expect(
      failureOf(
        await calls.admit(admission('b', { tenant: tenantB, operation: operation('shared') })),
      ),
    ).toEqual(unknown)
    expect(
      failureOf(await calls.admit(admission('a', { operation: operation('shared') }))),
    ).toEqual(unknown)
  })

  it('throws for a script that names a tenant that is not a legal identity', () => {
    const scripted = scriptedProvider()
    expect(() =>
      scripted.controller.commitUnknown({
        tenant: { ...tenantA },
        action: 'admit',
        operation: operation('shared'),
        effect: 'dropped',
        query: 'answers',
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'ScriptedModelError',
        reason: 'invalid-script',
        message: 'the tenant is not a legal identity',
      }),
    )
  })
})

describe('a commit query and the call that owns the operation', () => {
  it('answers a query that names another call of the tenant as for an operation never sent', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    expect(must(await queryOf(scripted, access('a'), 'admit-a'))).toMatchObject({
      kind: 'committed',
    })
    const other = await queryOf(scripted, access('b'), 'admit-a')
    expect(other).toEqual(await queryOf(scripted, access('b'), 'never-sent'))
    expect(must(other)).toEqual({ kind: 'not-committed' })
  })

  it('answers a query that names a call the provider never accepted as for an operation never sent', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const missing = await queryOf(scripted, access('zzz'), 'admit-a')
    expect(missing).toEqual(await queryOf(scripted, access('zzz'), 'never-sent'))
    expect(must(missing)).toEqual({ kind: 'not-committed' })
  })

  it('keeps the denial of a query when another or a missing call is named for the same operation', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: ['query'] })
    expect(failureOf(await queryOf(scripted, access('a'), 'admit-a'))).toEqual({
      kind: 'denied',
      action: 'query',
    })
    for (const name of ['b', 'zzz'])
      expect(must(await queryOf(scripted, access(name), 'admit-a'))).toEqual({
        kind: 'not-committed',
      })
  })

  it('keeps a held operation from a query that names another call', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'b')
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('shared'),
      effect: 'applied',
      query: 'stays-unknown',
    })
    await scripted.provider.runtime.calls.admit(admission('a', { operation: operation('shared') }))
    expect(must(await queryOf(scripted, access('a'), 'shared'))).toEqual({ kind: 'unknown' })
    expect(must(await queryOf(scripted, access('b'), 'shared'))).toEqual({
      kind: 'not-committed',
    })
  })
})

describe('a reserved operation and the access to a call', () => {
  type Method = 'admit' | 'inspect' | 'cancel' | 'beginRead' | 'acknowledge'

  /** The reserved value is refused alike for a call of the principal, of another tenant, and none. */
  async function refusedBeforeAccess(method: Method) {
    const scripted = scriptedProvider()
    const { calls, consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const reserved = deriveGuardControlOperation(call('a'))
    const run = (who: ReturnType<typeof access>) => {
      switch (method) {
        case 'admit':
          return calls.admit(admission('x', { ...who, operation: reserved }))
        case 'inspect':
          return Reflect.apply(calls.inspect, calls, [
            {
              ...who,
              reference: reservedReference({ ...who, admission: reserved }),
            },
          ])
        case 'cancel':
          return calls.cancel({ ...who, operation: reserved })
        case 'beginRead':
          return consumption.beginRead({ ...who, operation: reserved, result: version('a') })
        case 'acknowledge':
          return consumption.acknowledge({ ...ackInput('a'), ...who, operation: reserved })
      }
    }
    const own = failureOf(await run(access('a')))
    expect(own).toMatchObject({ kind: 'invalid' })
    expect(failureOf(await run(access('missing')))).toEqual(own)
    expect(failureOf(await run({ ...access('a'), tenant: tenantB }))).toEqual(
      method === 'beginRead' ? { kind: 'denied', action: 'beginRead' } : own,
    )
  }

  it('is refused before the access is checked on admit', () => refusedBeforeAccess('admit'))
  it('is refused before the access is checked on inspect', () => refusedBeforeAccess('inspect'))
  it('is refused before the access is checked on cancel', () => refusedBeforeAccess('cancel'))
  it('resolves the reference tenant before refusing a reserved read operation', () =>
    refusedBeforeAccess('beginRead'))
  it('is refused before the access is checked on acknowledge', () =>
    refusedBeforeAccess('acknowledge'))
})

describe('a held commit query and the writes of other calls', () => {
  it('stays unknown while another call of the tenant sends the held operation and is refused', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('held'),
      effect: 'applied',
      query: 'stays-unknown',
    })
    expect(failureOf(await calls.admit(admission('a', { operation: operation('held') })))).toEqual({
      kind: 'commit-unknown',
      operation: operation('held'),
    })
    expect(must(await queryOf(scripted, access('a'), 'held'))).toEqual({ kind: 'unknown' })
    expect(
      failureOf(await calls.admit(admission('b', { operation: operation('held') }))),
    ).toMatchObject({ kind: 'conflict' })
    expect(must(await queryOf(scripted, access('a'), 'held'))).toEqual({ kind: 'unknown' })
  })

  it('answers the query once the call that sent the operation sends it again', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('held'),
      effect: 'applied',
      query: 'stays-unknown',
    })
    await calls.admit(admission('a', { operation: operation('held') }))
    await calls.admit(admission('b', { operation: operation('held') }))
    must(await calls.admit(admission('a', { operation: operation('held') })))
    expect(must(await queryOf(scripted, access('a'), 'held'))).toEqual({
      kind: 'committed',
      value: { revision: '1' },
    })
  })

  it('answers the query once the call that sent the operation sends it again, even where the write conflicts', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('held'),
      effect: 'applied',
      query: 'stays-unknown',
    })
    await calls.admit(admission('a', { operation: operation('held') }))
    expect(must(await queryOf(scripted, access('a'), 'held'))).toEqual({ kind: 'unknown' })
    expect(
      failureOf(await calls.cancel({ ...access('a'), operation: operation('held') })),
    ).toMatchObject({ kind: 'conflict' })
    expect(must(await queryOf(scripted, access('a'), 'held'))).toEqual({
      kind: 'committed',
      value: { revision: '1' },
    })
  })
})
