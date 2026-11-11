// The local binding of a checkpointed author (P06, P07, P11): its initial segment runs on the start
// path with a context of `emit` and `signal` only; a suspended segment ends its stream at the Ask
// wait it published, with the request original beside it, and proves its checkpoint with the state.
// A resume runs the resume segment with the state and the committed decision that the ledger gives
// with the start, after its `continued` fact.
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest, createIndependentToolScope } from '@omne-harness/tool'
import type { ResponseRecord, ToolDecision, ToolStartRecord } from '@omne-harness/tool-contract'
import type { ToolExecutionScope, ToolStartAuthority } from '@omne-harness/tool-contract/provider'
import {
  defineFunctionTool,
  defineToolOperation,
  defineToolWaitContract,
  type AuthorSegment,
  type FactBatch,
  type ToolImplementationModule,
  type ToolLiveExecution,
  type ToolPrimitiveFailure,
  type ToolSegmentContext,
  type ToolValueSchema,
} from '@omne-harness/tool-contract/provider'
import {
  completedFinal,
  createMemoryToolStartAuthority,
  ordinaryReturnFixture,
} from '@omne-harness/tool-contract/testing'
import { createLocalToolBindings, type LocalToolBindingsInput } from '@omne-harness/tool-host-local'
import { localAuthorEvidence } from '../src/live-author-execution.ts'
import { authorAccess, authorAuthority, loadAuthor, settings, unbox } from './author-values.ts'
import { accessOf, fiberedRegistry, scriptedVerifier, tenantB } from './binding-values.ts'
import {
  adoption,
  callId,
  evidence,
  instanceId,
  operationId,
  request,
} from './coordinator-values.ts'

type Start = Extract<ToolStartRecord, { kind: 'start' }>
type Segment = Outcome<AuthorSegment<Uint8Array, unknown>, ToolPrimitiveFailure>
type Input = LocalToolBindingsInput<string, unknown, ContentBlock>

function schema(id: string): ToolValueSchema<unknown> {
  return {
    identity: { id, revision: '1', digest: `sha256:${id}` },
    ref: { id: id as never, load: () => Promise.reject(new Error('no schema is loaded')) },
    maxBytes: 1_024,
  }
}

const ask = unbox(
  defineToolWaitContract({
    kind: 'ask',
    adoption: adoption('ask-protocol'),
    request: schema('ask-request'),
    response: schema('ask-response'),
    expiry: 'forbidden',
  }),
)
const otherAsk = unbox(
  defineToolWaitContract({
    kind: 'ask',
    adoption: adoption('other-ask-protocol'),
    request: schema('other-request'),
    response: schema('other-response'),
    expiry: 'forbidden',
  }),
)
// A resource wait that carries the adoption of the Ask: declared, but not an Ask.
const resourceWait = unbox(
  defineToolWaitContract({
    kind: 'resource',
    adoption: adoption('ask-protocol'),
    request: schema('ask-request'),
    response: schema('ask-response'),
    expiry: 'forbidden',
  }),
)
const codec = adoption('state-codec')
const question = { kind: 'string', value: 'which file?' } as const

type Resumed = Readonly<{ checkpoint: Uint8Array; response: ToolDecision<unknown> }>

function segmentedModule(
  initial: (context: ToolSegmentContext) => Promise<Segment>,
  resume: (input: Resumed) => Promise<Segment>,
  /** The wait contracts the author declares; the one Ask by default. */
  waits: readonly unknown[] = [ask],
): ToolImplementationModule<unknown, ContentBlock> {
  return {
    executor: { ...adoption('executor'), owner: 'conformance' },
    createAuthor() {
      const definition = request().availability.definition
      if (definition.kind !== 'function') throw new Error('function fixture')
      const operation = defineToolOperation({
        parameters: { kind: 'declared', value: definition.parameters },
        returns: ordinaryReturnFixture(adoption('codec')),
        author: {
          kind: 'ordinary',
          parameters: { adoption: adoption('parameters'), parse: () => succeed({}) },
          waits: waits as never,
          executor: {
            checkpoint: {
              schema: { id: 'state', revision: '1', digest: 'sha256:state' },
              codec,
              maxBytes: 16,
            },
            initial: (_args, _environment, context) => initial(context),
            resume: input => resume(input),
          },
          codec: {
            adoption: adoption('codec'),
            encode: () => succeed(new Uint8Array()),
            decode: () => succeed({}),
          },
          output: { adoption: adoption('output'), check: ({ value }) => succeed(value) },
          renderer: { render: () => succeed('done') },
          program: { kind: 'none' },
        },
      })
      if ('failure' in operation) return operation
      return defineFunctionTool({
        operation: operation.ok,
        implementation: {
          description: 'A checkpointed test author',
          backgroundAllowed: false,
          declarations: definition.declarations,
        },
      })
    },
  }
}

