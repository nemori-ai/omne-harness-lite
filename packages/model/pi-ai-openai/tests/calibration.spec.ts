// Calibrated metering through the real composition the request assembler uses: the production
// preparation lease of `@omne-harness/model` over this family through `composeFamilies`, with
// representations from the real `rules.plan`. The store is a `dispatches` stand-in: the storage
// port answers with dispatch records, denials or unavailability; the lease and the meter are real.
// Every expected amount is computed here with the o200k encoding over the token input.
import { describe, expect, it } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { createModelPreparationResources } from '@omne-harness/model'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  type DispatchRecord,
  type FixedModelRequest,
  type MeterRepresentation,
  type ModelCallId,
  type ModelFailure,
  type ModelInputMeter,
  type ModelPreparationLease,
  type PreparationLineage,
  type RequestBudget,
} from '@omne-harness/model-contract'
import { type ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { openAiTokenizerResources, type OpenAiRecord } from '@omne-harness/pi-ai-openai'
import { componentAdoption } from '../src/adoptions.ts'
import { ANCHORED_METHOD, createOpenAiMeter } from '../src/meter.ts'
import {
  assembledOf,
  bindingOf,
  callBlock,
  CONFIG,
  FAMILY,
  fixedRequest,
  imageBlock,
  message,
  officialProfile,
  recordNamed,
  resultBlock,
  stateBlock,
  supplierOf,
  textBlock,
  type RequestParts,
} from './support/openai.ts'

const SOL = recordNamed('openai/gpt-5.6-sol')
const ASTRA = recordNamed('openai/gpt-6-astra')
const o200k = getEncoding('o200k_base')
const count = (json: JsonValue): bigint => BigInt(o200k.encode(writeJsonText(json), [], []).length)
const ceil10 = (amount: bigint): bigint => (amount * 10n + 99n) / 100n

function unbox<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture failure: ${JSON.stringify(outcome.failure)}`)
}

/** A minted tenant and principal, borrowed from the contract's scripted conformance subject. */
const subject = createScriptedConformanceSubject()
const access = { principal: subject.principal, tenant: subject.tenant }

const X = unbox(decodeModelCallId('mcall_continued'))
const Y = unbox(decodeModelCallId('mcall_source'))
const PAYLOAD = JSON.stringify({
  type: 'reasoning.encrypted',
  format: 'openai-responses-v1',
  data: 'fixture-only-ciphertext',
})

// --- requests --------------------------------------------------------------------------------

const u1 = message('u1', 'user', [textBlock('b1', 'hello there')])
const a1 = message('a1', 'assistant', [textBlock('t1', 'Visible answer.')])
const a1Reasoning = message(
  'a1',
  'assistant',
  [textBlock('t1', 'Visible answer.'), stateBlock('s1', PAYLOAD)],
  { replay: { scope: 'openrouter/openai/gpt-5.6-sol', format: 'openai-responses-v1', at: [1] } },
)
const u2 = message('u2', 'user', [textBlock('b2', 'and then?')])
const SYSTEM = [textBlock('s0', 'Answer briefly.')]

const previous: RequestParts = { system: SYSTEM, messages: [u1, a1] }
const current: RequestParts = { system: SYSTEM, messages: [u1, a1, u2] }
const currentWithReasoning: RequestParts = { system: SYSTEM, messages: [u1, a1Reasoning, u2] }

const ids = (record: OpenAiRecord, parts: RequestParts) =>
  fixedRequest(record, parts).messages.map(item => item.id)

// --- the store stand-in -----------------------------------------------------------------------

type Counts = Readonly<{
  input?: string | null
  output?: string | null
  cacheRead?: string | null
  cacheWrite?: string | null
  reasoning?: string | null
}>

function counted(name: string, lexeme: string | null) {
  return lexeme === null
    ? ({ name, state: 'unknown', unit: 'token' } as const)
    : ({ name, state: 'known', lexeme, unit: 'token' } as const)
}

function accountOf(counts: Counts = {}): NonNullable<DispatchRecord['account']> {
  return {
    subject: { kind: 'model_call', id: X },
    receipt: 'received',
    usage: [
      counted('input', counts.input === undefined ? '400' : counts.input),
      counted('output', counts.output === undefined ? '18' : counts.output),
      counted('cache-read', counts.cacheRead === undefined ? '0' : counts.cacheRead),
      counted('cache-write', counts.cacheWrite === undefined ? '0' : counts.cacheWrite),
      counted('reasoning', counts.reasoning === undefined ? '11' : counts.reasoning),
    ],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'openrouter/OpenAI',
    duration: { state: 'unknown' },
    revision: '1',
  }
}

/** The accounted dispatch of a settled call of `record`, with the messages it sent. */
function recordOf(
  record: OpenAiRecord,
  overrides: Omit<Partial<DispatchRecord>, 'dispatch'> & Readonly<{ dispatch?: string }> = {},
): DispatchRecord {
  const { dispatch, ...rest } = overrides
  return {
    dispatch: unbox(decodeDispatchId(dispatch ?? 'mdisp_x')),
    supplier: supplierOf(record),
    intent: unbox(decodeModelOperationId('mop_intent')),
    send: 'started',
    firstContent: 'observed',
    terminal: { kind: 'completed', reason: 'stop' },
    account: accountOf(),
    materialization: {
      receipt: {
        supplier: supplierOf(record).adoption,
        representation: componentAdoption(record, 'representation'),
        payloadDigest: 'a'.repeat(64),
      },
      source: { owner: 'materializer', record: 'x', revision: '1', digest: '1'.repeat(64) },
    },
    ...rest,
  }
}

type Answers = ReadonlyMap<ModelCallId, Outcome<readonly DispatchRecord[], ModelFailure>>

const NOT_FOUND: Outcome<never, ModelFailure> = {
  failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
}

async function leaseOf(
  record: OpenAiRecord,
  answers: Answers,
  lineage?: PreparationLineage,
): Promise<ModelPreparationLease> {
  const resources = createModelPreparationResources<typeof subject.principal>({
    commands: {
      dispatches: input => Promise.resolve(answers.get(input.call) ?? NOT_FOUND),
    },
    bindings: composeFamilies([FAMILY]),
    supplierOf: ({ supplier }) => ({
      ok: {
        adoption: supplier.adoption,
        recipient: supplier.recipient,
        model: supplier.model,
        credential: { kind: 'factory' },
      },
    }),
    maxCitedCalls: 8,
  })
  const profile = officialProfile(record)
  return unbox(
    await resources.acquire(
      lineage === undefined ? { ...access, profile } : { ...access, profile, lineage },
    ),
  )
}

type Measured = ReturnType<ModelInputMeter['measure']>

/** Plans the request on the lease binding and measures through the lease meter. */
function measureOn(
  lease: ModelPreparationLease,
  record: OpenAiRecord,
  parts: RequestParts,
  change: (representation: MeterRepresentation) => MeterRepresentation = value => value,
): Readonly<{
  measured: Measured
  representation: MeterRepresentation
  request: FixedModelRequest
}> {
  const [binding] = lease.bindings
  const profile = officialProfile(record)
  const request = fixedRequest(record, parts)
  const planned = binding.rules.plan({
    profile,
    supplier: binding.supplier,
    assembled: assembledOf(request),
  })
  if (!('ok' in planned)) throw new Error(`plan: ${JSON.stringify(planned.failure)}`)
  const representation = change(planned.ok.representation)
  return {
    measured: binding.meter.measure({
      profile: profile.adoption,
      supplier: profile.definition.suppliers[0],
      context: profile.definition.context,
      limits: profile.definition.limits,
      assembled: assembledOf(request),
      parameters: planned.ok.parameters,
      representation,
    }),
    representation,
    request,
  }
}

function budgetOf(measured: Measured): RequestBudget {
  if (!('ok' in measured)) throw new Error(`measure: ${JSON.stringify(measured.failure)}`)
  return measured.ok
}

function inputCheckOf(budget: RequestBudget) {
  const check = budget.checks.find(item => item.metric === 'input-tokens')
  if (check === undefined || check.measurement.kind !== 'estimate') throw new Error('input check')
  return check.measurement
}

/** The message units of a token input, and the token input with other units and without tools. */
function unitsOf(tokenInput: JsonValue): readonly JsonValue[] {
  if (tokenInput.kind !== 'object') throw new Error('object token input')
  const messages = tokenInput.entries.find(entry => entry.key === 'messages')?.value
  if (messages?.kind !== 'array') throw new Error('messages array')
  return messages.items
}

function envelope(tokenInput: JsonValue, items: readonly JsonValue[]): JsonValue {
  if (tokenInput.kind !== 'object') throw new Error('object token input')
  return {
    kind: 'object',
    entries: tokenInput.entries.flatMap(entry => {
      if (entry.key === 'messages') return [{ key: entry.key, value: { kind: 'array', items } }]
      if (entry.key === 'tools' || entry.key === 'tool_choice') return []
      return [entry]
    }),
  }
}

function withoutUnit(tokenInput: JsonValue, index: number): JsonValue {
  if (tokenInput.kind !== 'object') throw new Error('object token input')
  const items = unitsOf(tokenInput).filter((_, position) => position !== index)
  return {
    kind: 'object',
    entries: tokenInput.entries.map(entry =>
      entry.key === 'messages' ? { key: entry.key, value: { kind: 'array', items } } : entry,
    ),
  }
}

const anchored = (record: OpenAiRecord) => ({ ...componentAdoption(record, 'meter') })

describe('the units side table of the representation', () => {
  it('names the message of every unit, including the dropped tool_internal and the merged tool images', async () => {
    const binding = await bindingOf(ASTRA)
    const parts: RequestParts = {
      system: SYSTEM,
      messages: [
        u1,
        message('a2', 'assistant', [callBlock('c1', 'call_1')]),
        message('i1', 'tool_internal', [textBlock('b9', 'internal note')]),
        message('t1', 'tool', [
          resultBlock('r1', 'call_1'),
          textBlock('b3', 'done'),
          imageBlock('i2'),
        ]),
        u2,
      ],
    }
    const request = fixedRequest(ASTRA, parts)
    const planned = unbox(
      binding.rules.plan({
        profile: officialProfile(ASTRA),
        supplier: supplierOf(ASTRA),
        assembled: assembledOf(request),
      }),
    )
    const [mu1, , , mt1, mu2] = request.messages.map(item => item.id)
    const a2 = request.messages[1]?.id
    expect(planned.representation.units).toEqual([null, mu1, a2, mt1, mt1, mu2])
    expect(planned.representation.units).toHaveLength(
      unitsOf(planned.representation.tokenInput).length,
    )
    await binding.release()
  })
})

describe('the continuation anchor', () => {
  it('without a lineage the lease hands out the family meter and the budget is byte for byte the plain one', async () => {
    const lease = await leaseOf(SOL, new Map())
    const binding = await bindingOf(SOL)
    const { measured, representation, request } = measureOn(lease, SOL, current)
    const plain = binding.meter.measure({
      profile: officialProfile(SOL).adoption,
      supplier: officialProfile(SOL).definition.suppliers[0],
      context: officialProfile(SOL).definition.context,
      limits: officialProfile(SOL).definition.limits,
      assembled: assembledOf(request),
      parameters: unbox(
        binding.rules.plan({
          profile: officialProfile(SOL),
          supplier: supplierOf(SOL),
          assembled: assembledOf(request),
        }),
      ).parameters,
      representation,
    })
    expect(JSON.stringify(measured)).toBe(JSON.stringify(plain))
    expect(budgetOf(measured)).not.toHaveProperty('calibration')
    expect(inputCheckOf(budgetOf(measured)).amount).toBe(String(count(representation.tokenInput)))
    expect(inputCheckOf(budgetOf(measured)).method).toEqual(componentAdoption(SOL, 'meter'))
    await Promise.all([lease.release(), binding.release()])
  })

  it('hits: the amount is the real input total of X plus the envelope difference of the new units, the margin on that difference only', async () => {
    const answers: Answers = new Map([
      [X, { ok: [recordOf(SOL, { messages: ids(SOL, previous) })] }],
    ])
    const lease = await leaseOf(SOL, answers, { continues: X })
    const { measured, representation } = measureOn(lease, SOL, current)
    const budget = budgetOf(measured)
    const items = unitsOf(representation.tokenInput)
    // units: [null (instruction), u1, a1, u2]; only u2 is new.
    expect(representation.units).toHaveLength(4)
    const delta =
      count(envelope(representation.tokenInput, [items[3]!])) -
      count(envelope(representation.tokenInput, []))
    expect(delta).toBeGreaterThan(0n)
    expect(budget.calibration).toEqual({ anchor: { kind: 'hit' } })
    expect(inputCheckOf(budget)).toEqual({
      kind: 'estimate',
      amount: String(400n + delta),
      margin: String(ceil10(delta)),
      method: { ...anchored(SOL), name: `${SOL.name}#meter+${ANCHORED_METHOD}` },
      marginSource: CONFIG.margin.source,
    })
    expect(budget.kind).toBe('complete')
    await lease.release()
  })

  it('the anchor and the output counts are part of the input digest', async () => {
    const lease = async (inputTotal: string) =>
      leaseOf(
        SOL,
        new Map([
          [
            X,
            {
              ok: [
                recordOf(SOL, {
                  messages: ids(SOL, previous),
                  account: accountOf({ input: inputTotal }),
                }),
              ],
            },
          ],
        ]),
        { continues: X },
      )
    const [a, b, plain] = await Promise.all([lease('400'), lease('401'), leaseOf(SOL, new Map())])
    const digests = [a, b, plain].map(
      item => budgetOf(measureOn(item, SOL, current).measured).inputDigest,
    )
    expect(new Set(digests).size).toBe(3)
    await Promise.all([a, b, plain].map(item => item.release()))
  })

  it.each([
    [
      'not-a-prefix',
      () => recordOf(SOL, { messages: ids(SOL, { system: SYSTEM, messages: [u1, u2] }) }),
    ],
    [
      'usage-unknown',
      () =>
        recordOf(SOL, { messages: ids(SOL, previous), account: accountOf({ cacheRead: null }) }),
    ],
    [
      'messages-unrecorded',
      () => {
        const { messages: _none, ...older } = recordOf(SOL)
        return older
      },
    ],
    [
      'supplier-changed',
      () =>
        recordOf(SOL, {
          messages: ids(SOL, previous),
          materialization: {
            receipt: {
              supplier: supplierOf(ASTRA).adoption,
              representation: componentAdoption(SOL, 'representation'),
              payloadDigest: 'a'.repeat(64),
            },
            source: { owner: 'materializer', record: 'x', revision: '1', digest: '1'.repeat(64) },
          },
        }),
    ],
    [
      'representation-changed',
      () =>
        recordOf(SOL, {
          messages: ids(SOL, previous),
          materialization: {
            receipt: {
              supplier: supplierOf(SOL).adoption,
              representation: componentAdoption(ASTRA, 'representation'),
              payloadDigest: 'a'.repeat(64),
            },
            source: { owner: 'materializer', record: 'x', revision: '1', digest: '1'.repeat(64) },
          },
        }),
    ],
  ] as const)(
    'misses (%s) and falls back to full metering with the reason reported',
    async (reason, record) => {
      const lease = await leaseOf(SOL, new Map([[X, { ok: [record()] }]]), { continues: X })
      const { measured, representation } = measureOn(lease, SOL, current)
      const budget = budgetOf(measured)
      expect(budget.calibration).toEqual({ anchor: { kind: 'miss', reason } })
      expect(inputCheckOf(budget)).toMatchObject({
        amount: String(count(representation.tokenInput)),
        margin: String(ceil10(count(representation.tokenInput))),
        method: componentAdoption(SOL, 'meter'),
      })
      await lease.release()
    },
  )

  it('misses as ambiguous-dispatch when X has two accounted dispatches', async () => {
    const two = [
      recordOf(SOL, { messages: ids(SOL, previous) }),
      recordOf(SOL, { messages: ids(SOL, previous), dispatch: 'mdisp_y' }),
    ]
    const lease = await leaseOf(SOL, new Map([[X, { ok: two }]]), { continues: X })
    expect(budgetOf(measureOn(lease, SOL, current).measured).calibration).toEqual({
      anchor: { kind: 'miss', reason: 'ambiguous-dispatch' },
    })
    await lease.release()
  })

  it('misses as units-missing when the representation has no side table', async () => {
    const lease = await leaseOf(
      SOL,
      new Map([[X, { ok: [recordOf(SOL, { messages: ids(SOL, previous) })] }]]),
      { continues: X },
    )
    const { measured, representation } = measureOn(
      lease,
      SOL,
      current,
      ({ units: _units, ...rest }) => rest,
    )
    const budget = budgetOf(measured)
    expect(budget.calibration).toEqual({ anchor: { kind: 'miss', reason: 'units-missing' } })
    expect(inputCheckOf(budget).amount).toBe(String(count(representation.tokenInput)))
    await lease.release()
  })

  it('a call of another tenant (denied) and a call that does not exist give the same budget and report', async () => {
    const other = unbox(decodeModelCallId('mcall_missing'))
    const denied = await leaseOf(
      SOL,
      new Map([[X, { failure: { kind: 'denied', action: 'account' } }]]),
      {
        continues: X,
        sources: [{ message: ids(SOL, current)[1]!, call: X }],
      },
    )
    const missing = await leaseOf(SOL, new Map(), {
      continues: other,
      sources: [{ message: ids(SOL, current)[1]!, call: other }],
    })
    const left = measureOn(denied, SOL, current).measured
    const right = measureOn(missing, SOL, current).measured
    expect(JSON.stringify(left)).toBe(JSON.stringify(right))
    expect(budgetOf(left).calibration).toEqual({
      anchor: { kind: 'miss', reason: 'call-unreadable' },
    })
    await Promise.all([denied.release(), missing.release()])
  })

  it('a store that cannot answer misses as facts-unavailable, and the lease still measures', async () => {
    const lease = await leaseOf(
      SOL,
      new Map([[X, { failure: { kind: 'unavailable', dependency: 'store', diagnostic: 'down' } }]]),
      { continues: X },
    )
    expect(budgetOf(measureOn(lease, SOL, current).measured).calibration).toEqual({
      anchor: { kind: 'miss', reason: 'facts-unavailable' },
    })
    await lease.release()
  })

  it('reports continuation-shrank and answers with full metering when the envelope difference is negative', async () => {
    // A tokenizer stand-in that real text never gives: a body without tools counts less with the
    // new unit than without it. The representation still comes from the real rules.plan.
    const binding = await bindingOf(SOL)
    const request = fixedRequest(SOL, current)
    const planned = unbox(
      binding.rules.plan({
        profile: officialProfile(SOL),
        supplier: supplierOf(SOL),
        assembled: assembledOf(request),
      }),
    )
    const shrinking: ModelTextTokenizer = {
      definition: openAiTokenizerResources().definition,
      count: segments => {
        const text = segments.map(segment => (segment.kind === 'text' ? segment.text : '')).join('')
        if (text.includes('"tools"')) return { ok: { tokens: String(text.length) } }
        return { ok: { tokens: text.includes('and then?') ? '1' : '50' } }
      },
    }
    const meter = createOpenAiMeter(SOL, shrinking, CONFIG.margin).instance
    const measured = meter.measureCalibrated(
      {
        profile: officialProfile(SOL).adoption,
        supplier: officialProfile(SOL).definition.suppliers[0],
        context: officialProfile(SOL).definition.context,
        limits: officialProfile(SOL).definition.limits,
        assembled: assembledOf(request),
        parameters: planned.parameters,
        representation: planned.representation,
      },
      { anchor: { covered: ids(SOL, previous), inputTotal: '400' }, outputs: [] },
    )
    const budget = budgetOf(measured)
    expect(budget.calibration).toEqual({ anchor: { kind: 'miss', reason: 'continuation-shrank' } })
    expect(inputCheckOf(budget)).toMatchObject({
      amount: String(writeJsonText(planned.representation.tokenInput).length),
      method: componentAdoption(SOL, 'meter'),
    })
    await binding.release()
  })

  it('answers unavailable after the lease was released', async () => {
    const lease = await leaseOf(SOL, new Map(), { continues: X })
    await lease.release()
    expect(measureOn(lease, SOL, current).measured).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-preparation',
        diagnostic: 'preparation-lease-released',
      },
    })
  })
})

