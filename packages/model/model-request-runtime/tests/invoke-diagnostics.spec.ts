import { describe, expect, it } from 'vitest'
import { invokeModel } from '../src/invoke.ts'
import type { DiagnosticEvent } from '../src/diagnostics-types.ts'
import type { PublicDiagnosticAssociation, TransportExecutionDiagnostics } from '../src/types.ts'
import { adapter, policy, request } from './invoke-policy-fixture.ts'

describe('per-invocation engineering diagnostics', () => {
  it('passes one call-local emitter to send and read without mixing interleaved calls', async () => {
    const seen: { call: string; event: DiagnosticEvent }[] = []
    const associations: (PublicDiagnosticAssociation | undefined)[] = []
    const ports: {
      send: TransportExecutionDiagnostics | undefined
      read: TransportExecutionDiagnostics | undefined
    }[] = []
    const handles = ['first', 'second'].map(call => {
      const base = adapter()
      const handed: {
        send: TransportExecutionDiagnostics | undefined
        read: TransportExecutionDiagnostics | undefined
      } = { send: undefined, read: undefined }
      ports.push(handed)
      return invokeModel({
        ...request(),
        transport: {
          ...base.transport,
          async send(planned, credential, signal, diagnostics) {
            handed.send = diagnostics
            diagnostics?.record({
              stage: 'send',
              outcome: 'accepted',
              facts: { kind: 'transport', httpStatus: 503 },
            })
            return base.transport.send(planned, credential, signal)
          },
          read(response, planned, signal, diagnostics) {
            handed.read = diagnostics
            return base.transport.read(response, planned, signal)
          },
        },
        credential: 'key-not-503',
        signal: new AbortController().signal,
        policy: policy(),
        diagnosticAssociation: { executionId: call },
        diagnosticEmitterFactory(association) {
          associations.push(association)
          return {
            record(event) {
              seen.push({ call, event })
              return { recorded: { collectorId: 'collector', sequence: '1' } }
            },
            close() {},
          }
        },
      })
    })
    const outcomes = await Promise.all(handles.map(handle => handle.outcome))
    expect(outcomes.every(outcome => 'outcome' in outcome)).toBe(true)
    expect(associations).toEqual([{ executionId: 'first' }, { executionId: 'second' }])
    expect(ports.every(port => port.send === port.read && port.send !== undefined)).toBe(true)
    expect(ports[0]?.send).not.toBe(ports[1]?.send)
    expect(
      seen.filter(({ event }) => event.source === 'transport' && event.stage === 'send'),
    ).toEqual(
      ['first', 'second'].map(call => ({
        call,
        event: {
          source: 'transport',
          stage: 'send',
          outcome: 'accepted',
          facts: { kind: 'transport', httpStatus: 503 },
        },
      })),
    )
    expect(seen.filter(({ event }) => event.stage === 'first_content')).toHaveLength(2)
    expect(seen.filter(({ event }) => event.stage === 'reply_handoff')).toHaveLength(2)
  })

  it('omits credential-tainted free correlation rather than forging a parent reference', async () => {
    const seen: (PublicDiagnosticAssociation | undefined)[] = []
    const credential = 'key-sensitive-secret-123456'
    const run = (association: PublicDiagnosticAssociation) =>
      invokeModel({
        ...request(),
        transport: adapter().transport,
        credential,
        signal: new AbortController().signal,
        policy: policy(),
        diagnosticAssociation: association,
        diagnosticEmitterFactory(value) {
          seen.push(value)
          return { record: () => ({ dropped: 'closed' }), close: () => {} }
        },
      }).outcome
    await run({
      executionId: 'safe-execution',
      causedBy: { collectorId: `prefix-${credential}`, sequence: '7' },
    })
    await run({ executionId: credential })
    expect(seen).toEqual([{ executionId: 'safe-execution' }, undefined])
  })

  it('stops after the first async record contract violation and drains only its rejection', async () => {
    const failures: string[] = []
    let records = 0
    let closes = 0
    const handle = invokeModel({
      ...request(),
      transport: adapter().transport,
      credential: 'secret-value',
      signal: new AbortController().signal,
      policy: policy(event => failures.push(event.kind)),
      diagnosticEmitterFactory() {
        return {
          record() {
            records++
            return Promise.reject(new Error('sink failed')) as never
          },
          close() {
            closes++
          },
        }
      },
    })
    expect(await handle.outcome).toHaveProperty('outcome', 'complete')
    expect(records).toBe(1)
    expect(closes).toBe(1)
    expect(
      failures.filter(kind => kind === 'model_invocation.diagnostic_contract_violation'),
    ).toHaveLength(1)
  })

  it('drains a rejected factory and legacy report without changing the response', async () => {
    let factoryCalls = 0
    let reportCalls = 0
    const handle = invokeModel({
      ...request(),
      transport: adapter().transport,
      credential: 'secret-value',
      signal: new AbortController().signal,
      policy: policy(() => {
        reportCalls++
        return Promise.reject(new Error('report failed'))
      }),
      diagnosticEmitterFactory() {
        factoryCalls++
        return Promise.reject(new Error('factory failed')) as never
      },
    })
    expect(await handle.outcome).toHaveProperty('outcome', 'complete')
    expect(factoryCalls).toBe(1)
    expect(reportCalls).toBe(1)
  })

  it('observes one rejected close without retrying it or changing the response', async () => {
    const failures: string[] = []
    let closes = 0
    const handle = invokeModel({
      ...request(),
      transport: adapter().transport,
      credential: 'secret-value',
      signal: new AbortController().signal,
      policy: policy(event => failures.push(event.kind)),
      diagnosticEmitterFactory() {
        return {
          record: () => ({ dropped: 'closed' }),
          close() {
            closes++
            return Promise.reject(new Error('close failed')) as never
          },
        }
      },
    })
    expect(await handle.outcome).toHaveProperty('outcome', 'complete')
    expect(closes).toBe(1)
    expect(
      failures.filter(kind => kind === 'model_invocation.diagnostic_contract_violation'),
    ).toHaveLength(1)
  })

  it('records the actual truncated response outcome', async () => {
    const seen: DiagnosticEvent[] = []
    const handle = invokeModel({
      ...request(),
      transport: adapter({ end: { ended: 'max_tokens' } }).transport,
      credential: 'secret-value',
      signal: new AbortController().signal,
      policy: policy(),
      diagnosticEmitterFactory() {
        return {
          record(event) {
            seen.push(event)
            return { dropped: 'closed' }
          },
          close() {},
        }
      },
    })
    expect(await handle.outcome).toHaveProperty('outcome', 'truncated')
    expect(seen).toContainEqual({
      source: 'invocation',
      stage: 'reply_handoff',
      outcome: 'completed',
      facts: expect.objectContaining({ kind: 'progress', responseOutcome: 'truncated' }),
    })
  })
})