const CLOSED = 'Nothing was answered: the question was closed.'

const suspended = (state = new Uint8Array([1, 2, 3]), wait = ask): Segment =>
  succeed({
    kind: 'suspended',
    state,
    closedResult: CLOSED,
    wait: { kind: 'ask', key: 'k', contract: wait, request: question },
  })

/** What the ledger gives a resume with its start: the kept state and the committed response. */
type Resumption = Readonly<{ state: Uint8Array; response: ResponseRecord }>

/** The base64 text of a state, as the binding gives it to the ledger. */
const text64 = (state: Uint8Array) => Buffer.from(state).toString('base64')

/** The key of the evidence the binding mints for a start of `c1`. */
const keyOf = (operation: string, call = 'c1') =>
  canonicalDigest([authorAccess.tenant, callId(call), operationId(operation)])

async function harness(
  initial: (context: ToolSegmentContext) => Promise<Segment>,
  options: Readonly<{
    resume?: (input: Resumed) => Promise<Segment>
    /** Replaces the result of closing the scope, for one close of the given kind. */
    close?: (kind: 'returned' | 'failed') => ReturnType<ToolExecutionScope['finish']> | undefined
    /** Wraps the emitter of the author's context. */
    emit?: (emit: ToolSegmentContext['emit']) => ToolSegmentContext['emit']
    /** The scope the binding asks for cannot be made. */
    scopeFails?: true
    /** The wait contracts the author declares. */
    waits?: readonly unknown[]
    /** Replaces the settlement of the call's end. */
    settle?: Input['settle']
    /** Attaches a capability to the scope of a first start. */
    capability?: Input['capability']
    /** Wraps the start authority the binding consumes the permit of. */
    consume?: (base: ToolStartAuthority<string>['consume']) => ToolStartAuthority<string>['consume']
  }> = {},
) {
  const resumed: Resumed[] = []
  const closes: string[] = []
  const loaded = unbox(
    await loadAuthor(
      segmentedModule(
        initial,
        input => {
          resumed.push(input)
          return (
            options.resume?.(input) ??
            Promise.resolve(succeed({ kind: 'completed', value: { resumed: true } }))
          )
        },
        options.waits,
      ),
    ),
  )
  const { registry, asFiber } = fiberedRegistry(scriptedVerifier([authorAuthority]))
  unbox(
    asFiber('author', () =>
      registry.register({ ...authorAccess, authority: authorAuthority, loaded }),
    ),
  )
  const fixed = request({
    availability: {
      kind: 'available',
      definition: loaded.definition,
      executor: loaded.executor,
      layer: loaded.key.layer,
    },
    settings,
  })
  const authority = createMemoryToolStartAuthority<string>()
  const settlements: Parameters<Input['settle']>[0][] = []
  const bindings = createLocalToolBindings({
    registry,
    catalog: { inspect: async () => succeed(fixed.availability) },
    authority: {
      ...authority,
      consume:
        options.consume?.(authority.consume.bind(authority)) ?? authority.consume.bind(authority),
    },
    ...(options.capability === undefined ? {} : { capability: options.capability }),
    scope: input => {
      if (options.scopeFails) throw new Error('no scope')
      const real = unbox(
        createIndependentToolScope({
          signal: input.execution.signal,
          limits: {
            authorBufferBytes: 10000,
            authorBufferItems: 100,
            authorWaitHistoryBytes: 10000,
            authorWaitHistoryItems: 100,
          },
          process: null,
          waits: null,
        }),
      )
      return {
        ...real,
        context: { ...real.context, emit: options.emit?.(real.context.emit) ?? real.context.emit },
        finish: async (kind: 'returned' | 'failed') => {
          closes.push(kind)
          return (await options.close?.(kind)) ?? real.finish(kind)
        },
      }
    },
    settle: async input => {
      settlements.push(input)
      return options.settle === undefined ? succeed(completedFinal()) : options.settle(input)
    },
  })
  const start = async (call = 'c1', operation = `start-${call}`) => {
    const record: Start = {
      kind: 'start',
      executor: loaded.executor,
      operation: operationId(operation),
      execution: {
        tenant: authorAccess.tenant,
        call: callId(call),
        instance: instanceId,
        generation: '1',
      },
    }
    const value = { ...authorAccess, call: callId(call), start: record, request: fixed }
    const binding = unbox(
      await bindings.resolve({ ...authorAccess, call: callId(call), request: fixed }),
    )
    const live = unbox(
      await binding.start({ ...value, permit: unbox(await authority.prepare(value)) }, {}),
    )
    return { binding, live, start: record }
  }
  /** A resume of `c1` from the checkpoint `checkpoint`, under `operation`, with what the ledger gives. */
  const resume = async (operation: string, checkpoint: string, given: Resumption) => {
    const call = 'c1'
    const record: Extract<ToolStartRecord, { kind: 'resume' }> = {
      kind: 'resume',
      executor: loaded.executor,
      operation: operationId(operation),
      checkpoint: evidence(checkpoint),
      execution: {
        tenant: authorAccess.tenant,
        call: callId(call),
        instance: instanceId,
        generation: '1',
      },
    }
    const value = { ...authorAccess, call: callId(call), start: record, request: fixed }
    const binding = unbox(
      await bindings.resolve({ ...authorAccess, call: callId(call), request: fixed }),
    )
    if (binding.kind !== 'checkpointed') throw new Error('expected a checkpointed binding')
    const permit = unbox(await authority.prepare(value))
    const input = { ...value, permit, state: text64(given.state), response: given.response }
    return { binding, record, answer: await binding.resume(input, {}) }
  }
  return {
    bindings,
    fixed,
    settlements,
    start,
    resume,
    resumed,
    closes,
    loaded,
    registry,
  }
}

