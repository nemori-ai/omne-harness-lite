// The calibrated arithmetic both families share: full metering with output-count substitution,
// the anchored envelope difference, the margin on the estimated part only, and the named
// unavailability of a reasoning unit no output count stands for. The counting function is a
// deterministic stand-in (the text length), so every expected number is computed in the test.
import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { MeterCalibration, OutputWithheld } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { TransportFailure } from '@omne-harness/model-contract'
import {
  calibratedAmount,
  type CalibrationArithmeticInput,
  type MeterUnits,
} from '../src/chat-completions/index.ts'
import { fixedRequest, message, testRecord, textBlock } from './support/chat-record.ts'

const str = (value: string): JsonValue => ({ kind: 'string', value })
const obj = (members: Record<string, JsonValue>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(members).map(([key, value]) => ({ key, value })),
})
const arr = (items: readonly JsonValue[]): JsonValue => ({ kind: 'array', items })

/** Real message identities through the contract judge: u1, a1 (with reasoning), u2. */
const ids = fixedRequest(testRecord(), {
  messages: [
    message('u1', 'user', [textBlock('b1', 'one')]),
    message('a1', 'assistant', [textBlock('b2', 'two')]),
    message('u2', 'user', [textBlock('b3', 'three')]),
  ],
}).messages.map(item => item.id)
const [U1, A1, U2] = ids
if (U1 === undefined || A1 === undefined || U2 === undefined) throw new Error('fixture ids')

const unit = (role: string, text: string, reasoning = false): JsonValue =>
  obj({
    role: str(role),
    content: arr([obj({ type: str('text'), text: str(text) })]),
    ...(reasoning ? { reasoning_details: obj({ opaque: str('1') }) } : {}),
  })

const tokenInput = obj({
  messages: arr([
    obj({ role: str('system'), content: arr([obj({ type: str('text'), text: str('rules') })]) }),
    unit('user', 'one'),
    unit('assistant', 'two', true),
    unit('user', 'three'),
  ]),
  tools: arr([obj({ name: str('lookup') })]),
  tool_choice: str('auto'),
  parameters: str('[]'),
})
const units: MeterUnits = [null, U1, A1, U2]
const reasoning = [false, false, true, false]
const NONE: MeterCalibration = { anchor: null, outputs: [] }

type Call = Readonly<{ body: JsonValue; text: string }>

function harness(count: (text: string) => bigint = text => BigInt(text.length)): Readonly<{
  counts: Call[]
  extras: (readonly number[])[]
  input(partial: Partial<CalibrationArithmeticInput>): CalibrationArithmeticInput
}> {
  const counts: Call[] = []
  const extras: (readonly number[])[] = []
  return {
    counts,
    extras,
    input: partial => ({
      tokenInput,
      units,
      reasoning,
      calibration: NONE,
      count: (body): Outcome<bigint, TransportFailure> => {
        const text = writeJsonText(body)
        counts.push({ body, text })
        return { ok: count(text) }
      },
      extra: indices => {
        extras.push(indices)
        return { ok: 0n }
      },
      uncountable: 'reasoning-not-countable',
      dependency: 'test-family',
      marginPercent: '10',
      ...partial,
    }),
  }
}

const len = (body: JsonValue): bigint => BigInt(writeJsonText(body).length)
const ceil10 = (amount: bigint): bigint => (amount * 10n + 99n) / 100n

/** The token input with these message units, the tools and the tool choice left out. */
function envelope(items: readonly JsonValue[]): JsonValue {
  return obj({ messages: arr(items), parameters: str('[]') })
}

/** The token input with these message units and everything else kept. */
function whole(items: readonly JsonValue[]): JsonValue {
  return obj({
    messages: arr(items),
    tools: arr([obj({ name: str('lookup') })]),
    tool_choice: str('auto'),
    parameters: str('[]'),
  })
}

function messagesOf(body: JsonValue): readonly JsonValue[] {
  if (body.kind !== 'object') throw new Error('an object token input')
  const messages = body.entries.find(entry => entry.key === 'messages')?.value
  if (messages?.kind !== 'array') throw new Error('a messages array')
  return messages.items
}

