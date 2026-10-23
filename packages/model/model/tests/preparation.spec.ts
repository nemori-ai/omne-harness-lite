// The production preparation resources: the lease acquires one binding per supplier, reads the
// facts of the calls the lineage names once with the caller's access, judges the anchor and the
// sources, and hands the family meter the numbers. The family meter here is a stub that records
// what it receives: these tests are about what the lease reads, judges and reports, not about
// token arithmetic (the family packages cover that with their real meters).
import { describe, expect, it } from 'vitest'
import { judgeContentBlock } from '@omne-harness/content-block'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeRevision,
  judgeFixedModelRequest,
  type Access,
  type AssembledModelInput,
  type CallAccess,
  type CalibratedInputMeter,
  type ContextLimits,
  type DispatchRecord,
  type FixedModelRequest,
  type MeterCalibration,
  type MeterRepresentation,
  type ModelCallId,
  type ModelCommands,
  type ModelCountingBasis,
  type ModelFailure,
  type ModelInputMeter,
  type ModelPreparationLease,
  type ModelProfile,
  type PreparationLineage,
  type RequestBudget,
  type Supplier,
  type TransportFact,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  createModelPreparationResources,
  type ModelPreparationOptions,
  type PreparationBinding,
  type PreparationBindingSource,
} from '@omne-harness/model'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import {
  adoption,
  callId,
  fixture,
  identity,
  instance,
  op,
  proof,
  request,
  unbox,
} from './memory-fixture.ts'

type Principal = ReturnType<typeof fixture>['principal']
type Commands = ModelCommands<Principal>
type Measured = ReturnType<ModelInputMeter['measure']>

// --- request material ------------------------------------------------------------------------

const SHOWN = { toHuman: true, toModel: true }

function textBlock(id: string, text: string): unknown {
  return { kind: 'text', id, visibility: SHOWN, text }
}

/** The one sealed block of a settled reply, through the content-block judge. */
function replyBlock() {
  const judged = judgeContentBlock(textBlock('reply', 'answer'))
  if ('rejected' in judged) throw new Error('fixture block')
  return judged.ok
}

function stateBlock(id: string): unknown {
  return {
    kind: 'reasoning_state',
    id,
    visibility: { toHuman: false, toModel: true },
    payload: '{"fixture":"state"}',
    pairs: [],
  }
}

function user(id: string, text = 'hello'): unknown {
  return { id: `msg_${id.padEnd(22, '0')}`, role: 'user', blocks: [textBlock(`b-${id}`, text)] }
}

/** An assistant message that carries one reasoning state part, so a request would replay it. */
function assistantWithState(id: string): unknown {
  return {
    id: `msg_${id.padEnd(22, '0')}`,
    role: 'assistant',
    blocks: [textBlock(`t-${id}`, 'answer'), stateBlock(`s-${id}`)],
    replay: { scope: 'test.invalid/test', format: 'fixture', at: [1] },
  }
}

function requestWith(messages: readonly unknown[], overrides: object = {}): FixedModelRequest {
  const judged = judgeFixedModelRequest({ ...request, ...overrides, messages })
  if (!('ok' in judged)) throw new Error(`fixture request: ${JSON.stringify(judged.failure)}`)
  return judged.ok
}

function assembledOf(fixed: FixedModelRequest): AssembledModelInput {
  return {
    system: fixed.system,
    messages: fixed.messages,
    tools: fixed.tools,
    toolChoice: fixed.toolChoice,
    parameters: fixed.parameters,
    representation: fixed.representation,
    source: fixed.source,
  }
}

const profileSupplier = request.suppliers[0]
const revision = unbox(decodeRevision('1'))
const context: ContextLimits = {
  window: { provided: '1000', upstream: [] },
  input: null,
  output: { provided: '100', upstream: [] },
  compactionTriggerPercent: '80',
}
const profile: ModelProfile = {
  identity: { scope: { kind: 'factory' }, route: 'test' },
  adoption,
  revision,
  updatedAt: '2026-10-23T00:00:00Z',
  availability: 'active',
  definition: {
    suppliers: [profileSupplier],
    fallback: false,
    input: ['text'],
    output: ['text'],
    context,
    limits: [],
    parameters: [],
    representation: adoption,
    meter: adoption,
    retryPolicy: adoption,
  },
}
const basis: ModelCountingBasis = {
  supplier: profileSupplier,
  meter: adoption,
  tokenization: { kind: 'not-used', method: adoption },
  prompt: { kind: 'provider-private', estimation: adoption },
  projection: adoption,
  mediaTransform: adoption,
  replay: adoption,
  evidence: adoption,
}
const otherAdoption = { ...adoption, name: 'other' }

