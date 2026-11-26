import { expect, it } from 'vitest'
import { compactionGeneration, type CompactionRequest } from '@omne-harness/agent-contract'
import { judgeMessage, judgePart } from '@omne-harness/message'
import {
  decodeOutputCursor,
  decodeResultVersion,
  decodeRevision,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type AssembledModelInput,
  type CallState,
  type ModelPreparationResources,
  type ModelRuntime,
  type Settlement,
} from '@omne-harness/model-contract'
import { decodeReadId, type ModelRequestPreparation } from '@omne-harness/model-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import { createDefaultCompactionExecutor } from '../src/default-executor.ts'
import {
  DEFAULT_COMPACTION_CONFIGURATION,
  type DefaultCompactionConfiguration,
} from '../src/default-configuration.ts'
import { readDefaultState } from '../src/default-state.ts'
import {
  createContextCompaction,
  type CompactionRecord,
  type CompactionStore,
} from '../src/provider.ts'
import { compactionRequestDigest } from '../src/evidence.ts'
import { access, adoption, ok, operation, request } from './request-fixture.ts'

function fixture(
  options: {
    request?: CompactionRequest
    resultAmount?: (input: AssembledModelInput) => string
    configuration?: DefaultCompactionConfiguration
    tooLarge?: boolean
    summaryInputTooLarge?: boolean
    loseAdmission?: boolean
    loseAck?: boolean
    invalidPreparation?: boolean
  } = {},
) {
  const input = options.request ?? request()
  let record: CompactionRecord | null = null
  const store: CompactionStore = {
    read: async () => succeed(record),
    async change(_ref, decide) {
      const result = decide(record)
      if ('failure' in result) return result
      record = result.ok.record
      return succeed(result.ok.value)
    },
    pending: async () => succeed({ refs: [input.ref], next: null }),
  }
  const calls = new Map<string, CallState>()
  let admissions = 0
  let acks = 0
  let cancellations = 0
  let preparations = 0
  const admitted: unknown[] = []
  let loseAdmission = options.loseAdmission ?? false
  let loseAck = options.loseAck ?? false
  const supplier = input.input.target.profile.profile.definition.suppliers[0]
  const basis = {
    supplier,
    meter: adoption,
    tokenization: { kind: 'not-used' as const, method: adoption },
    prompt: { kind: 'provider-private' as const, estimation: adoption },
    projection: adoption,
    mediaTransform: adoption,
    replay: adoption,
    evidence: adoption,
  }
  const resources: ModelPreparationResources<string> = {
    acquire: async () =>
      succeed({
        release: async () => ({}),
        bindings: [
          {
            supplier: { ...supplier, credential: { layer: 'official' } },
            rules: {
              plan: () =>
                succeed({
                  parameters: [],
                  representation: {
                    kind: 'materialized',
                    requestBytes: '100',
                    adoption,
                    tokenInput: { kind: 'null' },
                    media: [],
                  },
                }),
            },
            meter: {
              basis,
              async measure(given) {
                const compacted = given.assembled.messages.some(
                  message => message.role === 'compaction',
                )
                const summary = given.assembled.messages.some(message =>
                  message.blocks.some(block => block.id === 'compaction-summary-instruction'),
                )
                return succeed({
                  kind: 'complete',
                  inputDigest: 'fixture',
                  counting: [basis],
                  checks: [
                    {
                      supplier: supplier.adoption,
                      metric: 'input-tokens',
                      subject: 'request',
                      measurement: {
                        kind: 'exact',
                        amount:
                          summary && options.summaryInputTooLarge
                            ? '1001'
                            : compacted
                              ? (options.resultAmount?.(given.assembled) ??
                                (options.tooLarge ? '900' : '50'))
                              : '200',
                        method: adoption,
                      },
                      limit: '990',
                      constraint: { profile: adoption, upstream: { kind: 'unknown' } },
                    },
                  ],
                })
              },
            },
          },
        ],
      }),
  }
  const preparation: ModelRequestPreparation<string> = {
    prepare: async given => {
      preparations++
      return options.invalidPreparation
        ? fail({ kind: 'invalid', field: '/source/digest', reason: 'adoption' })
        : succeed({
            ...given.assembled,
            kind: 'llm',
            profile: given.profile.adoption,
            suppliers: [{ ...supplier, credential: { layer: 'official' } }],
            fallback: false,
            retryPolicy: adoption,
            parameterAdoptions: [],
            declarations: [
              { produces: 'test/test', accepts: ['test/test'], foreignThinking: 'omit' },
            ],
          })
    },
  }
  const settlement: Settlement = {
    version: ok(decodeResultVersion('mrver_summary')),
    termination: { kind: 'completed', reason: 'stop' },
    cursor: ok(decodeOutputCursor('1')),
    source: { owner: 'model', record: 'summary', revision: '1', digest: 'summary' },
  }
  const part = judgePart({
    kind: 'text',
    id: 'summary',
    text: 'Keep the unfinished work.',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in part || part.ok.kind !== 'text') throw new Error('summary fixture')
  const block = part.ok
  const model: ModelRuntime<string> = {
    calls: {
      async admit(given) {
        admissions++
        admitted.push(given.request)
        expect(given.request.tools).toEqual([])
        expect(given.request.toolChoice).toBe('none')
        calls.set(given.call, {
          call: given.call,
          revision: ok(decodeRevision('1')),
          consumer: given.consumer,
          control: { kind: 'none' },
          custody: { kind: 'producer' },
          phase: 'settled',
          settlement,
        })
        if (loseAdmission) {
          loseAdmission = false
          return fail({ kind: 'commit-unknown', operation: given.operation })
        }
        return succeed({
          call: given.call,
          revision: ok(decodeRevision('1')),
          recovered: false,
          reference: ok(
            encodeModelInvocationRef({
              tenant: given.tenant,
              call: given.call,
              admission: given.operation,
            }),
          ),
        })
      },
      async inspect(given) {
        const ref = ok(resolveModelInvocationRef(given.reference, given.tenant))
        const state = calls.get(ref.call)
        return succeed(
          state === undefined
            ? { kind: 'not-accepted', operation: ref.admission }
            : { kind: 'found', state },
        )
      },
      contact: async () => succeed({ kind: 'settled' }),
      dispatches: async () => succeed([]),
      cancel: async () => {
        cancellations++
        return succeed({ kind: 'none' })
      },
    },
    consumption: {
      beginRead: async () =>
        succeed({
          kind: 'started',
          read: ok(decodeReadId('mread_summary')),
          value: {
            kind: 'reading',
            page: { parts: [{ kind: 'sealed', block, trims: [] }], next: null, settlement },
          },
        }),
      readNext: async () => {
        throw new Error('no further pages')
      },
      closeRead: async () => succeed({ kind: 'ended', reason: 'closed' }),
      async acknowledge(given) {
        acks++
        const call = calls.get(given.call)
        if (call === undefined) throw new Error('missing call')
        const state = ok(readDefaultState(record?.execution ?? ''))
        if (state.phase !== 'running') throw new Error('summary acknowledged before intent')
        expect(state.processed.some(item => item.result === given.result)).toBe(true)
        const ids = await import('../src/default-identities.ts')
        const reference = ids.summaryIdentities(input, state.attempt).reference
        ok(await executor.verifyCompletion({ ...given, consumer: call.consumer, reference }))
        if (loseAck) {
          loseAck = false
          return fail({ kind: 'commit-unknown', operation: given.operation })
        }
        return succeed({
          call: given.call,
          result: given.result,
          custody: {
            kind: 'acknowledged',
            operation: given.operation,
            receipt: settlement.source,
            cleanup: 'released',
            diagnostic: null,
          },
        })
      },
    },
    instances: { connect: async () => succeed({ kind: 'no-live-route' }) },
  }
  const create = (configuration = options.configuration ?? DEFAULT_COMPACTION_CONFIGURATION) =>
    createDefaultCompactionExecutor({
      configuration,
      store,
      resources,
      requests: preparation,
      model,
      access: async () => succeed(access),
    })
  let executor = create()
  const provider = createContextCompaction({
    authority: input.ref.authority,
    adoption: input.provider,
    store,
    executor: {
      get initialState() {
        return executor.initialState
      },
      advance: (...args) => executor.advance(...args),
      cancel: (...args) => executor.cancel(...args),
    },
    authorize: async () => succeed(undefined),
    custody: async () => succeed(undefined),
  })
  return {
    input,
    provider,
    store,
    create,
    counts: () => ({ admissions, acks, cancellations }),
    admitted: () => admitted,
    preparations: () => preparations,
    restart(configuration?: DefaultCompactionConfiguration) {
      executor = create(configuration)
    },
    async drive(limit = 25) {
      for (let step = 0; step < limit; step++) {
        const result = await provider.reconcile(input.ref)
        if ('failure' in result) {
          if (result.failure.kind !== 'unavailable') throw new Error(JSON.stringify(result.failure))
          continue
        }
        if (result.ok.phase === 'terminal' && result.ok.physical === 'settled') return result.ok
      }
      throw new Error('did not settle')
    },
  }
}

it('sends the summary instruction as the last message, in the user role', async () => {
  const f = fixture()
  ok(await f.provider.service.admit({ ...access, request: f.input }))
  await f.drive()
  const [sent] = f.admitted() as readonly {
    system: readonly unknown[]
    tools: readonly unknown[]
    messages: readonly { role: string; blocks: { id: string }[] }[]
  }[]
  if (sent === undefined) throw new Error('no summary call')
  expect(sent.system).toEqual([])
  expect(sent.tools).toEqual([])
  const last = sent.messages.at(-1)
  expect(last?.role).toBe('user')
  expect(last?.blocks.map(block => block.id)).toEqual(['compaction-summary-instruction'])
})

it('recovers unknown admission and ACK without issuing a second summary call', async () => {
  const f = fixture({ loseAdmission: true, loseAck: true })
  ok(await f.provider.service.admit({ ...access, request: f.input }))
  ok(await f.provider.reconcile(f.input.ref))
  expect(await f.provider.reconcile(f.input.ref)).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  f.restart()
  const result = await f.drive()
  expect(result.outcome).toMatchObject({
    kind: 'completed',
    message: {
      id: f.input.input.outputMessageId,
      derivation: compactionGeneration(f.input.ref),
    },
  })
  expect(f.counts()).toEqual({ admissions: 1, acks: 2, cancellations: 0 })
})

it.each([0, 1])(
  'freezes configured allowance at admission across restart after %i preparations',
  async preparations => {
    const f = fixture({
      tooLarge: true,
      configuration: { ...DEFAULT_COMPACTION_CONFIGURATION, summaryAttempts: 1 },
    })
    ok(await f.provider.service.admit({ ...access, request: f.input }))
    for (let i = 0; i < preparations; i++) ok(await f.provider.reconcile(f.input.ref))
    f.restart({ ...DEFAULT_COMPACTION_CONFIGURATION, summaryAttempts: 3 })
    expect((await f.drive()).outcome).toMatchObject({
      kind: 'cannot-fit',
      reason: 'after-compaction',
    })
    expect(f.counts().admissions).toBe(1)
  },
)

it('terminates an invalid frozen summary request without repeatedly preparing or admitting it', async () => {
  const f = fixture({ invalidPreparation: true })
  ok(await f.provider.service.admit({ ...access, request: f.input }))
  expect((await f.drive()).outcome).toMatchObject({ kind: 'failed', reason: 'execution-failed' })
  f.restart()
  expect((await f.drive()).outcome).toMatchObject({ kind: 'failed', reason: 'execution-failed' })
  expect(f.preparations()).toBe(1)
  expect(f.counts().admissions).toBe(0)
})

it('reports an internal summary input limit without a model call or recursive task after restart', async () => {
  const f = fixture({ summaryInputTooLarge: true })
  ok(await f.provider.service.admit({ ...access, request: f.input }))
  const result = await f.drive()
  expect(result.outcome).toMatchObject({ kind: 'failed', reason: 'execution-limit' })
  expect(result.ref).toEqual(f.input.ref)
  f.restart()
  expect(await f.drive()).toEqual(result)
  expect(f.preparations()).toBe(0)
  expect(f.counts()).toEqual({ admissions: 0, acks: 0, cancellations: 0 })
})

it('persists and exhausts the three-attempt allowance for summaries that do not fit', async () => {
  const f = fixture({ tooLarge: true })
  ok(await f.provider.service.admit({ ...access, request: f.input }))
  for (let i = 0; i < 8; i++) {
    ok(await f.provider.reconcile(f.input.ref))
    f.restart()
  }
  expect((await f.drive()).outcome).toMatchObject({
    kind: 'cannot-fit',
    reason: 'after-compaction',
  })
  expect(f.counts().admissions).toBe(3)
})

it('finishes a recorded original intent after cancellation without starting another attempt', async () => {
  const f = fixture({ tooLarge: true })
  ok(await f.provider.service.admit({ ...access, request: f.input }))
  ok(await f.provider.reconcile(f.input.ref))
  ok(await f.provider.service.cancel({ ...access, ref: f.input.ref, operation }))
  f.restart()
  expect((await f.drive()).outcome).toMatchObject({ kind: 'cancelled' })
  expect(f.counts()).toEqual({ admissions: 1, acks: 1, cancellations: 1 })
})

it.each(['system', 'tools'] as const)(
  'refuses a summary that fits alone but exceeds the target with the frozen %s',
  async component => {
    const original = request()
    const reminder = judgeMessage({
      id: 'msg_zzzzzzzzzzzzzzzzzzzzzz',
      role: 'system_reminder',
      blocks: [
        {
          kind: 'text',
          id: 'expensive-frame',
          text: 'large frozen frame',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if ('rejected' in reminder || reminder.ok.role !== 'system_reminder')
      throw new Error('frame fixture')
    const frame = {
      ...original.input.frame,
      ...(component === 'system' ? { system: reminder.ok.blocks } : {}),
      ...(component === 'tools'
        ? {
            tools: [
              {
                name: 'large_schema',
                description: 'large frozen frame',
                argumentsSchema: { kind: 'null' as const },
              },
            ],
          }
        : {}),
    }
    const candidate = { ...original, input: { ...original.input, frame } }
    const given = {
      ...candidate,
      ref: { ...candidate.ref, requestDigest: compactionRequestDigest(candidate) },
    }
    const f = fixture({
      request: given,
      resultAmount: assembled => {
        const present =
          component === 'system'
            ? assembled.system.some(block => block.id === 'expensive-frame')
            : component === 'tools'
              ? assembled.tools.some(tool => tool.name === 'large_schema')
              : assembled.messages.some(message => message.id === reminder.ok.id)
        return present ? '900' : '50'
      },
    })
    ok(await f.provider.service.admit({ ...access, request: f.input }))
    expect((await f.drive()).outcome).toMatchObject({
      kind: 'cannot-fit',
      reason: 'after-compaction',
    })
    expect(f.counts().admissions).toBe(3)
  },
)
