// Calibrated metering through the real composition the request assembler uses: the production
// preparation lease of `@omne-harness/model` over this family through `composeFamilies`, with
// representations from the real `rules.plan`. The store is a `dispatches` stand-in; the lease and
// the meter are real. Expected amounts are computed here with the legacy Claude BPE over the NFKC
// form of the token input, as the meter counts.
import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { createModelPreparationResources } from '@omne-harness/model'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  type DispatchRecord,
  type MeterRepresentation,
  type ModelCallId,
  type ModelFailure,
  type ModelInputMeter,
  type ModelPreparationLease,
  type PreparationLineage,
  type RequestBudget,
} from '@omne-harness/model-contract'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { anthropicTokenizerResources, type AnthropicRecord } from '@omne-harness/pi-ai-anthropic'
import { createTiktokenTokenizer } from '@omne-harness/tokenizer-tiktoken'
import { componentAdoption } from '../src/adoptions.ts'
import { ANCHORED_METHOD } from '../src/meter.ts'
import {
  assembledOf,
  bindingOf,
  CONFIG,
  FAMILY,
  fixedRequest,
  message,
  officialProfile,
  recordNamed,
  stateBlock,
  supplierOf,
  textBlock,
  thinkingBlock,
  type RequestParts,
} from './support/anthropic.ts'

const SONNET = recordNamed('anthropic/claude-sonnet-5')
const OPUS = recordNamed('anthropic/claude-opus-5')
const claude = (() => {
  const created = createTiktokenTokenizer(anthropicTokenizerResources())
  if (!('ok' in created)) throw new Error(JSON.stringify(created.failure))
  return created.ok
})()
const count = (json: JsonValue): bigint => {
  const counted = claude.count([{ kind: 'text', text: writeJsonText(json).normalize('NFKC') }])
  if (!('ok' in counted)) throw new Error(JSON.stringify(counted.failure))
  return BigInt(counted.ok.tokens)
}
const ceil10 = (amount: bigint): bigint => (amount * 10n + 99n) / 100n

