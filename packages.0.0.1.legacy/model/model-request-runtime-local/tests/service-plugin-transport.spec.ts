// @module-tag slow
// Actual named Cordis provider and SQL selection. Controlled host ports test acquisition custody, not real actor authorization.
import { expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import {
  interpretCallHistory,
  type SessionRuntimeBinding,
  type TransportAdapter,
  type PlannedRequest,
  type RawResponse,
  type AdaptationLease,
} from '@omne-harness-lite/model-request-runtime'
import { MODEL_RUNTIME_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import { namedProviderFixture, unavailableInputs } from './named-provider-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'

it('returns the original acquired lease exactly once when projection decoration throws before any planning or sending', async () => {
  const selection = await selectionHost(true, true)
  let named: Awaited<ReturnType<typeof namedProviderFixture>> | undefined
  const release = vi.fn()
  const forbidden = vi.fn((): never => {
    throw new Error('adapter must not execute')
  })
  const adapter: TransportAdapter<PlannedRequest, RawResponse> = {
    plan: forbidden,
    send: forbidden,
    read: forbidden,
    projectOutput: forbidden,
  }
  const acquire = vi.fn((binding: AdaptationLease['binding']) => ({
    lease: {
      binding,
      transport: adapter,
      signal: new AbortController().signal,
      track: <T>(completion: Promise<T>) => completion,
      release,
    },
  }))
  const decorate = vi.fn((original: TransportAdapter<PlannedRequest, RawResponse>) => {
    expect(original).toBe(adapter)
    throw new Error('projection setup failed')
  })
  const registrations = new Set<() => Promise<unknown>>()
  try {
    await selection.publish()
    const selected = await selection.create()
    const binding: SessionRuntimeBinding = {
      log: selected.input.binding,
      sourceVersions: { fixture: 'named-decoration-failure' },
      selection: { ...selected.input, projection: async () => ({ known: [] }) },
      catalog: selection.catalog,
      currentEvaluationInputs: selection.reader,
      credentials: {
        async value() {
          return { scope: { layer: 'factory' }, value: new TextEncoder().encode('test-secret') }
        },
      },
      tools: {
        async lookup() {
          throw new Error('no tools requested')
        },
      },
    }
    named = await namedProviderFixture({
      construction: { decorateTransport: decorate },
      transport: { clearReuseScope() {}, acquire },
      capture: () => ({
        ...unavailableInputs(),
        sessions: { bind: async () => ({ binding }) },
        identities: {
          call: () => 'named-decorator-call',
          response: () => 'named-decorator-response',
          message: () => unwrap(parseOpaqueIdentifier('named-decorator-message', 'MessageId')),
        },
        history: {
          ...unavailableInputs().history,
          call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
        },
      }),
    })
    await named.binding.ready
    const service = named.ctx.get(MODEL_RUNTIME_SERVICE)
    if (!service) throw new Error('actual named service absent')
    expect(
      await service.selectModel({ session: selection.session, routeName: 'example/model-a' }),
    ).toEqual({ selected: 'example/model-a' })
    const effective = await service.effectiveModel({ session: selection.session })
    if (!('effectiveModel' in effective)) throw new Error('effective model absent')
    const result = await service.openCall({
      creationKey: unwrap(parseOpaqueIdentifier('named-decorator-create', 'CreationKey')),
      session: selection.session,
      target: effective.effectiveModel.routeName,
      basis: effective.effectiveModel,
      messages: [],
      tools: [],
      host: {
        signal: new AbortController().signal,
        stopping: () => false,
        register(close) {
          registrations.add(close)
          return {
            registration: {
              unregister() {
                if (!registrations.delete(close)) throw new Error('registration returned twice')
              },
            },
          }
        },
      },
    })
    expect(result).toEqual({ unavailable: true })
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(decorate).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
    expect(forbidden).not.toHaveBeenCalled()
    expect(registrations.size).toBe(0)
  } finally {
    await named?.close()
    await selection.close()
  }
  expect(release).toHaveBeenCalledTimes(1)
})
