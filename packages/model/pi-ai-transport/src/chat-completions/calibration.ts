// The calibrated arithmetic that both family meters share. Pure: the family says which units of
// its token input carry reasoning state, how to count a token input and what each unit adds beyond
// its text (images); this module decides what to count, what to replace by the output count of a
// source, and how the anchor and the margin combine. The methods come from the sealed pieces
// input-meters/marginal.ts (the complete envelope difference) and input-meters/output-history.ts
// (one output count per complete group), reshaped to the contract calibration.
import type { JsonEntry, JsonValue } from '@omne-harness/json-text'
import type {
  AnchorMiss,
  MeterRepresentation,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { MeterCalibration } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { ChatMessageId } from './vocabulary.ts'

export type CalibrationArithmeticInput = Readonly<{
  /** The token input of the family schema: an object whose `messages` member lists the units. */
  tokenInput: JsonValue
  /** `representation.units`: the message of each unit; `undefined` for a hand-made representation. */
  units: MeterRepresentation['units'] | undefined
  /** Per unit: true when the family does not tokenize it because it carries reasoning state. */
  reasoning: readonly boolean[]
  calibration: MeterCalibration
  /** Counts a token input of the family schema with the family tokenizer. */
  count(tokenInput: JsonValue): Outcome<bigint, TransportFailure>
  /** The tokens the family adds for these units beyond their text, after its image rules. */
  extra(units: readonly number[]): Outcome<bigint, TransportFailure>
  /** The diagnostic of a reasoning unit that no output count stands for. */
  uncountable: string
  /** The `dependency` of an unavailability this module returns. */
  dependency: string
  /** A non-negative decimal integer: the margin is `ceil(estimated * percent / 100)`. */
  marginPercent: string
}>

export type CalibratedAmount = Readonly<{
  /** The anchor (no margin) plus the estimated part. */
  amount: bigint
  /** `ceil(estimated * percent / 100)`: the margin of the estimated part only. */
  margin: bigint
  /** `null` when the calibration had no anchor. */
  anchor:
    | Readonly<{ kind: 'hit' }>
    | Readonly<{ kind: 'miss'; reason: Extract<AnchorMiss, 'continuation-shrank'> }>
    | null
  /** True when at least one unit was replaced by the output count of its source. */
  substituted: boolean
}>

type Estimate = Readonly<{
  /** The text count of the path: the whole body, or the envelope difference (may be negative). */
  text: bigint
  outputs: bigint
  extra: bigint
  substituted: boolean
}>

const DECIMAL = /^(0|[1-9][0-9]*)$/u

function invalid(field: string, reason: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'invalid', field, reason } }
}

function unavailable(dependency: string, diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency, diagnostic } }
}

function entriesOf(tokenInput: JsonValue): readonly JsonEntry[] | null {
  return tokenInput.kind === 'object' ? tokenInput.entries : null
}

/** The units of the `messages` member, or `null` when the token input is not an object with one. */
function unitsOf(entries: readonly JsonEntry[]): readonly JsonValue[] | null {
  const messages = entries.find(entry => entry.key === 'messages')?.value
  return messages?.kind === 'array' ? messages.items : null
}

/**
 * The same token input with these units as its messages. `anchored` leaves out the tools and the
 * tool choice: the anchor already holds them (sealed marginal.ts drops `tools` the same way).
 */
function withMessages(
  input: Readonly<{
    entries: readonly JsonEntry[]
    units: readonly JsonValue[]
    anchored: boolean
  }>,
): JsonValue {
  const { entries, units, anchored } = input
  return {
    kind: 'object',
    entries: entries.flatMap(entry => {
      if (entry.key === 'messages')
        return [{ key: entry.key, value: { kind: 'array', items: units } }]
      if (anchored && (entry.key === 'tools' || entry.key === 'tool_choice')) return []
      return [entry]
    }),
  }
}

function ceilPercent(amount: bigint, percent: bigint): bigint {
  return (amount * percent + 99n) / 100n
}

/** What the two paths of one measurement share. */
type Context = Readonly<{
  input: CalibrationArithmeticInput
  entries: readonly JsonEntry[]
  items: readonly JsonValue[]
  outputs: ReadonlyMap<ChatMessageId, MeterCalibration['outputs'][number]>
}>

/** The output count that stands for the reasoning unit at `index`, or the named unavailability. */
function outputOf(context: Context, index: number): Outcome<bigint, TransportFailure> {
  const { input } = context
  const message = input.units?.[index] ?? null
  const entry = message === null ? undefined : context.outputs.get(message)
  if (entry === undefined) return unavailable(input.dependency, input.uncountable)
  if (entry.kind === 'withheld') return unavailable(input.dependency, entry.reason)
  if (!DECIMAL.test(entry.outputTokens)) return invalid('calibration.outputs', 'output-tokens')
  return { ok: BigInt(entry.outputTokens) }
}

/**
 * The estimate over these units: the output counts of the reasoning units, the family image rules
 * of the others (before the tokenizer, as the family orders its checks), then the count of the
 * body, or the envelope difference when anchored.
 */