const items = messagesOf(tokenInput)

describe('full metering', () => {
  it('without a calibration and without a reasoning unit counts the token input itself once, with the margin on the whole', () => {
    const plain = obj({ messages: arr([items[0]!, items[1]!, items[3]!]), tools: arr([]) })
    const h = harness()
    const outcome = calibratedAmount(
      h.input({ tokenInput: plain, units: [null, U1, U2], reasoning: [false, false, false] }),
    )
    expect(outcome).toEqual({
      ok: { amount: len(plain), margin: ceil10(len(plain)), anchor: null, substituted: false },
    })
    expect(h.counts).toHaveLength(1)
    expect(h.counts[0]?.body).toBe(plain)
    expect(h.extras).toEqual([[0, 1, 2]])
  })

  it('replaces a reasoning unit by the output count of its source and counts the other units', () => {
    const h = harness()
    const outcome = calibratedAmount(
      h.input({
        calibration: {
          anchor: null,
          outputs: [{ message: A1, kind: 'known', outputTokens: '40' }],
        },
      }),
    )
    const kept = whole([items[0]!, items[1]!, items[3]!])
    const estimated = len(kept) + 40n
    expect(outcome).toEqual({
      ok: { amount: estimated, margin: ceil10(estimated), anchor: null, substituted: true },
    })
    expect(h.counts.map(call => call.text)).toEqual([writeJsonText(kept)])
    expect(h.extras).toEqual([[0, 1, 3]])
  })

  it('a reasoning unit that no output count stands for is the named unavailability of the family', () => {
    const h = harness()
    expect(calibratedAmount(h.input({}))).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'test-family',
        diagnostic: 'reasoning-not-countable',
      },
    })
    expect(h.counts).toEqual([])
    // Without units the unit cannot be looked up either: the same named unavailability.
    expect(calibratedAmount({ ...h.input({}), units: undefined })).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'test-family',
        diagnostic: 'reasoning-not-countable',
      },
    })
  })

  it.each([
    'source-missing',
    'source-unreadable',
    'source-unavailable',
    'ambiguous-dispatch',
    'output-unknown',
    'reasoning-exceeds-output',
    'supplier-changed',
  ] as const satisfies readonly OutputWithheld[])(
    'a withheld source (%s) is a named unavailability, never zero',
    reason => {
      const h = harness()
      expect(
        calibratedAmount(
          h.input({
            calibration: { anchor: null, outputs: [{ message: A1, kind: 'withheld', reason }] },
          }),
        ),
      ).toEqual({ failure: { kind: 'unavailable', dependency: 'test-family', diagnostic: reason } })
      expect(h.counts).toEqual([])
    },
  )

  it('adds the extra tokens of the counted units and never those of a replaced unit', () => {
    const h = harness()
    h.input({}).extra([])
    const outcome = calibratedAmount({
      ...h.input({
        calibration: { anchor: null, outputs: [{ message: A1, kind: 'known', outputTokens: '1' }] },
      }),
      extra: indices => ({ ok: BigInt(indices.length) * 7n }),
    })
    const kept = whole([items[0]!, items[1]!, items[3]!])
    const estimated = len(kept) + 1n + 21n
    expect(outcome).toEqual({
      ok: { amount: estimated, margin: ceil10(estimated), anchor: null, substituted: true },
    })
  })
})