describe('carried encrypted reasoning as the output count of its source (M5)', () => {
  const sourceAnswer = (counts: Counts = {}): Answers =>
    new Map([[Y, { ok: [recordOf(SOL, { account: accountOf(counts) })] }]])
  const sourcesOf = (record: OpenAiRecord) => [
    { message: ids(record, currentWithReasoning)[1]!, call: Y },
  ]

  it('estimates instead of unavailable: the unit is counted once as O, the rest is tokenized', async () => {
    const lease = await leaseOf(SOL, sourceAnswer({ output: '18' }), { sources: sourcesOf(SOL) })
    const { measured, representation } = measureOn(lease, SOL, currentWithReasoning)
    const budget = budgetOf(measured)
    // units: [null, u1, a1 (reasoning), u2]
    const estimated = count(withoutUnit(representation.tokenInput, 2)) + 18n
    expect(inputCheckOf(budget)).toEqual({
      kind: 'estimate',
      amount: String(estimated),
      margin: String(ceil10(estimated)),
      method: {
        ...anchored(SOL),
        name: `${SOL.name}#meter+openai-complete-output-group-workload-estimated/1`,
      },
      marginSource: CONFIG.margin.source,
    })
    expect(budget.calibration).toEqual({ anchor: { kind: 'miss', reason: 'not-declared' } })
    expect(writeJsonText(representation.tokenInput)).not.toContain('fixture-only-ciphertext')
    await lease.release()
  })

  it('anchored and substituted together: the anchor, the envelope difference of the new visible units and O', async () => {
    const answers: Answers = new Map([
      [X, { ok: [recordOf(SOL, { messages: ids(SOL, { system: SYSTEM, messages: [u1] }) })] }],
      [Y, { ok: [recordOf(SOL, { account: accountOf({ output: '18' }) })] }],
    ])
    const lease = await leaseOf(SOL, answers, { continues: X, sources: sourcesOf(SOL) })
    const { measured, representation } = measureOn(lease, SOL, currentWithReasoning)
    const budget = budgetOf(measured)
    const items = unitsOf(representation.tokenInput)
    const delta =
      count(envelope(representation.tokenInput, [items[3]!])) -
      count(envelope(representation.tokenInput, []))
    const estimated = delta + 18n
    expect(budget.calibration).toEqual({ anchor: { kind: 'hit' } })
    expect(inputCheckOf(budget)).toEqual({
      kind: 'estimate',
      amount: String(400n + estimated),
      margin: String(ceil10(estimated)),
      method: {
        ...anchored(SOL),
        name: `${SOL.name}#meter+openai-complete-output-group-workload-estimated/1+${ANCHORED_METHOD}`,
      },
      marginSource: CONFIG.margin.source,
    })
    await lease.release()
  })

  it('a reasoning unit inside the anchored prefix needs no source', async () => {
    const answers: Answers = new Map([
      [
        X,
        {
          ok: [
            recordOf(SOL, { messages: ids(SOL, { system: SYSTEM, messages: [u1, a1Reasoning] }) }),
          ],
        },
      ],
    ])
    const lease = await leaseOf(SOL, answers, { continues: X })
    const budget = budgetOf(measureOn(lease, SOL, currentWithReasoning).measured)
    expect(budget.calibration).toEqual({ anchor: { kind: 'hit' } })
    expect(inputCheckOf(budget).method.name).toBe(`${SOL.name}#meter+${ANCHORED_METHOD}`)
    await lease.release()
  })

  it.each([
    [
      'source-missing',
      () =>
        leaseOf(SOL, sourceAnswer(), {
          sources: [{ message: ids(SOL, currentWithReasoning)[0]!, call: Y }],
        }),
    ],
    [
      'source-unreadable',
      () =>
        leaseOf(SOL, new Map([[Y, { failure: { kind: 'denied', action: 'account' } }]]), {
          sources: sourcesOf(SOL),
        }),
    ],
    [
      'source-unavailable',
      () =>
        leaseOf(
          SOL,
          new Map([
            [Y, { failure: { kind: 'unavailable', dependency: 'store', diagnostic: 'down' } }],
          ]),
          { sources: sourcesOf(SOL) },
        ),
    ],
    [
      'ambiguous-dispatch',
      () =>
        leaseOf(
          SOL,
          new Map([[Y, { ok: [recordOf(SOL), recordOf(SOL, { dispatch: 'mdisp_y' })] }]]),
          { sources: sourcesOf(SOL) },
        ),
    ],
    [
      'output-unknown',
      () => leaseOf(SOL, sourceAnswer({ output: null }), { sources: sourcesOf(SOL) }),
    ],
    [
      'reasoning-exceeds-output',
      () =>
        leaseOf(SOL, sourceAnswer({ output: '10', reasoning: '11' }), { sources: sourcesOf(SOL) }),
    ],
    [
      'supplier-changed',
      () => leaseOf(SOL, new Map([[Y, { ok: [recordOf(ASTRA)] }]]), { sources: sourcesOf(SOL) }),
    ],
  ] as const)('%s is a named unavailability, never zero', async (reason, lease) => {
    const acquired = await lease()
    expect(measureOn(acquired, SOL, currentWithReasoning).measured).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: '@omne-harness/pi-ai-openai',
        diagnostic: reason,
      },
    })
    await acquired.release()
  })

  it('without any lineage the family keeps its own name for the missing source', async () => {
    const lease = await leaseOf(SOL, new Map())
    expect(measureOn(lease, SOL, currentWithReasoning).measured).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: '@omne-harness/pi-ai-openai',
        diagnostic: 'encrypted-reasoning-not-countable',
      },
    })
    await lease.release()
  })
})