// --- the stub family: a binding source whose meter records the calibration it receives --------

type StubFamily = {
  readonly bindings: PreparationBindingSource
  /** Every calibration a stub meter received, in call order. */
  readonly calibrations: MeterCalibration[]
  /** The binding the source gave out, once acquired. */
  readonly given: PreparationBinding[]
  readonly released: number
  failRelease: boolean
  acquireFailures: number
}

function stubFamily(): StubFamily {
  const calibrations: MeterCalibration[] = []
  const given: PreparationBinding[] = []
  const state = { released: 0, failRelease: false, acquireFailures: 0 }
  const budgetOf = (calibration: MeterCalibration): Outcome<RequestBudget, never> => ({
    ok: {
      kind: 'complete',
      inputDigest: 'stub',
      checks: [],
      counting: [basis],
      ...(calibration.anchor === null ? {} : { calibration: { anchor: { kind: 'hit' } } }),
    },
  })
  const meter: CalibratedInputMeter = {
    basis,
    measure: input => meter.measureCalibrated(input, { anchor: null, outputs: [] }),
    measureCalibrated: (_input, calibration) => {
      calibrations.push(calibration)
      return budgetOf(calibration)
    },
  }
  const bindings: PreparationBindingSource = {
    async acquire(supplier) {
      if (state.acquireFailures > 0) {
        state.acquireFailures -= 1
        return { failure: { kind: 'unavailable', dependency: 'stub-family', diagnostic: 'down' } }
      }
      const binding: PreparationBinding = {
        supplier,
        rules: {
          plan: ({ assembled }) => ({
            ok: {
              parameters: [],
              representation: {
                kind: 'materialized',
                adoption,
                tokenInput: { kind: 'null' },
                media: [],
                requestBytes: '0',
                units: assembled.messages.map(message => message.id),
              },
            },
          }),
        },
        meter,
        release: async () => {
          state.released += 1
          if (state.failRelease) throw new Error('stub release failed')
        },
      }
      given.push(binding)
      return { ok: binding }
    },
  }
  return {
    bindings,
    calibrations,
    given,
    get released() {
      return state.released
    },
    get failRelease() {
      return state.failRelease
    },
    set failRelease(value: boolean) {
      state.failRelease = value
    },
    get acquireFailures() {
      return state.acquireFailures
    },
    set acquireFailures(value: number) {
      state.acquireFailures = value
    },
  }
}

const supplierOf: ModelPreparationOptions<Principal>['supplierOf'] = ({ supplier }) => ({
  ok: {
    adoption: supplier.adoption,
    recipient: supplier.recipient,
    model: supplier.model,
    credential: { kind: 'factory' },
  },
})

// --- a stub store: the dispatches of each call, as the storage port would answer ---------------

type Reads = { readonly access: CallAccess<Principal> }[]

function stubStore(
  answers: ReadonlyMap<ModelCallId, Outcome<readonly DispatchRecord[], ModelFailure>>,
  reads: Reads = [],
): Pick<Commands, 'dispatches'> {
  return {
    dispatches: input => {
      reads.push({ access: input })
      return Promise.resolve(
        answers.get(input.call) ?? {
          failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
        },
      )
    },
  }
}

function counted(
  name: string,
  lexeme: string | null,
): DispatchRecord['account'] extends infer A
  ? A extends { usage: readonly (infer U)[] }
    ? U
    : never
  : never {
  return lexeme === null
    ? { name, state: 'unknown', unit: 'token' }
    : { name, state: 'known', lexeme, unit: 'token' }
}

type Counts = Readonly<{
  input?: string | null
  output?: string | null
  cacheRead?: string | null
  cacheWrite?: string | null
  reasoning?: string | null
}>