/** The committed response of the wait `<start>/wait` to the decision `decision`. */
function responseOf(start: string, decision: ToolDecision<never>): ResponseRecord {
  return {
    tenant: authorAccess.tenant,
    call: callId('c1'),
    operation: operationId(`${start}/wait/accept`),
    adoption: ask.adoption,
    inputDigest: 'sha256:accept',
    start: {
      kind: 'start',
      executor: adoption('executor'),
      operation: operationId(start),
      execution: {
        tenant: authorAccess.tenant,
        call: callId('c1'),
        instance: instanceId,
        generation: '1',
      },
    },
    wait: `${start}/wait` as never,
    response: { kind: 'decision', value: decision, source: evidence('decision') },
  }
}

/** Every batch of the stream until it ends. */
async function drain(live: ToolLiveExecution): Promise<FactBatch[]> {
  const batches: FactBatch[] = []
  const signal = AbortSignal.timeout(2_000)
  for await (const batch of live.facts({ after: null, signal })) batches.push(batch)
  return batches
}

describe('the local binding of a checkpointed author', () => {
  it('runs the initial segment with emit and signal only, and ends the stream at its Ask wait with the request original', async () => {
    let given: readonly string[] = []
    const { start, settlements } = await harness(context => {
      given = Object.keys(context).sort()
      return Promise.resolve(suspended())
    })
    const { binding, live, start: record } = await start()
    expect(binding.kind).toBe('checkpointed')
    if (binding.kind === 'checkpointed') expect(binding.checkpointSchema).toEqual(codec)
    const batches = await drain(live)
    expect(given).toEqual(['emit', 'signal'])
    expect(settlements).toEqual([])
    // The request original is the JSON text of the author's request, not the tagged tree. The
    // evidence of the request and of the state binds the digest of each text: the ledger checks both.
    const original = '"which file?"'
    const key = keyOf(record.operation)
    expect(batches.flatMap(batch => batch.events.map(event => event.fact))).toEqual([
      {
        kind: 'wait',
        request: original,
        value: {
          kind: 'ask',
          wait: `${record.operation}/wait`,
          resume: localAuthorEvidence(`checkpoint-state/${key}`, text64(new Uint8Array([1, 2, 3]))),
          request: localAuthorEvidence(`wait-request/${key}`, original),
          schemas: {
            contract: ask.adoption,
            request: ask.request.identity,
            response: ask.response.identity,
            requestMaxBytes: 1_024,
            responseMaxBytes: 1_024,
            expiry: 'forbidden',
            source: expect.objectContaining({ owner: 'tool-host-local' }),
          },
        },
      },
    ])
  })

  it('proves the checkpoint of a suspended segment, and not of another start or schema', async () => {
    const { start } = await harness(() => Promise.resolve(suspended()))
    const { binding, live, start: record } = await start()
    await drain(live)
    if (binding.kind !== 'checkpointed') throw new Error('expected a checkpointed binding')
    const suspension = {
      tenant: authorAccess.tenant,
      call: callId('c1'),
      operation: operationId('start-c1/suspension'),
      adoption: record.executor,
      inputDigest: 'sha256:plan',
      start: record,
      schema: codec,
    }
    const state = text64(new Uint8Array([1, 2, 3]))
    expect(unbox(await binding.suspend(suspension))).toEqual({
      kind: 'suspended',
      state,
      checkpoint: {
        schema: codec,
        payload: localAuthorEvidence(`checkpoint-state/${keyOf(record.operation)}`, state),
        closedResult: CLOSED,
        start: record,
        consumedResponses: [],
        effectBoundary: expect.objectContaining({ owner: 'tool-host-local' }),
        exclusion: expect.objectContaining({ owner: 'tool-host-local' }),
      },
    })
    expect(unbox(await binding.inspectSuspension(suspension))).toMatchObject({ kind: 'suspended' })
    expect(
      unbox(await binding.suspend({ ...suspension, schema: adoption('other') })),
    ).toMatchObject({
      kind: 'rejected',
    })
    expect(
      unbox(
        await binding.suspend({
          ...suspension,
          start: { ...record, operation: operationId('never') },
        }),
      ),
    ).toMatchObject({ kind: 'unknown' })
  })

  it('names the wait by the start, so a later segment of the same call waits under a new identity', async () => {
    const { start } = await harness(() => Promise.resolve(suspended()))
    const first = await start('c1', 'start-c1')
    const second = await start('c1', 'resume-c1-1')
    const waits = await Promise.all(
      [first, second].map(async ({ live }) =>
        (await drain(live)).flatMap(batch =>
          batch.events.flatMap(event =>
            event.fact.kind === 'wait' ? [event.fact.value.wait] : [],
          ),
        ),
      ),
    )
    expect(waits).toEqual([['start-c1/wait'], ['resume-c1-1/wait']])
  })

  it('settles a segment that waits for an undeclared Ask, gives too large a state or request, or gives no result for a closed wait, as a failure of the author', async () => {
    const noClosedResult = 'the segment gives no result for a closed wait within the bound'
    const closing = (closedResult: unknown): Segment => {
      const segment = suspended()
      if ('failure' in segment) throw new Error('the suspended segment of the tests does not fail')
      return succeed({ ...segment.ok, closedResult } as typeof segment.ok)
    }
    // The Ask contract of the tests allows 1024 bytes for the JSON text of a request.
    const oversized: Segment = succeed({
      kind: 'suspended',
      state: new Uint8Array([1]),
      closedResult: CLOSED,
      wait: {
        kind: 'ask',
        key: 'k',
        contract: ask,
        request: { kind: 'string', value: 'x'.repeat(1_024) },
      },
    })
    const malformed: Segment = succeed({
      kind: 'suspended',
      state: new Uint8Array([1]),
      closedResult: CLOSED,
      wait: { kind: 'ask', key: 'k', contract: ask, request: { kind: 'text' } as never },
    })
    const cases = [
      [suspended(undefined, otherAsk), 'the segment waits for an Ask it did not declare'],
      [suspended(new Uint8Array(17)), 'the segment state exceeds the declared checkpoint size'],
      [oversized, 'the request of the segment wait exceeds the declared size'],
      [malformed, 'the request of the segment wait is no JSON value'],
      [closing(''), noClosedResult],
      [closing(undefined), noClosedResult],
      [closing('x'.repeat(1025)), noClosedResult],
    ] as const
    for (const [segment, reason] of cases) {
      const { start, settlements } = await harness(() => Promise.resolve(segment))
      const { live } = await start()
      const batches = await drain(live)
      expect(batches.flatMap(batch => batch.events).some(e => e.fact.kind === 'wait')).toBe(false)
      expect(settlements).toMatchObject([{ outcome: { kind: 'failed', reason } }])
    }
  })

  it('settles a completed segment like a live return', async () => {
    const { start, settlements } = await harness(() =>
      Promise.resolve(succeed({ kind: 'completed', value: { found: 'a.txt' } })),
    )
    const { live } = await start()
    const batches = await drain(live)
    expect(settlements).toMatchObject([
      { outcome: { kind: 'returned', value: { found: 'a.txt' } } },
    ])
    expect(batches.at(-1)?.events.at(-1)?.fact.kind).toBe('final')
  })

  it('runs the resume segment once with the given state and the committed decision, after its continued fact', async () => {
    const state = new Uint8Array([7, 8])
    const decision = { kind: 'declined' } as const
    const { resume, resumed, settlements } = await harness(() => Promise.resolve(suspended()))
    const given = { state, response: responseOf('start-c1', decision) }
    const first = await resume('start-c1/wait/resume', 'state/start-c1', given)
    const live = unbox(first.answer)
    const batches = await drain(live)
    expect(resumed).toEqual([{ checkpoint: state, response: decision }])
    expect(batches.flatMap(batch => batch.events.map(event => event.fact.kind))).toEqual([
      'continued',
      'final',
    ])
    expect(batches[0]?.events[0]?.fact).toEqual({
      kind: 'continued',
      wait: 'start-c1/wait',
      response: 'start-c1/wait/accept',
      timing: expect.objectContaining({ owner: 'tool-host-local' }),
    })
    expect(settlements).toMatchObject([
      { start: first.record, outcome: { kind: 'returned', value: { resumed: true } } },
    ])
    // A repeated resume of the same record answers the same execution and runs nothing again.
    const again = await resume('start-c1/wait/resume', 'state/start-c1', given)
    expect(unbox(again.answer)).toBe(live)
    expect(resumed).toHaveLength(1)
  })

  it('names the wait of a resume segment that suspends again by the resume, and its checkpoint names the consumed response', async () => {
    const { resume } = await harness(() => Promise.resolve(suspended()), {
      resume: () => Promise.resolve(suspended(new Uint8Array([9]))),
    })
    const { binding, record, answer } = await resume('start-c1/wait/resume', 'state/start-c1', {
      state: new Uint8Array([1]),
      response: responseOf('start-c1', { kind: 'no-answer' }),
    })
    const facts = (await drain(unbox(answer))).flatMap(batch => batch.events.map(e => e.fact))
    expect(facts.map(fact => fact.kind)).toEqual(['continued', 'wait'])
    expect(facts[1]).toMatchObject({
      kind: 'wait',
      value: {
        wait: 'start-c1/wait/resume/wait',
        resume: localAuthorEvidence(
          `checkpoint-state/${keyOf('start-c1/wait/resume')}`,
          text64(new Uint8Array([9])),
        ),
      },
    })
    const proof = unbox(
      await binding.suspend({
        tenant: authorAccess.tenant,
        call: callId('c1'),
        operation: operationId('start-c1/wait/resume/suspension'),
        adoption: record.executor,
        inputDigest: 'sha256:plan',
        start: record,
        schema: codec,
      }),
    )
    expect(proof).toMatchObject({
      kind: 'suspended',
      checkpoint: { start: record, consumedResponses: ['start-c1/wait/accept'] },
    })
  })

  it('runs no resume segment for a response that is no decision of this call, each part on its own', async () => {
    const decision = { kind: 'declined' } as const
    const good = responseOf('start-c1', decision)
    const bad = {
      'a response that is not a decision': {
        ...good,
        response: { kind: 'expired' },
      },
      'a response of another call': { ...good, call: callId('c2') },
      'a response of another tenant': { ...good, tenant: accessOf(tenantB).tenant },
    } as unknown as Record<string, ResponseRecord>
    for (const response of Object.values(bad)) {
      const { resume, resumed } = await harness(() => Promise.resolve(suspended()))
      const given = { state: new Uint8Array([1]), response }
      expect((await resume('start-c1/wait/resume', 'state/start-c1', given)).answer).toEqual({
        failure: { kind: 'invalid', field: 'response', reason: 'not-a-decision-of-this-call' },
      })
      expect(resumed).toEqual([])
    }
  })
})

