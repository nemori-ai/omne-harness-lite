import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ReadId } from '@omne-harness/model-contract'
import type { ScriptedAction } from '@omne-harness/model-contract/testing'
import {
  access,
  ackInput,
  admission,
  admitCall,
  alice,
  call,
  callRef,
  deniedAs,
  endedAs,
  liveHandle,
  must,
  operation,
  scriptedProvider,
  settleCall,
  tenantA,
  tenantB,
  version,
  watch,
} from './scripted-support.ts'

async function settledCallWithTwoReads() {
  const scripted = scriptedProvider()
  const { consumption } = scripted.provider.runtime
  await admitCall(scripted, 'a')
  settleCall(scripted, 'a')
  const handle = await liveHandle(scripted, 'a')
  const begin = async (label: string): Promise<ReadId> => {
    const started = must(
      await consumption.beginRead({
        ...access('a'),
        operation: operation(label),
        result: version('a'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')
    return started.read
  }
  return { scripted, handle, first: await begin('read-1'), second: await begin('read-2') }
}

type Probe = readonly [action: ScriptedAction, isDenied: () => Promise<boolean>]

/** Revokes one action, then asks every operation: exactly the operations of that action are denied. */
async function deniesOnly(revoked: ScriptedAction) {
  const { scripted, handle, first, second } = await settledCallWithTwoReads()
  const { calls, consumption, instances } = scripted.provider.runtime
  scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: [revoked] })
  const probes: Record<string, Probe> = {
    admit: ['admit', async () => deniedAs(await calls.admit(admission('a')), 'admit')],
    inspect: [
      'inspect',
      async () =>
        deniedAs(
          await calls.inspect({ ...access('a'), admission: operation('admit-a') }),
          'inspect',
        ),
    ],
    dispatches: [
      'dispatches',
      async () => deniedAs(await calls.dispatches(access('a')), 'dispatches'),
    ],
    cancel: [
      'cancel',
      async () =>
        deniedAs(await calls.cancel({ ...access('a'), operation: operation('c') }), 'cancel'),
    ],
    connect: ['connect', async () => deniedAs(await instances.connect(access('a')), 'connect')],
    observe: [
      'observe',
      async () => {
        const watcher = watch(handle)
        const opening = await watcher.next()
        watcher.close()
        return endedAs({ ok: opening }, 'denied')
      },
    ],
    beginRead: [
      'read',
      async () =>
        deniedAs(
          await consumption.beginRead({
            ...access('a'),
            operation: operation('read-3'),
            result: version('a'),
          }),
          'read',
        ),
    ],
    readNext: [
      'read',
      async () =>
        endedAs(await consumption.readNext({ ...access('a'), read: first, after: '2' }), 'denied'),
    ],
    closeRead: [
      'read',
      async () => endedAs(await consumption.closeRead({ ...access('a'), read: second }), 'denied'),
    ],
    acknowledge: [
      'acknowledge',
      async () => deniedAs(await consumption.acknowledge(ackInput('a')), 'acknowledge'),
    ],
    query: [
      'query',
      async () =>
        deniedAs(
          await scripted.controller.queryCommit({
            ...access('a'),
            operation: operation('admit-a'),
          }),
          'query',
        ),
    ],
  }
  const denied: string[] = []
  for (const [name, [, isDenied]] of Object.entries(probes)) if (await isDenied()) denied.push(name)
  const expected = Object.entries(probes)
    .filter(([, [action]]) => action === revoked)
    .map(([name]) => name)
  expect(denied).toEqual(expected)
}

describe('revoking one action of a principal', () => {
  it('denies admit and nothing else', () => deniesOnly('admit'))
  it('denies inspect and nothing else', () => deniesOnly('inspect'))
  it('denies dispatches and nothing else', () => deniesOnly('dispatches'))
  it('denies cancel and nothing else', () => deniesOnly('cancel'))
  it('denies connect and nothing else', () => deniesOnly('connect'))
  it('denies observe and nothing else', () => deniesOnly('observe'))
  it('denies read and nothing else', () => deniesOnly('read'))
  it('denies acknowledge and nothing else', () => deniesOnly('acknowledge'))
  it('denies query and nothing else', () => deniesOnly('query'))
})

/** Every operation on a call that the tenant does not own is denied, for the tenant given. */
async function deniedOnEveryOperation(tenant: TenantId) {
  const { scripted, handle, first } = await settledCallWithTwoReads()
  const { calls, consumption, instances } = scripted.provider.runtime
  const who = { ...access('a'), tenant }
  const denied = [
    deniedAs(await calls.dispatches(who), 'dispatches'),
    deniedAs(await calls.cancel({ ...who, operation: operation('c') }), 'cancel'),
    deniedAs(await instances.connect(who), 'connect'),
    deniedAs(
      await consumption.beginRead({ ...who, operation: operation('r'), result: version('a') }),
      'read',
    ),
    deniedAs(await consumption.readNext({ ...who, read: first, after: '2' }), 'read'),
    deniedAs(await consumption.closeRead({ ...who, read: first }), 'read'),
    deniedAs(await consumption.acknowledge({ ...ackInput('a'), tenant }), 'acknowledge'),
    endedAs({ ok: await watch(handle, alice, tenant).next() }, 'denied'),
  ]
  expect(denied).toEqual(denied.map(() => true))
}

describe('an input that names no call the principal may use', () => {
  it('is denied on every operation for a tenant that is not a legal identity', () =>
    deniedOnEveryOperation({ ...tenantA }))

  it('is denied on every operation for another tenant', () => deniedOnEveryOperation(tenantB))

  it('is denied on every operation for a call the provider never accepted', async () => {
    const { scripted, first } = await settledCallWithTwoReads()
    const { calls, consumption, instances } = scripted.provider.runtime
    const who = access('missing')
    expect([
      deniedAs(await calls.dispatches(who), 'dispatches'),
      deniedAs(await calls.cancel({ ...who, operation: operation('c') }), 'cancel'),
      deniedAs(await instances.connect(who), 'connect'),
      deniedAs(
        await consumption.beginRead({ ...who, operation: operation('r'), result: version('a') }),
        'read',
      ),
      deniedAs(await consumption.readNext({ ...who, read: first, after: '2' }), 'read'),
      deniedAs(await consumption.closeRead({ ...who, read: first }), 'read'),
      deniedAs(
        await consumption.acknowledge({ ...ackInput('a'), call: call('missing') }),
        'acknowledge',
      ),
    ]).toEqual(Array.from({ length: 7 }, () => true))
    expect(must(await calls.inspect({ ...who, admission: operation('admit-a') }))).toEqual({
      kind: 'not-accepted',
      operation: operation('admit-a'),
    })
  })

  it('is denied for the query and the admission of a tenant that is not a legal identity', async () => {
    const scripted = scriptedProvider()
    const forged = { ...tenantA }
    expect(
      deniedAs(
        await scripted.controller.queryCommit({
          ...access('a'),
          tenant: forged,
          operation: operation('admit-a'),
        }),
        'query',
      ),
    ).toBe(true)
    expect(
      deniedAs(
        await scripted.provider.runtime.calls.admit(admission('a', { tenant: forged })),
        'admit',
      ),
    ).toBe(true)
  })

  it('is denied for a principal whose access was revoked before the call existed, while another principal may admit it', async () => {
    const scripted = scriptedProvider()
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: 'all' })
    const { calls } = scripted.provider.runtime
    expect(deniedAs(await calls.admit(admission('a')), 'admit')).toBe(true)
    expect(
      must(await calls.admit(admission('a', { principal: { name: 'carol' } }))).recovered,
    ).toBe(false)
  })
})