function accountOf(counts: Counts = {}): NonNullable<DispatchRecord['account']> {
  return {
    subject: { kind: 'model_call', id: callId('x') },
    receipt: 'received',
    usage: [
      counted('input', counts.input === undefined ? '100' : counts.input),
      counted('output', counts.output === undefined ? '18' : counts.output),
      counted('cache-read', counts.cacheRead === undefined ? '20' : counts.cacheRead),
      counted('cache-write', counts.cacheWrite === undefined ? '3' : counts.cacheWrite),
      counted('reasoning', counts.reasoning === undefined ? '11' : counts.reasoning),
    ],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'test',
    duration: { state: 'unknown' },
    revision: '1',
  }
}

const supplier: Supplier = { ...profileSupplier, credential: { kind: 'factory' } }

function recordOf(
  overrides: Omit<Partial<DispatchRecord>, 'dispatch'> & Readonly<{ dispatch?: string }> = {},
): DispatchRecord {
  const { dispatch, ...rest } = overrides
  return {
    dispatch: unbox(decodeDispatchId(dispatch ?? 'mdisp_x')),
    supplier,
    intent: op('intent'),
    send: 'started',
    firstContent: 'observed',
    terminal: { kind: 'completed', reason: 'stop' },
    account: accountOf(),
    materialization: {
      receipt: { supplier: adoption, representation: adoption, payloadDigest: 'a'.repeat(64) },
      source: proof('x'),
    },
    ...rest,
  }
}

// --- driving a lease -------------------------------------------------------------------------

async function acquire(
  options: Partial<ModelPreparationOptions<Principal>> &
    Readonly<{ commands: Pick<Commands, 'dispatches'>; bindings: PreparationBindingSource }>,
  access: Access<Principal>,
  lineage?: PreparationLineage,
): Promise<ModelPreparationLease> {
  const resources = createModelPreparationResources<Principal>({
    supplierOf,
    maxCitedCalls: 8,
    ...options,
  })
  return unbox(
    await resources.acquire(
      lineage === undefined ? { ...access, profile } : { ...access, profile, lineage },
    ),
  )
}

type MeterInput = Parameters<ModelPreparationLease['bindings'][number]['meter']['measure']>[0]

/** The input of `measure` for this request, planned with the rules of the first binding. */
function inputWith(
  lease: ModelPreparationLease,
  fixed: FixedModelRequest,
  change: (representation: MeterRepresentation) => MeterRepresentation = value => value,
): MeterInput {
  const [binding] = lease.bindings
  const assembled = assembledOf(fixed)
  const planned = binding.rules.plan({ profile, supplier: binding.supplier, assembled })
  if (!('ok' in planned)) throw new Error(`plan: ${JSON.stringify(planned.failure)}`)
  return {
    profile: adoption,
    supplier: profileSupplier,
    context,
    limits: [],
    assembled,
    parameters: planned.ok.parameters,
    representation: change(planned.ok.representation),
  }
}

function measureWith(
  lease: ModelPreparationLease,
  fixed: FixedModelRequest,
  change: (representation: MeterRepresentation) => MeterRepresentation = value => value,
): Measured {
  return lease.bindings[0].meter.measure(inputWith(lease, fixed, change))
}

function reportOf(measured: Measured): RequestBudget['calibration'] {
  if (!('ok' in measured)) throw new Error(`measure: ${JSON.stringify(measured.failure)}`)
  return measured.ok.calibration
}

const X = callId('xcontinued')
const Y = callId('ysource')
const two = [user('u1'), user('u2')]
const three = [...two, user('u3')]
const ids = (fixed: FixedModelRequest) => fixed.messages.map(message => message.id)

// --- the real memory Commands: a settled call X with an account -------------------------------