function unbox<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture failure: ${JSON.stringify(outcome.failure)}`)
}

const subject = createScriptedConformanceSubject()
const access = { principal: subject.principal, tenant: subject.tenant }
const X = unbox(decodeModelCallId('mcall_continued'))
const Y = unbox(decodeModelCallId('mcall_source'))
const GROUP = JSON.stringify([
  {
    format: 'anthropic-claude-v1',
    index: 0,
    signature: 'fixture-only-signature',
    text: 'signed thinking',
    type: 'reasoning.text',
  },
])

const u1 = message('u1', 'user', [textBlock('b1', 'hello there')])
const a1 = message('a1', 'assistant', [textBlock('t1', 'Answer.')])
const a1Signed = message(
  'a1',
  'assistant',
  [
    thinkingBlock('k1', 'signed thinking'),
    textBlock('t1', 'Answer.'),
    stateBlock('s1', GROUP, ['k1']),
  ],
  {
    replay: {
      scope: 'openrouter/anthropic/claude-sonnet-5',
      format: 'anthropic-claude-v1',
      at: [2],
    },
  },
)
const u2 = message('u2', 'user', [textBlock('b2', 'and then?')])
const SYSTEM = [textBlock('s0', 'Answer briefly.')]
const previous: RequestParts = { system: SYSTEM, messages: [u1, a1] }
const current: RequestParts = { system: SYSTEM, messages: [u1, a1, u2] }
const currentSigned: RequestParts = { system: SYSTEM, messages: [u1, a1Signed, u2] }
const ids = (record: AnthropicRecord, parts: RequestParts) =>
  fixedRequest(record, parts).messages.map(item => item.id)

type Counts = Readonly<{ input?: string | null; output?: string | null; reasoning?: string | null }>

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
      counted('input', counts.input === undefined ? '980' : counts.input),
      counted('output', counts.output === undefined ? '31' : counts.output),
      counted('cache-read', '0'),
      counted('cache-write', '20'),
      counted('reasoning', counts.reasoning === undefined ? '7' : counts.reasoning),
    ],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'openrouter/Anthropic',
    duration: { state: 'unknown' },
    revision: '1',
  }
}

function recordOf(
  record: AnthropicRecord,
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
  answers: Answers,
  lineage?: PreparationLineage,
): Promise<ModelPreparationLease> {
  const resources = createModelPreparationResources<typeof subject.principal>({
    commands: { dispatches: input => Promise.resolve(answers.get(input.call) ?? NOT_FOUND) },
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
  const profile = officialProfile(SONNET)
  return unbox(
    await resources.acquire(
      lineage === undefined ? { ...access, profile } : { ...access, profile, lineage },
    ),
  )
}

type Measured = ReturnType<ModelInputMeter['measure']>

function measureOn(
  lease: ModelPreparationLease,
  parts: RequestParts,
): Readonly<{ measured: Measured; representation: MeterRepresentation }> {
  const [binding] = lease.bindings
  const profile = officialProfile(SONNET)
  const request = fixedRequest(SONNET, parts)
  const planned = unbox(
    binding.rules.plan({ profile, supplier: binding.supplier, assembled: assembledOf(request) }),
  )
  return {
    measured: binding.meter.measure({
      profile: profile.adoption,
      supplier: profile.definition.suppliers[0],
      context: profile.definition.context,
      limits: profile.definition.limits,
      assembled: assembledOf(request),
      parameters: planned.parameters,
      representation: planned.representation,
    }),
    representation: planned.representation,
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

describe('the continuation anchor', () => {
  it('without a lineage the lease hands out the family meter and the budget is byte for byte the plain one', async () => {
    const lease = await leaseOf(new Map())
    const binding = await bindingOf(SONNET)
    const { measured, representation } = measureOn(lease, current)
    const profile = officialProfile(SONNET)
    const request = fixedRequest(SONNET, current)
    const plain = binding.meter.measure({
      profile: profile.adoption,
      supplier: profile.definition.suppliers[0],
      context: profile.definition.context,
      limits: profile.definition.limits,
      assembled: assembledOf(request),
      parameters: unbox(
        binding.rules.plan({
          profile,
          supplier: supplierOf(SONNET),
          assembled: assembledOf(request),
        }),
      ).parameters,
      representation,
    })
    expect(JSON.stringify(measured)).toBe(JSON.stringify(plain))
    expect(budgetOf(measured)).not.toHaveProperty('calibration')
    expect(representation.units).toEqual([null, ...ids(SONNET, current)])
    await Promise.all([lease.release(), binding.release()])
  })

  it('hits: the real input total of X (input, cache-read and cache-write) plus the NFKC envelope difference of the new unit', async () => {
    const lease = await leaseOf(
      new Map([[X, { ok: [recordOf(SONNET, { messages: ids(SONNET, previous) })] }]]),
      { continues: X },
    )
    const { measured, representation } = measureOn(lease, current)
    const budget = budgetOf(measured)
    const items = unitsOf(representation.tokenInput)
    const delta =
      count(envelope(representation.tokenInput, [items[3]!])) -
      count(envelope(representation.tokenInput, []))
    expect(delta).toBeGreaterThan(0n)
    expect(budget.calibration).toEqual({ anchor: { kind: 'hit' } })
    expect(inputCheckOf(budget)).toEqual({
      kind: 'estimate',
      amount: String(1000n + delta),
      margin: String(ceil10(delta)),
      method: {
        ...componentAdoption(SONNET, 'meter'),
        name: `${SONNET.name}#meter+${ANCHORED_METHOD}`,
      },
      marginSource: CONFIG.margin.source,
    })
    await lease.release()
  })

  it('misses as not-a-prefix and supplier-changed with full metering', async () => {
    const cases = [
      [
        'not-a-prefix',
        recordOf(SONNET, { messages: ids(SONNET, { system: SYSTEM, messages: [u1, u2] }) }),
      ],
      ['supplier-changed', recordOf(OPUS, { messages: ids(SONNET, previous) })],
    ] as const
    for (const [reason, record] of cases) {
      const lease = await leaseOf(new Map([[X, { ok: [record] }]]), { continues: X })
      const { measured, representation } = measureOn(lease, current)
      const budget = budgetOf(measured)
      expect(budget.calibration).toEqual({ anchor: { kind: 'miss', reason } })
      expect(inputCheckOf(budget)).toMatchObject({
        amount: String(count(representation.tokenInput)),
        method: componentAdoption(SONNET, 'meter'),
      })
      await lease.release()
    }
  })
})