describe('the local binding of a checkpointed author: where a segment ends badly', () => {
  const suspend = (state: Uint8Array<ArrayBuffer>) => () => Promise.resolve(suspended(state))
  const waitFacts = (batches: FactBatch[]) =>
    batches.flatMap(batch => batch.events.filter(event => event.fact.kind === 'wait'))

  it('takes a state of exactly the declared size, and refuses one that is no byte array', async () => {
    const exact = await harness(suspend(new Uint8Array(16)))
    expect(waitFacts(await drain((await exact.start()).live))).toHaveLength(1)
    expect(exact.settlements).toEqual([])
    const loose = await harness(() => Promise.resolve(suspended([1, 2] as never)))
    expect(waitFacts(await drain((await loose.start()).live))).toEqual([])
    expect(loose.settlements).toMatchObject([
      {
        outcome: {
          kind: 'failed',
          reason: 'the segment state exceeds the declared checkpoint size',
        },
      },
    ])
  })

  it('binds the effect boundary and the exclusion of a suspension to the state of the segment', async () => {
    const proofOf = async (state: number) => {
      const { start } = await harness(suspend(new Uint8Array([state])))
      const { binding, live, start: record } = await start()
      await drain(live)
      if (binding.kind !== 'checkpointed') throw new Error('expected a checkpointed binding')
      const proof = unbox(
        await binding.suspend({
          tenant: authorAccess.tenant,
          call: callId('c1'),
          operation: operationId('start-c1/suspension'),
          adoption: record.executor,
          inputDigest: 'sha256:plan',
          start: record,
          schema: codec,
        }),
      )
      if (proof.kind !== 'suspended') throw new Error('expected a suspension')
      return proof.checkpoint
    }
    const [first, again, other] = [await proofOf(1), await proofOf(1), await proofOf(2)]
    expect(again.effectBoundary).toEqual(first.effectBoundary)
    expect(again.exclusion).toEqual(first.exclusion)
    expect(other.effectBoundary).not.toEqual(first.effectBoundary)
    expect(other.exclusion).not.toEqual(first.exclusion)
  })

  it('hands the process updates of a segment on through its context', async () => {
    const update = { kind: 'append-text', index: '0', text: 'hello', close: false } as const
    const receipt = succeed({ kind: 'local', sequence: '1' } as const)
    const emitted: unknown[] = []
    let answered: unknown
    const { start } = await harness(
      async context => {
        answered = await context.emit(update)
        return succeed({ kind: 'completed', value: 1 })
      },
      {
        emit: () => async given => {
          emitted.push(given)
          return receipt
        },
      },
    )
    await drain((await start()).live)
    expect(emitted).toEqual([update])
    expect(answered).toBe(receipt)
  })

  it('settles a segment that returns a failure, or whose scope will not close, with that reason', async () => {
    const failing = await harness(() =>
      Promise.resolve(fail({ kind: 'invalid', reason: 'the author gave up' })),
    )
    await drain((await failing.start()).live)
    expect(failing.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'the author gave up' } },
    ])
    // The scope of a segment closes once: as failed for a failure that the segment returned.
    expect(failing.closes).toEqual(['failed'])
    const unclosed = await harness(() => Promise.resolve(suspended()), {
      close: kind =>
        kind === 'returned'
          ? Promise.resolve(fail({ kind: 'invalid', reason: 'the scope would not close' }))
          : undefined,
    })
    await drain((await unclosed.start()).live)
    expect(unclosed.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'the scope would not close' } },
    ])
  })

  it('closes the scope as failed when the segment throws, and settles even when no scope was made', async () => {
    const throwing = await harness(() => Promise.reject(new Error('segment threw')))
    await drain((await throwing.start()).live)
    expect(throwing.closes).toEqual(['failed'])
    expect(throwing.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'segment threw' } },
    ])
    const scopeless = await harness(() => Promise.resolve(suspended()), {
      scopeFails: true,
    })
    await drain((await scopeless.start()).live)
    expect(scopeless.closes).toEqual([])
    expect(scopeless.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'no scope' } },
    ])
  })
})