async function settledCall(
  f: ReturnType<typeof fixture>,
  commands: Commands,
  call: ModelCallId,
  fixed: FixedModelRequest,
  account: TransportFact,
) {
  const admit = { ...f.admit, call, operation: op(`admit-${call}`), request: fixed }
  unbox(await commands.admit(admit))
  const execution = unbox(
    await commands.claim({
      ...admit,
      operation: op(`claim-${call}`),
      instance: instance(),
      continuity: proof(call),
    }),
  )
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: op(`write-${call}-${++serial}`),
    expected: unbox(await commands.loadRecovery({ ...f.admit, call })).state.revision,
  })
  const dispatch = unbox(decodeDispatchId(`mdisp_${call.slice('mcall_'.length)}`))
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: fixed.suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(
    await commands.recordMaterialization({
      ...(await write()),
      dispatch,
      receipt: {
        supplier: fixed.suppliers[0].adoption,
        representation: fixed.representation,
        payloadDigest: 'a'.repeat(64),
      },
    }),
  )
  unbox(await commands.recordSend({ ...(await write()), dispatch, state: 'started' }))
  unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window: 'w' }))
  const facts: TransportFact[] = [
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'answer' },
    { kind: 'block-seal', index: '0', block: replyBlock() },
    account,
    { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
  ]
  unbox(await commands.preserve({ ...(await write()), dispatch, window: 'w', facts }))
  const settlement = unbox(
    await commands.settle({
      ...(await write()),
      termination: { kind: 'completed', reason: 'stop' },
    }),
  )
  return { execution, settlement, admit }
}

const accountFact: TransportFact = {
  kind: 'account',
  event: 'usage',
  value: {
    usage: [
      counted('input', '100'),
      counted('output', '18'),
      counted('cache-read', '20'),
      counted('cache-write', '3'),
      counted('reasoning', '11'),
    ],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'test',
    duration: { state: 'unknown' },
    revision: '1',
  },
}

describe('a lease over the real memory Commands', () => {
  it('without a lineage answers what the family meter answers and reads nothing', async () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    const family = stubFamily()
    const reads: Reads = []
    const spy = {
      dispatches: (input: CallAccess<Principal>) => (
        reads.push({ access: input }),
        commands.dispatches(input)
      ),
    }
    const lease = await acquire({ commands: spy, bindings: family.bindings }, f.admit)
    const meter = family.given[0]?.meter
    if (meter === undefined) throw new Error('fixture')
    expect(lease.bindings[0].meter.basis).toEqual(meter.basis)
    const input = inputWith(lease, requestWith(two))
    const measured = lease.bindings[0].meter.measure(input)
    expect(JSON.stringify(measured)).toBe(JSON.stringify(meter.measure(input)))
    expect(reportOf(measured)).toBeUndefined()
    expect(reads).toEqual([])
    await lease.release()
  })

  it('hits the anchor of the continued call: its real input total and the messages it covers', async () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    await settledCall(f, commands, X, requestWith(two), accountFact)
    const family = stubFamily()
    const lease = await acquire({ commands, bindings: family.bindings }, f.admit, { continues: X })
    const current = requestWith(three)
    const measured = measureWith(lease, current)
    expect(reportOf(measured)).toEqual({ anchor: { kind: 'hit' } })
    expect(family.calibrations).toEqual([
      { anchor: { covered: ids(requestWith(two)), inputTotal: '123' }, outputs: [] },
    ])
    await lease.release()
  })

  it('still hits after X was acknowledged and its request material released', async () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    const { execution, settlement, admit } = await settledCall(
      f,
      commands,
      X,
      requestWith(two),
      accountFact,
    )
    unbox(
      await commands.handoff({
        ...admit,
        operation: op('ack'),
        result: settlement.version,
        evidence: {
          kind: 'processed',
          completion: proof(`${X}/${settlement.version}`, 'consumer'),
        },
      }),
    )
    const custody = unbox(await commands.advanceCleanup({ ...execution, operation: op('cleanup') }))
    expect(custody).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
    expect(await commands.loadRecovery({ ...f.admit, call: X })).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'recovery-material-released' },
    })
    const [record] = unbox(await commands.dispatches({ ...f.admit, call: X }))
    expect(record?.messages).toEqual(ids(requestWith(two)))
    expect(record?.account).not.toBeNull()
    const family = stubFamily()
    const lease = await acquire({ commands, bindings: family.bindings }, f.admit, { continues: X })
    expect(reportOf(measureWith(lease, requestWith(three)))).toEqual({ anchor: { kind: 'hit' } })
    expect(family.calibrations[0]?.anchor).toEqual({
      covered: ids(requestWith(two)),
      inputTotal: '123',
    })
    await lease.release()
  })

  it("another tenant's call and a call that does not exist give one and the same result", async () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    await settledCall(f, commands, X, requestWith(two), accountFact)
    const foreign: Access<Principal> = { principal: f.principal, tenant: identity('6') }
    expect(tenantEquals(foreign.tenant, f.tenant)).toBe(false)
    const outcomes = await Promise.all(
      [
        {
          access: foreign,
          lineage: {
            continues: X,
            sources: [{ message: requestWith(three).messages[2]!.id, call: X }],
          },
        },
        {
          access: f.admit,
          lineage: {
            continues: callId('missing'),
            sources: [{ message: requestWith(three).messages[2]!.id, call: callId('missing') }],
          },
        },
      ].map(async ({ access, lineage }) => {
        const family = stubFamily()
        const lease = await acquire({ commands, bindings: family.bindings }, access, lineage)
        const measured = measureWith(lease, requestWith(three))
        await lease.release()
        return { measured, calibrations: family.calibrations }
      }),
    )
    expect(JSON.stringify(outcomes[0])).toBe(JSON.stringify(outcomes[1]))
    expect(reportOf(outcomes[0]!.measured)).toEqual({
      anchor: { kind: 'miss', reason: 'call-unreadable' },
    })
    expect(outcomes[0]!.calibrations[0]?.outputs).toEqual([
      {
        message: requestWith(three).messages[2]!.id,
        kind: 'withheld',
        reason: 'source-unreadable',
      },
    ])
  })
})