describe('a carried signed group as the output count of its source (M5)', () => {
  const sources = () => [{ message: ids(SONNET, currentSigned)[1]!, call: Y }]

  it('estimates instead of unavailable: the unit is counted once as O, the rest is tokenized', async () => {
    const lease = await leaseOf(
      new Map([[Y, { ok: [recordOf(SONNET, { account: accountOf({ output: '31' }) })] }]]),
      {
        sources: sources(),
      },
    )
    const { measured, representation } = measureOn(lease, currentSigned)
    const budget = budgetOf(measured)
    const estimated = count(withoutUnit(representation.tokenInput, 2)) + 31n
    expect(inputCheckOf(budget)).toEqual({
      kind: 'estimate',
      amount: String(estimated),
      margin: String(ceil10(estimated)),
      method: {
        ...componentAdoption(SONNET, 'meter'),
        name: `${SONNET.name}#meter+anthropic-complete-signed-encrypted-output-zero-framing-estimated/1`,
      },
      marginSource: CONFIG.margin.source,
    })
    expect(writeJsonText(representation.tokenInput)).not.toContain('fixture-only-signature')
    await lease.release()
  })

  it.each([
    [
      'source-missing',
      () =>
        leaseOf(new Map([[Y, { ok: [recordOf(SONNET)] }]]), {
          sources: [{ message: ids(SONNET, currentSigned)[0]!, call: Y }],
        }),
    ],
    [
      'source-unreadable',
      () =>
        leaseOf(new Map([[Y, { failure: { kind: 'denied', action: 'account' } }]]), {
          sources: sources(),
        }),
    ],
    [
      'source-unavailable',
      () =>
        leaseOf(
          new Map([
            [Y, { failure: { kind: 'unavailable', dependency: 'store', diagnostic: 'down' } }],
          ]),
          { sources: sources() },
        ),
    ],
    [
      'ambiguous-dispatch',
      () =>
        leaseOf(
          new Map([[Y, { ok: [recordOf(SONNET), recordOf(SONNET, { dispatch: 'mdisp_y' })] }]]),
          { sources: sources() },
        ),
    ],
    [
      'output-unknown',
      () =>
        leaseOf(
          new Map([[Y, { ok: [recordOf(SONNET, { account: accountOf({ output: null }) })] }]]),
          { sources: sources() },
        ),
    ],
    [
      'reasoning-exceeds-output',
      () =>
        leaseOf(
          new Map([
            [
              Y,
              { ok: [recordOf(SONNET, { account: accountOf({ output: '5', reasoning: '7' }) })] },
            ],
          ]),
          { sources: sources() },
        ),
    ],
    [
      'supplier-changed',
      () => leaseOf(new Map([[Y, { ok: [recordOf(OPUS)] }]]), { sources: sources() }),
    ],
  ] as const)('%s is a named unavailability, never zero', async (reason, lease) => {
    const acquired = await lease()
    expect(measureOn(acquired, currentSigned).measured).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: '@omne-harness/pi-ai-anthropic',
        diagnostic: reason,
      },
    })
    await acquired.release()
  })

  it('without any lineage the family keeps its own name for the missing source', async () => {
    const lease = await leaseOf(new Map())
    expect(measureOn(lease, currentSigned).measured).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: '@omne-harness/pi-ai-anthropic',
        diagnostic: 'signed-reasoning-not-countable',
      },
    })
    await lease.release()
  })
})