function estimateOf(
  request: Readonly<{ context: Context; indices: readonly number[]; anchored: boolean }>,
): Outcome<Estimate, TransportFailure> {
  const { context, indices, anchored } = request
  const { input, entries, items } = context
  let outputs = 0n
  let substituted = false
  const visible: number[] = []
  for (const index of indices) {
    if (input.reasoning[index] !== true) {
      visible.push(index)
      continue
    }
    const output = outputOf(context, index)
    if (!('ok' in output)) return output
    outputs += output.ok
    substituted = true
  }
  const extra = input.extra(visible)
  if (!('ok' in extra)) return extra
  const kept = visible.map(index => items[index]).filter(item => item !== undefined)
  // Without a replaced unit the full body is the token input itself, so the bytes are the same.
  const body =
    !anchored && kept.length === items.length
      ? input.tokenInput
      : withMessages({ entries, units: kept, anchored })
  const counted = input.count(body)
  if (!('ok' in counted)) return counted
  if (!anchored) return { ok: { text: counted.ok, outputs, extra: extra.ok, substituted } }
  const empty = input.count(withMessages({ entries, units: [], anchored: true }))
  if (!('ok' in empty)) return empty
  return { ok: { text: counted.ok - empty.ok, outputs, extra: extra.ok, substituted } }
}

/** The units after the covered prefix: those of a message that the anchor does not cover. */
function freshOf(
  units: NonNullable<CalibrationArithmeticInput['units']>,
  covered: ReadonlySet<ChatMessageId>,
): number[] {
  return units.flatMap((message, index) =>
    message !== null && !covered.has(message) ? [index] : [],
  )
}

/**
 * The anchored path: `null` when the envelope difference is negative (`continuation-shrank`), so
 * the full path answers.
 */
function anchoredAmount(
  input: Readonly<{
    context: Context
    anchor: NonNullable<MeterCalibration['anchor']>
    units: NonNullable<CalibrationArithmeticInput['units']>
    percent: bigint
  }>,
): Outcome<CalibratedAmount | null, TransportFailure> {
  const { context, anchor, units, percent } = input
  if (!DECIMAL.test(anchor.inputTotal)) return invalid('calibration.anchor', 'input-total')
  const estimate = estimateOf({
    context,
    indices: freshOf(units, new Set(anchor.covered)),
    anchored: true,
  })
  if (!('ok' in estimate)) return estimate
  if (estimate.ok.text < 0n) return { ok: null }
  const estimated = estimate.ok.text + estimate.ok.outputs + estimate.ok.extra
  return {
    ok: {
      amount: BigInt(anchor.inputTotal) + estimated,
      margin: ceilPercent(estimated, percent),
      anchor: { kind: 'hit' },
      substituted: estimate.ok.substituted,
    },
  }
}

/** The full path over every unit; `shrank` records that an anchor was tried and missed. */
function fullAmount(
  input: Readonly<{ context: Context; percent: bigint; shrank: boolean }>,
): Outcome<CalibratedAmount, TransportFailure> {
  const { context, percent, shrank } = input
  const estimate = estimateOf({
    context,
    indices: context.items.map((_, index) => index),
    anchored: false,
  })
  if (!('ok' in estimate)) return estimate
  const estimated = estimate.ok.text + estimate.ok.outputs + estimate.ok.extra
  return {
    ok: {
      amount: estimated,
      margin: ceilPercent(estimated, percent),
      anchor: shrank ? { kind: 'miss', reason: 'continuation-shrank' } : null,
      substituted: estimate.ok.substituted,
    },
  }
}

/**
 * The context of one measurement, or the failure of its input: a token input that is not an
 * object with a `messages` array, or a units side table of another length. Throws for a defect of
 * the family: reasoning flags that do not align with the units, or a margin that is not a decimal.
 */
function contextOf(input: CalibrationArithmeticInput): Outcome<Context, TransportFailure> {
  const entries = entriesOf(input.tokenInput)
  const items = entries === null ? null : unitsOf(entries)
  if (entries === null || items === null) return invalid('tokenInput', 'schema')
  if (input.reasoning.length !== items.length)
    throw new TypeError('the reasoning flags must align with the message units')
  if (!DECIMAL.test(input.marginPercent))
    throw new RangeError('marginPercent must be a non-negative decimal integer')
  if (input.units !== undefined && input.units.length !== items.length)
    return invalid('representation.units', 'length')
  return {
    ok: {
      input,
      entries,
      items,
      outputs: new Map(input.calibration.outputs.map(entry => [entry.message, entry])),
    },
  }
}

/**
 * Full metering: every unit counts, except that a unit with reasoning state is replaced by the
 * output count of its source (the complete-output-group method of sealed output-history.ts; each
 * family keeps the name of its own method). With an anchor: only the units after the covered
 * prefix count, by the complete envelope difference (`count(envelope + new units) − count(envelope
 * + [])`, sealed marginal.ts), and the anchor is added without margin. A negative difference
 * misses the anchor (`continuation-shrank`) and the full path answers. A reasoning unit whose
 * source is withheld, or absent, is a named unavailability on the path that needs it, never zero.
 */
export function calibratedAmount(
  input: CalibrationArithmeticInput,
): Outcome<CalibratedAmount, TransportFailure> {
  const checked = contextOf(input)
  if (!('ok' in checked)) return checked
  const context = checked.ok
  const percent = BigInt(input.marginPercent)
  const { anchor } = input.calibration
  if (anchor === null) return fullAmount({ context, percent, shrank: false })
  const { units } = input
  if (units === undefined) return invalid('representation.units', 'missing')
  const anchored = anchoredAmount({ context, anchor, units, percent })
  if (!('ok' in anchored)) return anchored
  return anchored.ok === null ? fullAmount({ context, percent, shrank: true }) : { ok: anchored.ok }
}