describe('anchor misses, each with its own reason and a fallback to full metering', () => {
  const f = fixture()
  const current = requestWith(three)
  const prefix = ids(requestWith(two))

  async function missOf(
    answer: Outcome<readonly DispatchRecord[], ModelFailure>,
    lineage: PreparationLineage = { continues: X },
    change?: (representation: MeterRepresentation) => MeterRepresentation,
  ) {
    const family = stubFamily()
    const lease = await acquire(
      { commands: stubStore(new Map([[X, answer]])), bindings: family.bindings },
      f.admit,
      lineage,
    )
    const measured = measureWith(lease, current, change)
    await lease.release()
    expect(family.calibrations[0]?.anchor).toBeNull()
    return reportOf(measured)
  }

  const settled = (overrides: Partial<DispatchRecord> = {}) => ({
    ok: [recordOf({ messages: prefix, ...overrides })],
  })

  it('not-declared: the lineage names sources but no continuation', async () => {
    expect(
      await missOf(settled(), { sources: [{ message: current.messages[0]!.id, call: X }] }),
    ).toEqual({
      anchor: { kind: 'miss', reason: 'not-declared' },
    })
  })

  it('call-unreadable: the store denies the read', async () => {
    expect(await missOf({ failure: { kind: 'denied', action: 'account' } })).toEqual({
      anchor: { kind: 'miss', reason: 'call-unreadable' },
    })
  })

  it('facts-unavailable: the store cannot answer, and the acquire still succeeds', async () => {
    expect(
      await missOf({ failure: { kind: 'unavailable', dependency: 'store', diagnostic: 'down' } }),
    ).toEqual({ anchor: { kind: 'miss', reason: 'facts-unavailable' } })
  })

  it('messages-unrecorded: an older record without the message sequence', async () => {
    const { messages: _none, ...older } = recordOf()
    expect(await missOf({ ok: [older] })).toEqual({
      anchor: { kind: 'miss', reason: 'messages-unrecorded' },
    })
  })

  it('ambiguous-dispatch: two accounted dispatches of X', async () => {
    expect(
      await missOf({
        ok: [recordOf({ messages: prefix }), recordOf({ messages: prefix, dispatch: 'mdisp_y' })],
      }),
    ).toEqual({ anchor: { kind: 'miss', reason: 'ambiguous-dispatch' } })
  })

  it('supplier-changed: the receipt names another supplier adoption', async () => {
    expect(
      await missOf(
        settled({
          materialization: {
            receipt: {
              supplier: otherAdoption,
              representation: adoption,
              payloadDigest: 'a'.repeat(64),
            },
            source: proof('x'),
          },
        }),
      ),
    ).toEqual({ anchor: { kind: 'miss', reason: 'supplier-changed' } })
  })

  it('representation-changed: the receipt names another representation adoption', async () => {
    expect(
      await missOf(
        settled({
          materialization: {
            receipt: {
              supplier: adoption,
              representation: otherAdoption,
              payloadDigest: 'a'.repeat(64),
            },
            source: proof('x'),
          },
        }),
      ),
    ).toEqual({ anchor: { kind: 'miss', reason: 'representation-changed' } })
  })

  it('not-a-prefix: X sent other messages, or more messages than this request has', async () => {
    const other = ids(requestWith([user('u1'), user('other')]))
    expect(await missOf(settled({ messages: other }))).toEqual({
      anchor: { kind: 'miss', reason: 'not-a-prefix' },
    })
    const longer = ids(requestWith([...three, user('u4')]))
    expect(await missOf(settled({ messages: longer }))).toEqual({
      anchor: { kind: 'miss', reason: 'not-a-prefix' },
    })
  })

  it('usage-unknown: an unknown input, cache-read or cache-write, or no accounted dispatch', async () => {
    for (const counts of [{ input: null }, { cacheRead: null }, { cacheWrite: null }])
      expect(await missOf(settled({ account: accountOf(counts) }))).toEqual({
        anchor: { kind: 'miss', reason: 'usage-unknown' },
      })
    expect(await missOf({ ok: [recordOf({ messages: prefix, account: null })] })).toEqual({
      anchor: { kind: 'miss', reason: 'usage-unknown' },
    })
  })

  it('units-missing: a representation without the side table cannot be split', async () => {
    expect(await missOf(settled(), { continues: X }, ({ units: _units, ...rest }) => rest)).toEqual(
      { anchor: { kind: 'miss', reason: 'units-missing' } },
    )
  })

  it('an equal sequence is a prefix: the request sent again hits', async () => {
    const family = stubFamily()
    const lease = await acquire(
      {
        commands: stubStore(new Map([[X, settled({ messages: ids(current) })]])),
        bindings: family.bindings,
      },
      f.admit,
      { continues: X },
    )
    expect(reportOf(measureWith(lease, current))).toEqual({ anchor: { kind: 'hit' } })
    await lease.release()
  })
})

