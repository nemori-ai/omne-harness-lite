import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { judgeContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeResultVersion,
  decodeRevision,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type ModelStreamSnapshot,
  type ModelStreamObservation,
} from '@omne-harness/model-contract'
import {
  decodeStreamId,
  encodeStreamRef,
  type StreamRef,
  type StreamCallCodec,
} from '@omne-harness/stream-arrival'
import {
  createScriptedStreamObservation,
  createScriptedStreamReferences,
} from '@omne-harness/model-contract/testing'
import { checkModelStreamConformance } from '../src/conformance/conformance-stream.ts'
import type { ModelStreamConformanceSubject } from '../src/conformance/conformance-stream-types.ts'

function must<T, F>(value: Outcome<T, F>): T {
  if ('failure' in value) throw new Error('invalid fixture')
  return value.ok
}
function tenant(account: string) {
  const result = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${'0'.repeat(26)}`,
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!result.ok) throw new Error('invalid tenant')
  return result.value
}
type Principal = Readonly<{ name: string }>
type Subject = ModelStreamConformanceSubject<Principal>
type Fault =
  | 'none'
  | 'state-only'
  | 'source-null'
  | 'queued-access'
  | 'old-ref'
  | 'lost-commit'
  | 'eof'

function subject(fault: Fault = 'none'): Subject {
  const access = { tenant: tenant('0'), principal: { name: 'viewer' } }
  const otherAccess = { tenant: tenant('1'), principal: access.principal }
  const call = must(decodeModelCallId('mcall_suite'))
  const dispatch = must(decodeDispatchId('mdisp_suite'))
  const reference = must(
    encodeModelInvocationRef({
      tenant: access.tenant,
      call,
      admission: must(decodeModelOperationId('mop_suite')),
    }),
  )
  const codec: StreamCallCodec = {
    producer: 'model',
    resolve(input) {
      const result = resolveModelInvocationRef(input.text, input.tenant)
      return 'failure' in result
        ? { failure: { kind: result.failure.kind } }
        : { ok: must(encodeModelInvocationRef(result.ok)) }
    },
  }
  function ref(id: string): StreamRef {
    return must(
      encodeStreamRef(
        {
          tenant: access.tenant,
          producer: 'model',
          call: reference,
          stream: must(decodeStreamId(id)),
        },
        codec,
      ),
    )
  }
  const original = ref('str_suite')
  function snapshot(
    revision: string,
    outputCursor: string,
    text: string,
    stream = original,
  ): ModelStreamSnapshot {
    return {
      ref: stream,
      dispatch,
      value: {
        call,
        cursor: must(decodeOutputCursor(outputCursor)),
        state: {
          call,
          revision: must(decodeRevision(revision)),
          consumer: { owner: 'suite', work: 'work', position: 'answer', purpose: 'reply' },
          control: { kind: 'none' },
          custody: { kind: 'producer' },
          phase: 'running',
          dispatch,
          firstContent: 'observed',
        },
        blocks: [{ kind: 'growing', index: '0', mode: 'append', content: 'text', value: text }],
      },
    }
  }
  const initial = snapshot('1', '1', 'a')
  const next = snapshot('2', '2', 'ab')
  const stateOnly = snapshot('2', '1', 'a')
  const successor = snapshot('3', '1', 'c', ref('str_successor'))
  const settled: ModelStreamSnapshot = {
    ...next,
    value: {
      ...next.value,
      state: {
        ...next.value.state,
        phase: 'settled',
        settlement: {
          version: must(decodeResultVersion('mrver_suite')),
          cursor: next.value.cursor,
          termination: { kind: 'completed', reason: 'stop' },
          source: { owner: 'model', record: 'saved', revision: '1', digest: 'digest' },
        },
      },
    },
  }
  function block(text: string) {
    const result = judgeContentBlock({
      kind: 'text',
      id: 'b1',
      visibility: { toHuman: true, toModel: true },
      text,
    })
    if ('rejected' in result) throw new Error('invalid block fixture')
    return result.ok
  }
  const sealed: ModelStreamSnapshot = {
    ...initial,
    value: { ...initial.value, blocks: [{ kind: 'sealed', index: '0', block: block('a') }] },
  }
  const changedSealed: ModelStreamSnapshot = {
    ...next,
    value: { ...next.value, blocks: [{ kind: 'sealed', index: '0', block: block('b') }] },
  }
  const references = createScriptedStreamReferences<Principal>()
  const source = createScriptedStreamObservation<Principal>({ capacity: 1 })
  let requestId = 0
  let boundaryCommit: ModelStreamSnapshot | undefined
  let loseBoundaryDelta = false
  let retired = false
  const releases: (() => void)[] = []
  const observation: ModelStreamObservation<Principal> = {
    observe(input) {
      const iterator = source.observation
        .observe({
          ...input,
          ref: fault === 'old-ref' && retired && input.ref === original ? successor.ref : input.ref,
        })
        [Symbol.asyncIterator]()
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              const step = iterator.next()
              if (boundaryCommit !== undefined) {
                const commit = boundaryCommit
                boundaryCommit = undefined
                source.advance({ tenant: access.tenant, snapshot: commit })
                loseBoundaryDelta = fault === 'lost-commit'
              }
              const result = await step
              if (
                result.done !== true &&
                result.value.kind === 'delta' &&
                ((fault === 'state-only' &&
                  result.value.value.outputCursor === result.value.value.from.outputCursor) ||
                  loseBoundaryDelta)
              ) {
                loseBoundaryDelta = false
                return iterator.next()
              }
              if (fault === 'eof' && result.done !== true && result.value.kind === 'ended')
                return { done: true, value: undefined } as const
              return result
            },
            return: () =>
              iterator.return?.() ?? Promise.resolve({ done: true, value: undefined } as const),
          }
        },
      }
    },
  }
  return {
    access,
    otherAccess,
    reference,
    wrongAdmission: must(
      encodeModelInvocationRef({
        tenant: access.tenant,
        call,
        admission: must(decodeModelOperationId('mop_wrong')),
      }),
    ),
    unknownReference: must(
      encodeModelInvocationRef({
        tenant: access.tenant,
        call: must(decodeModelCallId('mcall_unknown')),
        admission: must(decodeModelOperationId('mop_suite')),
      }),
    ),
    wrongProducer: must(
      encodeStreamRef(
        {
          tenant: access.tenant,
          producer: 'tool',
          call: 'tool-call',
          stream: must(decodeStreamId('str_tool')),
        },
        {
          producer: 'tool',
          resolve: ({ text }) =>
            typeof text === 'string' ? { ok: text } : { failure: { kind: 'malformed' } },
        },
      ),
    ),
    snapshots: { initial, next, stateOnly, successor, settled, sealed, changedSealed },
    observation,
    references: {
      async current(input) {
        requestId += 1
        const result = await references.references.current(input)
        return fault === 'source-null' &&
          'failure' in result &&
          result.failure.kind === 'unavailable'
          ? { ok: { state: initial.value.state, current: null } }
          : result
      },
    },
    controls: {
      confirm: selection =>
        references.confirmSelection({ tenant: access.tenant, reference, selection }),
      withdrawTarget: () => references.withdrawTarget({ tenant: access.tenant, reference }),
      publish: value => {
        source.publish({ tenant: access.tenant, snapshot: value })
      },
      advance: value => {
        source.advance({ tenant: access.tenant, snapshot: value })
      },
      retire: value => {
        retired = true
        source.end({ tenant: access.tenant, ref: value, reason: 'stale-stream' })
      },
      closeSource: value =>
        source.end({ tenant: access.tenant, ref: value, reason: 'source-closed' }),
      setAccess(who, decision) {
        references.setAccess(who, decision)
        if (
          fault !== 'queued-access' ||
          decision !== 'deny' ||
          source.openObservations(original, access.tenant) === 0
        )
          source.setAccess(who, decision)
      },
      setSource: value => references.setSource(value),
      holdCurrent() {
        const id = requestId + 1
        references.holdResponse(id)
        let held = true
        const release = () => {
          if (held) {
            held = false
            references.releaseResponse(id)
          }
        }
        releases.push(release)
        return { reached: references.reached(id), release }
      },
      overflow() {
        source.advance({ tenant: access.tenant, snapshot: next })
        source.advance({ tenant: access.tenant, snapshot: snapshot('3', '3', 'abc') })
      },
      commitOnObserve(value) {
        boundaryCommit = value
      },
    },
    dispose() {
      for (const release of releases) release()
    },
  }
}

describe('Model stream conformance', () => {
  it('passes every obligation on the scripted references and observation', async () => {
    const report = await checkModelStreamConformance({ subject, waitMs: 300 })
    expect(report.results.filter(result => result.status !== 'pass')).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.results).toHaveLength(23)
    expect(new Set(report.results.map(result => result.obligation)).size).toBe(23)
  })
  it.each([
    ['state-only', 'state-only-cursor'],
    ['source-null', 'current-source-failure'],
    ['queued-access', 'queued-revocation'],
    ['old-ref', 'retired-reference'],
    ['lost-commit', 'snapshot-registration'],
    ['eof', 'explicit-terminal'],
  ] as const)('detects %s independently', async (fault, obligation) => {
    const report = await checkModelStreamConformance({ subject: () => subject(fault), waitMs: 50 })
    expect(report.ok).toBe(false)
    expect(report.results).toContainEqual(expect.objectContaining({ obligation, status: 'fail' }))
    for (const unaffected of ['current-confirmation', 'snapshot-delta'])
      expect(report.results).toContainEqual({ obligation: unaffected, status: 'pass', detail: '' })
  })
  it('fails safely when a required control throws and releases every subject', async () => {
    let created = 0
    let disposed = 0
    const report = await checkModelStreamConformance({
      subject() {
        created += 1
        const value = subject()
        return {
          ...value,
          controls: {
            ...value.controls,
            publish() {
              throw new Error('secret-payload')
            },
          },
          dispose() {
            disposed += 1
            value.dispose()
          },
        }
      },
      waitMs: 50,
    })
    expect(report.ok).toBe(false)
    expect(JSON.stringify(report)).not.toContain('secret-payload')
    expect(disposed).toBe(created)
  })
  it('reports missing controls as failures instead of skipping their obligations', async () => {
    const report = await checkModelStreamConformance({
      subject() {
        const value = subject()
        Reflect.deleteProperty(value.controls, 'holdCurrent')
        return value
      },
      waitMs: 50,
    })
    expect(report.ok).toBe(false)
    expect(report.results.filter(result => result.obligation.startsWith('current-wait-'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'fail' })]),
    )
    expect(
      report.results.some(result => result.status !== 'pass' && result.status !== 'fail'),
    ).toBe(false)
  })
  it('bounds a stuck control and still disposes its subject', async () => {
    let created = 0
    let disposed = 0
    const report = await checkModelStreamConformance({
      subject() {
        created += 1
        const value = subject()
        return {
          ...value,
          controls: { ...value.controls, publish: () => new Promise<void>(() => {}) },
          dispose() {
            disposed += 1
            value.dispose()
          },
        }
      },
      waitMs: 10,
    })
    expect(report.ok).toBe(false)
    expect(report.results).toContainEqual({
      obligation: 'snapshot-delta',
      status: 'fail',
      detail: 'The operation exceeded waitMs.',
    })
    expect(disposed).toBe(created)
  })
  it('treats cleanup failure as failure without exposing its exception', async () => {
    const report = await checkModelStreamConformance({
      subject() {
        const value = subject()
        return {
          ...value,
          dispose() {
            value.dispose()
            throw new Error('secret-dispose')
          },
        }
      },
      waitMs: 50,
    })
    expect(report.results.every(result => result.status === 'fail')).toBe(true)
    expect(JSON.stringify(report)).not.toContain('secret-dispose')
  })

  it('fails factory timeouts and disposes subjects that arrive after the report', async () => {
    const factories: PromiseWithResolvers<Subject>[] = []
    let disposed = 0
    const report = await checkModelStreamConformance({
      subject() {
        const pending = Promise.withResolvers<Subject>()
        factories.push(pending)
        return pending.promise
      },
      waitMs: 5,
    })
    expect(report.results.every(result => result.status === 'fail')).toBe(true)
    for (const pending of factories) {
      const value = subject()
      pending.resolve({
        ...value,
        dispose() {
          disposed += 1
          value.dispose()
        },
      })
    }
    await Promise.all(factories.map(pending => pending.promise))
    expect(disposed).toBe(factories.length)
  })

  it.each([0, -1, Infinity, NaN])(
    'rejects an unusable wait bound %s before creating a subject',
    async waitMs => {
      let created = false
      await expect(
        checkModelStreamConformance({
          subject() {
            created = true
            return subject()
          },
          waitMs,
        }),
      ).rejects.toThrow('waitMs must be positive and finite')
      expect(created).toBe(false)
    },
  )
})