describe('anchored metering', () => {
  const anchorOf = (covered: readonly (typeof U1)[], inputTotal = '1000') => ({
    covered,
    inputTotal,
  })

  it('counts only the units after the covered prefix, against the envelope without tools, and adds the anchor without margin', () => {
    const h = harness()
    const outcome = calibratedAmount(
      h.input({
        reasoning: [false, false, false, false],
        calibration: { anchor: anchorOf([U1, A1]), outputs: [] },
      }),
    )
    const withNew = envelope([items[3]!])
    const empty = envelope([])
    const delta = len(withNew) - len(empty)
    expect(outcome).toEqual({
      ok: {
        amount: 1000n + delta,
        margin: ceil10(delta),
        anchor: { kind: 'hit' },
        substituted: false,
      },
    })
    expect(h.counts.map(call => call.text)).toEqual([writeJsonText(withNew), writeJsonText(empty)])
    for (const call of h.counts) expect(call.text).not.toContain('"tools"')
    expect(h.extras).toEqual([[3]])
  })

  it('a reasoning unit inside the prefix needs no source; a new one is counted as the output of its source', () => {
    const inside = harness()
    expect(
      calibratedAmount(inside.input({ calibration: { anchor: anchorOf([U1, A1]), outputs: [] } })),
    ).toMatchObject({ ok: { anchor: { kind: 'hit' }, substituted: false } })

    const after = harness()
    expect(
      calibratedAmount(after.input({ calibration: { anchor: anchorOf([U1]), outputs: [] } })),
    ).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'test-family',
        diagnostic: 'reasoning-not-countable',
      },
    })

    const known = harness()
    const outcome = calibratedAmount(
      known.input({
        calibration: {
          anchor: anchorOf([U1], '300'),
          outputs: [{ message: A1, kind: 'known', outputTokens: '40' }],
        },
      }),
    )
    const delta = len(envelope([items[3]!])) - len(envelope([]))
    expect(outcome).toEqual({
      ok: {
        amount: 300n + delta + 40n,
        margin: ceil10(delta + 40n),
        anchor: { kind: 'hit' },
        substituted: true,
      },
    })
    expect(known.extras).toEqual([[3]])
  })

  it('the request sent again, every unit covered, hits with a zero estimate and no margin', () => {
    const h = harness()
    expect(
      calibratedAmount(
        h.input({
          reasoning: [false, false, false, false],
          calibration: { anchor: anchorOf([U1, A1, U2], '512'), outputs: [] },
        }),
      ),
    ).toEqual({ ok: { amount: 512n, margin: 0n, anchor: { kind: 'hit' }, substituted: false } })
  })

  it('a negative envelope difference misses as continuation-shrank and the full path answers', () => {
    // The stand-in counter shrinks on the new unit: a non-monotonic count that real text never gives.
    const h = harness(text =>
      text.includes('"tools"') ? BigInt(text.length) : text.includes('three') ? 5n : 50n,
    )
    const outcome = calibratedAmount(
      h.input({
        reasoning: [false, false, false, false],
        calibration: { anchor: anchorOf([U1, A1]), outputs: [] },
      }),
    )
    expect(outcome).toEqual({
      ok: {
        amount: len(tokenInput),
        margin: ceil10(len(tokenInput)),
        anchor: { kind: 'miss', reason: 'continuation-shrank' },
        substituted: false,
      },
    })
    expect(h.counts).toHaveLength(3)
    expect(h.counts[2]?.body).toBe(tokenInput)
  })

  it('refuses units that do not align, an anchor without units and an anchor total that is not a count', () => {
    const h = harness()
    expect(calibratedAmount(h.input({ units: [null, U1] }))).toEqual({
      failure: { kind: 'invalid', field: 'representation.units', reason: 'length' },
    })
    expect(
      calibratedAmount({
        ...h.input({
          reasoning: [false, false, false, false],
          calibration: { anchor: anchorOf([U1]), outputs: [] },
        }),
        units: undefined,
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'representation.units', reason: 'missing' },
    })
    expect(
      calibratedAmount(
        h.input({
          reasoning: [false, false, false, false],
          calibration: { anchor: anchorOf([U1], '12.5'), outputs: [] },
        }),
      ),
    ).toEqual({ failure: { kind: 'invalid', field: 'calibration.anchor', reason: 'input-total' } })
    expect(calibratedAmount(h.input({ tokenInput: str('not an object') }))).toEqual({
      failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' },
    })
    expect(() => calibratedAmount(h.input({ reasoning: [false] }))).toThrow(TypeError)
  })
})