describe('sources: the output count of each declared source, or why it is withheld', () => {
  const f = fixture()
  const history = requestWith([user('u1'), assistantWithState('a1'), user('u2')])
  const [u1, a1] = history.messages
  if (u1 === undefined || a1 === undefined) throw new Error('fixture')

  async function outputsOf(
    answers: ReadonlyMap<ModelCallId, Outcome<readonly DispatchRecord[], ModelFailure>>,
    lineage: PreparationLineage,
  ) {
    const family = stubFamily()
    const lease = await acquire(
      { commands: stubStore(answers), bindings: family.bindings },
      f.admit,
      lineage,
    )
    reportOf(measureWith(lease, history))
    await lease.release()
    return family.calibrations[0]?.outputs
  }

  it('a known output is handed over as the O of the message, and a source for a message outside the request is dropped', async () => {
    const stranger = requestWith([user('zz')]).messages[0]!.id
    expect(
      await outputsOf(new Map([[Y, { ok: [recordOf()] }]]), {
        sources: [
          { message: a1.id, call: Y },
          { message: stranger, call: Y },
        ],
      }),
    ).toEqual([{ message: a1.id, kind: 'known', outputTokens: '18' }])
  })

  it('source-missing: an assistant message that carries state without a declared source', async () => {
    expect(
      await outputsOf(new Map([[Y, { ok: [recordOf()] }]]), {
        sources: [{ message: u1.id, call: Y }],
      }),
    ).toEqual([
      { message: u1.id, kind: 'known', outputTokens: '18' },
      { message: a1.id, kind: 'withheld', reason: 'source-missing' },
    ])
  })

  it.each([
    [
      'source-unreadable',
      new Map([[Y, { failure: { kind: 'denied', action: 'account' } } as const]]),
    ],
    [
      'source-unavailable',
      new Map([
        [Y, { failure: { kind: 'unavailable', dependency: 'store', diagnostic: 'down' } } as const],
      ]),
    ],
    ['ambiguous-dispatch', new Map([[Y, { ok: [recordOf(), recordOf({ dispatch: 'mdisp_y' })] }]])],
    [
      'output-unknown',
      new Map([[Y, { ok: [recordOf({ account: accountOf({ output: null }) })] }]]),
    ],
    [
      'reasoning-exceeds-output',
      new Map([[Y, { ok: [recordOf({ account: accountOf({ output: '10', reasoning: '11' }) })] }]]),
    ],
    [
      'supplier-changed',
      new Map([
        [
          Y,
          {
            ok: [
              recordOf({
                materialization: {
                  receipt: {
                    supplier: otherAdoption,
                    representation: adoption,
                    payloadDigest: 'a'.repeat(64),
                  },
                  source: proof('y'),
                },
              }),
            ],
          },
        ],
      ]),
    ],
  ] as const)('%s is handed over as a withheld source, never as zero', async (reason, answers) => {
    expect(await outputsOf(answers, { sources: [{ message: a1.id, call: Y }] })).toEqual([
      { message: a1.id, kind: 'withheld', reason },
    ])
  })

  it('a source whose receipt names another representation but the same supplier still gives its O', async () => {
    const answers = new Map([
      [
        Y,
        {
          ok: [
            recordOf({
              materialization: {
                receipt: {
                  supplier: adoption,
                  representation: otherAdoption,
                  payloadDigest: 'a'.repeat(64),
                },
                source: proof('y'),
              },
            }),
          ],
        },
      ],
    ])
    expect(await outputsOf(answers, { sources: [{ message: a1.id, call: Y }] })).toEqual([
      { message: a1.id, kind: 'known', outputTokens: '18' },
    ])
  })

  it('a source whose only accounted dispatch has no account is output-unknown', async () => {
    expect(
      await outputsOf(new Map([[Y, { ok: [recordOf({ account: null })] }]]), {
        sources: [{ message: a1.id, call: Y }],
      }),
    ).toEqual([{ message: a1.id, kind: 'withheld', reason: 'output-unknown' }])
  })
})