describe('the local binding of a checkpointed author: what it proves of a suspension', () => {
  const proofRequest = (record: Start, over: Record<string, unknown> = {}) => ({
    tenant: authorAccess.tenant,
    call: callId('c1'),
    operation: operationId('start-c1/suspension'),
    adoption: record.executor,
    inputDigest: 'sha256:plan',
    start: record,
    schema: codec,
    ...over,
  })

  it('says nothing is proven while the segment runs, and that a completed segment did not suspend', async () => {
    const held = Promise.withResolvers<Segment>()
    const running = await harness(() => held.promise)
    const live = await running.start()
    if (live.binding.kind !== 'checkpointed') throw new Error('expected a checkpointed binding')
    expect(unbox(await live.binding.suspend(proofRequest(live.start)))).toMatchObject({
      kind: 'unknown',
    })
    held.resolve(succeed({ kind: 'completed', value: 1 }))
    await drain(live.live)
    expect(unbox(await live.binding.suspend(proofRequest(live.start)))).toMatchObject({
      kind: 'not-suspended',
      evidence: expect.objectContaining({ owner: 'tool-host-local' }),
    })
  })

  it('denies a suspension whose call, tenant or call key disagree, each on its own', async () => {
    const { start } = await harness(() => Promise.resolve(suspended()))
    const { binding, live, start: record } = await start()
    await drain(live)
    if (binding.kind !== 'checkpointed') throw new Error('expected a checkpointed binding')
    const moved = (execution: Record<string, unknown>) => ({
      ...record,
      execution: { ...record.execution, ...execution },
    })
    const denied = { failure: { kind: 'denied', action: 'suspend-author' } }
    // The start names another call than the suspension does.
    expect(await binding.suspend(proofRequest(moved({ call: callId('c2') })))).toEqual(denied)
    // The start names another tenant than the suspension does.
    expect(
      await binding.suspend(proofRequest(moved({ tenant: accessOf(tenantB).tenant }))),
    ).toEqual(denied)
    // Suspension and start agree with each other, on a call this binding was not resolved for.
    expect(
      await binding.suspend(proofRequest(moved({ call: callId('c2') }), { call: callId('c2') })),
    ).toEqual(denied)
    expect(await binding.inspectSuspension(proofRequest(moved({ call: callId('c2') })))).toEqual(
      denied,
    )
  })

  it('proves a suspension again on recovery of a call whose segment suspended', async () => {
    const { start, bindings } = await harness(() => Promise.resolve(suspended()))
    const { live, start: record } = await start()
    await drain(live)
    const recovered = unbox(
      await bindings.recover({ ...authorAccess, call: callId('c1'), start: record }),
    )
    expect(unbox(await recovered.inspectSuspension(proofRequest(record)))).toMatchObject({
      kind: 'suspended',
    })
  })

  it('does not take another start record under the same operation for the retained segment', async () => {
    const { start } = await harness(() => Promise.resolve(suspended()))
    const { binding, live, start: record } = await start()
    await drain(live)
    if (binding.kind !== 'checkpointed') throw new Error('expected a checkpointed binding')
    const other = { ...record, execution: { ...record.execution, generation: '2' } }
    expect(unbox(await binding.suspend(proofRequest(other)))).toMatchObject({ kind: 'unknown' })
  })
})

