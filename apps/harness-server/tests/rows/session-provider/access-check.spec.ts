// The access check of the `session-provider` contract double: each method asks the injected
// `sessionAccessCheck` first, passes `denied` and `unavailable` on as the face failure, and
// changes no state when the check does not allow.
import type { SessionAccessRequest } from '@omne-harness/session-contract'
import {
  creation,
  operationId,
  ordinaryInput,
  sessionId,
  type SessionAccessScript,
} from '@omne-harness/session-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { TENANT_A, loadProviderTree, sameTenantPolicy, type ProviderTree } from './support.ts'

let tree: ProviderTree | undefined
afterEach(async () => {
  await tree?.dispose()
  tree = undefined
})

type Mode = 'allow' | Extract<SessionAccessScript, { kind: 'denied' | 'unavailable' | 'throw' }>

/** A policy whose answer for a chosen operation the test switches during the run. */
function switchable() {
  const state: { mode: Mode; only: string | undefined } = { mode: 'allow', only: undefined }
  const policy = (request: SessionAccessRequest<unknown>): SessionAccessScript => {
    if (state.mode === 'allow' || (state.only !== undefined && state.only !== request.operation))
      return sameTenantPolicy(request)
    return state.mode
  }
  return { state, policy }
}

const SESSION = sessionId('sess-1')

async function setup() {
  const control = switchable()
  tree = await loadProviderTree({ policy: control.policy })
  const principal = tree.principalFor(TENANT_A)
  await tree.intake.management.create({
    principal,
    tenant: TENANT_A,
    session: SESSION,
    operation: operationId('create-1'),
    creation: creation(),
  })
  return { t: tree, control, principal }
}