describe('acquire: reads, limits and all-or-nothing bindings', () => {
  const f = fixture()

  it('reads each distinct call once with the access of the caller, and nothing else', async () => {
    const reads: Reads = []
    const family = stubFamily()
    const lease = await acquire(
      { commands: stubStore(new Map(), reads), bindings: family.bindings },
      f.admit,
      {
        continues: X,
        sources: [
          { message: requestWith(two).messages[0]!.id, call: X },
          { message: requestWith(two).messages[1]!.id, call: Y },
        ],
      },
    )
    expect(reads.map(read => read.access)).toEqual([
      { principal: f.principal, tenant: f.tenant, call: X },
      { principal: f.principal, tenant: f.tenant, call: Y },
    ])
    reportOf(measureWith(lease, requestWith(two)))
    expect(reads).toHaveLength(2)
    await lease.release()
  })

  it('refuses more distinct calls than the configured limit, a doubled message and a bad identity', async () => {
    const family = stubFamily()
    const resources = createModelPreparationResources<Principal>({
      commands: stubStore(new Map()),
      bindings: family.bindings,
      supplierOf,
      maxCitedCalls: 1,
    })
    const [m1, m2] = ids(requestWith(two))
    expect(
      await resources.acquire({
        ...f.admit,
        profile,
        lineage: { continues: X, sources: [{ message: m1!, call: Y }] },
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'lineage', reason: 'too-many-calls' } })
    expect(
      await resources.acquire({
        ...f.admit,
        profile,
        lineage: {
          sources: [
            { message: m1!, call: X },
            { message: m1!, call: X },
          ],
        },
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'lineage.sources', reason: 'duplicate-message' },
    })
    const forged: PreparationLineage = JSON.parse(JSON.stringify({ continues: 'not-a-call' }))
    expect(await resources.acquire({ ...f.admit, profile, lineage: forged })).toEqual({
      failure: { kind: 'invalid', field: 'lineage.continues', reason: 'identity' },
    })
    expect(family.given).toEqual([])
    void m2
  })

  it('releases the bindings it acquired when a later supplier fails, and never forms a narrower profile', async () => {
    const family = stubFamily()
    family.acquireFailures = 0
    const wide: ModelProfile = {
      ...profile,
      definition: { ...profile.definition, suppliers: [profileSupplier, profileSupplier] },
    }
    const resources = createModelPreparationResources<Principal>({
      commands: stubStore(new Map()),
      bindings: {
        acquire: async (supplier, signal) => {
          if (family.given.length === 1)
            return {
              failure: { kind: 'unavailable', dependency: 'stub-family', diagnostic: 'down' },
            }
          return family.bindings.acquire(supplier, signal)
        },
      },
      supplierOf,
      maxCitedCalls: 2,
    })
    expect(await resources.acquire({ ...f.admit, profile: wide })).toEqual({
      failure: { kind: 'unavailable', dependency: 'stub-family', diagnostic: 'down' },
    })
    expect(family.given).toHaveLength(1)
    expect(family.released).toBe(1)
  })

  it('refuses a supplier port that changes the route, and passes its own failure through', async () => {
    const family = stubFamily()
    const swapped = createModelPreparationResources<Principal>({
      commands: stubStore(new Map()),
      bindings: family.bindings,
      supplierOf: ({ supplier: declared }) => ({
        ok: { ...declared, model: 'another', credential: { kind: 'factory' } },
      }),
      maxCitedCalls: 2,
    })
    expect(await swapped.acquire({ ...f.admit, profile })).toEqual({
      failure: { kind: 'invalid', field: 'supplier', reason: 'route-mismatch' },
    })
    const refused = createModelPreparationResources<Principal>({
      commands: stubStore(new Map()),
      bindings: family.bindings,
      supplierOf: () => ({ failure: { kind: 'denied', action: 'credential' } }),
      maxCitedCalls: 2,
    })
    expect(await refused.acquire({ ...f.admit, profile })).toEqual({
      failure: { kind: 'denied', action: 'credential' },
    })
    expect(family.given).toEqual([])
  })

  it('refuses options no lease could use', () => {
    const family = stubFamily()
    for (const maxCitedCalls of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        createModelPreparationResources<Principal>({
          commands: stubStore(new Map()),
          bindings: family.bindings,
          supplierOf,
          maxCitedCalls,
        }),
      ).toThrow(RangeError)
  })
})