describe('the local binding of a checkpointed author: the reason a segment fails and what is declared', () => {
  const suspendsOn = (waits: readonly unknown[]) =>
    harness(() => Promise.resolve(suspended()), { waits })
  const waitFacts = (batches: FactBatch[]) =>
    batches.flatMap(batch => batch.events.filter(event => event.fact.kind === 'wait'))

  it('suspends on any one of the Ask contracts the author declares', async () => {
    const declared = await suspendsOn([otherAsk, ask])
    expect(waitFacts(await drain((await declared.start()).live))).toHaveLength(1)
    expect(declared.settlements).toEqual([])
  })

  it('does not take a declared wait of another kind for a declared Ask, even with the same protocol', async () => {
    const declared = await suspendsOn([otherAsk, resourceWait])
    expect(waitFacts(await drain((await declared.start()).live))).toEqual([])
    expect(declared.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'the segment waits for an Ask it did not declare' } },
    ])
  })

  it('settles a segment that throws something that is no error with the reason of an author failure', async () => {
    const { start, closes, settlements } = await harness(() => Promise.reject('plain text'))
    await drain((await start()).live)
    expect(closes).toEqual(['failed'])
    expect(settlements).toMatchObject([{ outcome: { kind: 'failed', reason: 'author failed' } }])
  })

  it('fails a segment whose start identity is too long to name the wait of its segment', async () => {
    const { start, settlements } = await harness(() => Promise.resolve(suspended()))
    // The wait is the start identity and `/wait`: 252 and 5 characters are over the 256 allowed.
    const { live } = await start('c1', 'x'.repeat(252))
    expect(waitFacts(await drain(live))).toEqual([])
    expect(settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'the start cannot name the wait of its segment' } },
    ])
  })
})