describe('session-provider: access check', () => {
  it('asks the check once per method, for the operation that the method is', async () => {
    const control = switchable()
    tree = await loadProviderTree({ policy: control.policy })
    const t = tree
    const principal = t.principalFor(TENANT_A)
    const access = { principal, tenant: TENANT_A, session: SESSION }
    await t.intake.management.create({
      ...access,
      operation: operationId('create-1'),
      creation: creation(),
    })
    await t.intake.work.accept({
      ...access,
      operation: operationId('accept-1'),
      value: ordinaryInput('input-1', 'hello'),
    })
    await t.intake.work.accept({
      ...access,
      operation: operationId('accept-2'),
      value: ordinaryInput('input-2', 'again'),
    })
    await t.intake.work.queryOperation({ ...access, operation: operationId('accept-1') })
    await t.intake.work.cancelRun({
      ...access,
      operation: operationId('cancel-1'),
      run: 'run-1' as never,
      urgency: 'graceful',
    })
    await t.intake.work.stopCall({
      ...access,
      operation: operationId('stop-1'),
      producer: { kind: 'model', call: 'call-1' },
    })
    const page = await t.reader.history.begin({
      ...access,
      kinds: ['message.user'],
      from: null,
      direction: 'forward',
      pageBytes: 1,
    })
    if (!('ok' in page) || page.ok.next === null) throw new Error('expected a first page')
    await t.reader.history.next({ ...access, cursor: page.ok.next })
    expect(t.check.controls.asked().map(request => request.operation)).toEqual([
      'create',
      'accept',
      'accept',
      'queryOperation',
      'cancelRun',
      'stopCall',
      'history.begin',
      'history.next',
    ])
  })

  for (const [name, answer] of [
    ['denied', { kind: 'denied' }],
    ['unavailable', { kind: 'unavailable', diagnostic: 'the check cannot answer' }],
  ] as const) {
    it(`passes ${name} of the check on as the face failure and leaves the state unchanged`, async () => {
      const { t, control, principal } = await setup()
      control.state.mode = answer
      const acceptInput = {
        principal,
        tenant: TENANT_A,
        session: SESSION,
        operation: operationId('accept-1'),
        value: ordinaryInput('input-1', 'hello'),
      }
      const refused = await t.intake.work.accept(acceptInput)
      expect(refused).toEqual(
        name === 'denied'
          ? { failure: { kind: 'denied', action: 'work.accept' } }
          : {
              failure: {
                kind: 'unavailable',
                owner: 'sessionAccessCheck',
                diagnostic: 'the check cannot answer',
              },
            },
      )
      control.state.mode = 'allow'
      // Nothing was written: the input is not in the history and the operation is still new.
      const page = await t.reader.history.begin({
        principal,
        tenant: TENANT_A,
        session: SESSION,
        kinds: ['message.user'],
        from: null,
        direction: 'forward',
        pageBytes: 4096,
      })
      expect('ok' in page && page.ok.entries).toEqual([])
      const accepted = await t.intake.work.accept(acceptInput)
      expect('ok' in accepted && accepted.ok.recovered).toBe(false)
    })
  }

  it('does not answer a stored result when the check refuses the replay of a known operation', async () => {
    const { t, control, principal } = await setup()
    const accept = {
      principal,
      tenant: TENANT_A,
      session: SESSION,
      operation: operationId('accept-1'),
      value: ordinaryInput('input-1', 'hello'),
    }
    await t.intake.work.accept(accept)
    control.state.mode = { kind: 'denied' }
    expect(await t.intake.work.accept(accept)).toEqual({
      failure: { kind: 'denied', action: 'work.accept' },
    })
    expect(
      await t.intake.work.queryOperation({
        principal,
        tenant: TENANT_A,
        session: SESSION,
        operation: operationId('accept-1'),
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'work.queryOperation' } })
  })

  it('turns a check that throws into unavailable without echoing the error text', async () => {
    const { t, control, principal } = await setup()
    control.state.mode = { kind: 'throw', error: new Error('check exploded: SECRET-MARKER') }
    const result = await t.reader.history.begin({
      principal,
      tenant: TENANT_A,
      session: SESSION,
      kinds: ['message.user'],
      from: null,
      direction: 'forward',
      pageBytes: 4096,
    })
    expect(result).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(JSON.stringify(result)).not.toContain('SECRET-MARKER')
  })

  it('reports each arrival with the verdict of the check and the class of the principal only', async () => {
    const { t, control, principal } = await setup()
    control.state.mode = { kind: 'denied' }
    control.state.only = 'accept'
    await t.intake.work.accept({
      principal,
      tenant: TENANT_A,
      session: SESSION,
      operation: operationId('accept-1'),
      value: ordinaryInput('input-1', 'hello'),
    })
    control.state.mode = 'allow'
    await t.intake.work.accept({
      principal,
      tenant: TENANT_A,
      session: SESSION,
      operation: operationId('accept-2'),
      value: ordinaryInput('input-2', 'hello'),
    })
    const accepts = t.arrivals.filter(arrival => arrival.method === 'work.accept')
    expect(accepts).toEqual([
      {
        method: 'work.accept',
        principalKind: 'acting-for-tenant',
        actorComponent: 'server-entry',
        access: 'denied',
        outcome: 'denied',
      },
      {
        method: 'work.accept',
        principalKind: 'acting-for-tenant',
        actorComponent: 'server-entry',
        access: 'allowed',
        outcome: 'ok',
      },
    ])
  })

  it('classes a system principal by its component, and any other shape as unrecognized', async () => {
    const { t } = await setup()
    const access = { tenant: TENANT_A, session: SESSION }
    const read = (principal: unknown) =>
      t.reader.history.next({ ...access, principal, cursor: 'any' } as never)
    await read(t.systemFor('some-component'))
    await read({ kind: 'acting-for-tenant', actor: { component: 12 } })
    expect(t.arrivals.filter(arrival => arrival.method === 'history.next')).toEqual([
      expect.objectContaining({ principalKind: 'system', actorComponent: 'some-component' }),
      expect.objectContaining({ principalKind: 'unrecognized', actorComponent: null }),
    ])
  })
})