describe('release', () => {
  const f = fixture()

  it('is idempotent, releases each binding once, and a lineage meter answers unavailable afterwards', async () => {
    const family = stubFamily()
    const lease = await acquire(
      { commands: stubStore(new Map()), bindings: family.bindings },
      f.admit,
      { continues: X },
    )
    const first = lease.release()
    const second = lease.release()
    expect(second).toBe(first)
    expect(await first).toEqual({})
    expect(family.released).toBe(1)
    expect(measureWith(lease, requestWith(two))).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-preparation',
        diagnostic: 'preparation-lease-released',
      },
    })
    expect(family.calibrations).toEqual([])
  })

  it('a meter of a lease without a lineage answers unavailable after release as well', async () => {
    const family = stubFamily()
    const lease = await acquire(
      { commands: stubStore(new Map()), bindings: family.bindings },
      f.admit,
    )
    const input = inputWith(lease, requestWith(two))
    expect('ok' in lease.bindings[0].meter.measure(input)).toBe(true)
    expect(await lease.release()).toEqual({})
    expect(lease.bindings[0].meter.measure(input)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-preparation',
        diagnostic: 'preparation-lease-released',
      },
    })
    expect(family.calibrations).toHaveLength(1)
  })

  it('reports a failed release hook as a value that names the resource provider', async () => {
    const family = stubFamily()
    const lease = await acquire(
      { commands: stubStore(new Map()), bindings: family.bindings },
      f.admit,
    )
    family.failRelease = true
    expect(await lease.release()).toEqual({
      failure: { kind: 'unavailable', dependency: adoption.owner, diagnostic: 'release-failed' },
    })
    expect(await lease.release()).toEqual({
      failure: { kind: 'unavailable', dependency: adoption.owner, diagnostic: 'release-failed' },
    })
    expect(family.released).toBe(1)
  })
})