describe('the local binding of a checkpointed author: when the end of a segment cannot be settled', () => {
  const tick = () => new Promise<void>(resolve => setImmediate(resolve))
  const lookup = (
    binding: Awaited<ReturnType<Awaited<ReturnType<typeof harness>>['start']>>,
    call = 'c1',
  ) => binding.binding.inspectStart({ ...authorAccess, call: callId(call), start: binding.start })

  it('reports the execution as unobservable when the settlement answers a failure, and publishes nothing', async () => {
    const { start } = await harness(
      () => Promise.resolve(succeed({ kind: 'completed', value: 1 })),
      {
        settle: async () =>
          fail({ kind: 'unavailable', dependency: 'settlement', diagnostic: 'down' }),
      },
    )
    const started = await start()
    await tick()
    expect(unbox(await lookup(started))).toEqual({
      kind: 'unknown',
      diagnostic: 'execution observation unavailable',
    })
    const seen: FactBatch[] = []
    for await (const batch of started.live.facts({ after: null, signal: AbortSignal.timeout(50) }))
      seen.push(batch)
    expect(seen).toEqual([])
  })

  it('reports the execution as unobservable when the settlement itself fails', async () => {
    const { start } = await harness(
      () => Promise.resolve(succeed({ kind: 'completed', value: 1 })),
      {
        settle: async () => {
          throw new Error('settlement threw')
        },
      },
    )
    const started = await start()
    await tick()
    expect(unbox(await lookup(started))).toEqual({
      kind: 'unknown',
      diagnostic: 'execution observation unavailable',
    })
  })

  it('answers commit-unknown, and runs no segment, when consuming the permit throws', async () => {
    let entered = 0
    const { bindings, fixed, loaded } = await harness(
      () => {
        entered += 1
        return Promise.resolve(suspended())
      },
      {
        consume: () => async () => {
          throw new Error('authority threw')
        },
      },
    )
    // `start` unboxes the answer, so the binding is driven directly here.
    const binding = unbox(
      await bindings.resolve({ ...authorAccess, call: callId('c1'), request: fixed }),
    )
    const record: Start = {
      kind: 'start',
      executor: loaded.executor,
      operation: operationId('start-c1'),
      execution: {
        tenant: authorAccess.tenant,
        call: callId('c1'),
        instance: instanceId,
        generation: '1',
      },
    }
    const permit = {
      tenant: authorAccess.tenant,
      call: callId('c1'),
      start: record,
    } as never
    const answer = await binding.start(
      { ...authorAccess, call: callId('c1'), start: record, request: fixed, permit },
      {},
    )
    expect(answer).toEqual({
      failure: { kind: 'commit-unknown', operation: operationId('start-c1') },
    })
    expect(entered).toBe(0)
  })

  it('binds the receipt of the executor to the start record and the request of the attempt', async () => {
    const consumed: { executorReceipt: unknown }[] = []
    const { start, fixed } = await harness(() => Promise.resolve(suspended()), {
      consume: base => async input => {
        consumed.push(input)
        return base(input)
      },
    })
    const started = await start()
    await drain(started.live)
    const key = canonicalDigest([authorAccess.tenant, callId('c1'), started.start.operation])
    expect(consumed).toEqual([
      {
        ...consumed[0],
        executorReceipt: localAuthorEvidence(`start/${key}`, [started.start, fixed]),
      },
    ])
  })
})

