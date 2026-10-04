import { describe, expect, it } from 'vitest'
import { isOk, parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type {
  ModelObserverEndpoint,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime'
import {
  createDemoObserverAccess,
  createDemoObserverEndpoint,
} from '../src/model-observer-endpoint.ts'

function id<B extends string>(value: string, brand: B) {
  const parsed = parseOpaqueIdentifier(value, brand)
  if (!isOk(parsed)) throw new Error('invalid fixture identifier')
  return parsed.ok
}
function tenant(organization: string) {
  const parsed = parseTenantId({ organization, account: 'account-observer' })
  if (!isOk(parsed)) throw new Error('invalid fixture tenant')
  return parsed.ok
}
const session = id('session-observer', 'SessionRef')
const callId = id('call-observer', 'ModelCallId')
const actualTenant = tenant('organization-a')
const request = (endpoint: ModelObserverEndpoint) => ({
  session,
  endpoint,
  observer_max_buffered_events: 2,
  observer_max_buffered_bytes: 256,
})

describe('demo observer endpoint ownership', () => {
  it('binds a session-issued endpoint to the first runtime call and dispatch target', async () => {
    const store = createDemoObserverAccess()
    const endpoint = createDemoObserverEndpoint(async () => {})
    const grant = store.grant({ endpoint, session, tenant: actualTenant, current: () => true })
    const authorized = store.access.authorize({
      request: request(endpoint),
      session,
      tenant: actualTenant,
      callId,
    })
    if (!('observer' in authorized)) throw new Error('expected authorization')
    expect(authorized.observer.check({ kind: 'model_call', callId, dispatch: 1 })).toEqual({
      valid: true,
    })
    expect(
      store.access.authorize({
        request: request(endpoint),
        session,
        tenant: actualTenant,
        callId: id('call-other', 'ModelCallId'),
      }),
    ).toEqual({ invalidInput: { reason: 'observer_scope_mismatch' } })
    expect(authorized.observer.check({ kind: 'model_call', callId, dispatch: 2 })).toEqual({
      invalidInput: { reason: 'observer_scope_mismatch' },
    })
    expect(await grant.revoke()).toEqual({ released: true })
  })

  it('authorizes only the endpoint instance granted by an authenticated session', async () => {
    const store = createDemoObserverAccess()
    const endpoint = createDemoObserverEndpoint(async () => {})
    const fake = createDemoObserverEndpoint(async () => {})
    const grant = store.grant({
      endpoint,
      session,
      tenant: actualTenant,
      callId,
      current: () => true,
    })
    expect(
      store.access.authorize({ request: request(fake), session, tenant: actualTenant, callId }),
    ).toEqual({ unavailable: true })
    expect(
      store.access.authorize({
        request: request(endpoint),
        session: id('session-other', 'SessionRef'),
        tenant: actualTenant,
        callId,
      }),
    ).toEqual({ invalidInput: { reason: 'observer_scope_mismatch' } })
    expect(
      store.access.authorize({
        request: request(endpoint),
        session,
        tenant: tenant('organization-b'),
        callId,
      }),
    ).toEqual({ invalidInput: { reason: 'observer_scope_mismatch' } })
    const authorized = store.access.authorize({
      request: request(endpoint),
      session,
      tenant: actualTenant,
      callId,
    })
    expect('observer' in authorized).toBe(true)
    if (!('observer' in authorized)) throw new Error('expected authorization')
    expect(
      authorized.observer.open({
        kind: 'model_call',
        callId: id('call-other', 'ModelCallId'),
        dispatch: 1,
      }),
    ).toEqual({ invalidInput: { reason: 'observer_scope_mismatch' } })
    const first = authorized.observer.open({ kind: 'model_call', callId, dispatch: 1 })
    const second = authorized.observer.open({ kind: 'model_call', callId, dispatch: 2 })
    expect('receiver' in first).toBe(true)
    expect(second).toEqual({ invalidInput: { reason: 'observer_scope_mismatch' } })
    if ('receiver' in first) first.receiver.stop()
    await Promise.resolve()
    expect(await grant.revoke()).toEqual({ released: true })
    expect(authorized.observer.check({ kind: 'model_call', callId, dispatch: 2 })).toEqual({
      unavailable: true,
    })
  })

  it('retains a receiver until its actual asynchronous sink has stopped', async () => {
    const store = createDemoObserverAccess()
    let finish: (() => void) | undefined
    const endpoint = createDemoObserverEndpoint(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    const grant = store.grant({
      endpoint,
      session,
      tenant: actualTenant,
      callId,
      current: () => true,
    })
    const result = store.access.authorize({
      request: request(endpoint),
      session,
      tenant: actualTenant,
      callId,
    })
    if (!('observer' in result)) throw new Error('expected authorization')
    const opened = result.observer.open({ kind: 'model_call', callId, dispatch: 1 })
    if (!('receiver' in opened)) throw new Error('expected receiver')
    const task = opened.receiver.receive('opaque-delivery', new AbortController().signal)
    await Promise.resolve()
    expect(await grant.revoke()).toEqual({ unavailable: true })
    expect(await grant.revoke()).toEqual({ unavailable: true })
    finish?.()
    await task.stopped
    await Promise.resolve()
    expect(await grant.revoke()).toEqual({ released: true })
  })

  it('rechecks ownership after endpoint construction reentrantly revokes it', async () => {
    const store = createDemoObserverAccess()
    const underlying = createDemoObserverEndpoint(async () => {})
    let revoke: () => Promise<RuntimeCloseResult> = async () => ({ unavailable: true })
    const endpoint: ModelObserverEndpoint = {
      open(scope) {
        void revoke()
        return underlying.open(scope)
      },
    }
    const granted = store.grant({
      endpoint,
      session,
      tenant: actualTenant,
      callId,
      current: () => true,
    })
    revoke = granted.revoke
    const result = store.access.authorize({
      request: request(endpoint),
      session,
      tenant: actualTenant,
      callId,
    })
    if (!('observer' in result)) throw new Error('expected authorization')
    expect(result.observer.open({ kind: 'model_call', callId, dispatch: 1 })).toEqual({
      unavailable: true,
    })
    await Promise.resolve()
    expect(await granted.revoke()).toEqual({ released: true })
  })
})