describe('the local binding of a checkpointed author: the scope of a segment and what resolving needs', () => {
  it('attaches the capability of the assembly to the first start only, never to a resume', async () => {
    const attached: string[] = []
    const { start, resume } = await harness(() => Promise.resolve(suspended()), {
      capability: (input, scope) => {
        attached.push(input.start.kind)
        return scope
      },
    })
    await drain((await start()).live)
    expect(attached).toEqual(['start'])
    const given = {
      state: new Uint8Array([1]),
      response: responseOf('start-c1', { kind: 'declined' }),
    }
    await drain(unbox((await resume('start-c1/wait/resume', 'state/start-c1', given)).answer))
    expect(attached).toEqual(['start'])
  })

  it('names the fact that continued the wait by the resume and the response it consumed', async () => {
    const { resume } = await harness(() => Promise.resolve(suspended()))
    const { record, answer } = await resume('start-c1/wait/resume', 'state/start-c1', {
      state: new Uint8Array([1]),
      response: responseOf('start-c1', { kind: 'declined' }),
    })
    const [first] = (await drain(unbox(answer))).flatMap(batch => batch.events.map(e => e.fact))
    const key = canonicalDigest([authorAccess.tenant, callId('c1'), record.operation])
    expect(first).toMatchObject({
      kind: 'continued',
      timing: localAuthorEvidence(`segment-continued/${key}`, [
        record,
        operationId('start-c1/wait/accept'),
      ]),
    })
  })

  it('says why a suspension is not proven: another start, another schema, a segment still running', async () => {
    const held = Promise.withResolvers<Segment>()
    const running = await harness(() => held.promise)
    const live = await running.start()
    if (live.binding.kind !== 'checkpointed') throw new Error('expected a checkpointed binding')
    const proof = (over: Record<string, unknown> = {}) =>
      live.binding.kind === 'checkpointed'
        ? live.binding.suspend({
            tenant: authorAccess.tenant,
            call: callId('c1'),
            operation: operationId('start-c1/suspension'),
            adoption: live.start.executor,
            inputDigest: 'sha256:plan',
            start: live.start,
            schema: codec,
            ...over,
          })
        : Promise.reject(new Error('expected a checkpointed binding'))
    expect(unbox(await proof())).toEqual({
      kind: 'unknown',
      diagnostic: 'the segment has not returned',
    })
    expect(unbox(await proof({ schema: adoption('other') }))).toEqual({
      kind: 'rejected',
      diagnostic: 'the suspension names another checkpoint schema',
    })
    expect(
      unbox(await proof({ start: { ...live.start, operation: operationId('never') } })),
    ).toEqual({ kind: 'unknown', diagnostic: 'no retained segment of this start' })
    held.resolve(succeed({ kind: 'completed', value: 1 }))
    await drain(live.live)
    const key = canonicalDigest([authorAccess.tenant, callId('c1'), live.start.operation])
    expect(unbox(await proof())).toEqual({
      kind: 'not-suspended',
      evidence: localAuthorEvidence(`segment-completed/${key}`, live.start),
    })
  })
})
