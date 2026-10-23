// The calibrated arithmetic that both family meters share. Pure: the family says which units of
// its token input carry reasoning state, how to count a token input and what each unit adds beyond
// its text (images); this module decides what to count, what to replace by the output count of a
// source, and how the anchor and the margin combine. The methods come from the sealed pieces
// input-meters/marginal.ts (the complete envelope difference) and input-meters/output-history.ts
// (one output count per complete group), reshaped to the contract calibration.
import type { JsonEntry, JsonValue } from '@omne-harness/json-text'
import type {
  AnchorMiss,
  MeterCalibration,
  MeterRepresentation,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'

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
  entries: readonly JsonEntry[],
  units: readonly JsonValue[],
  anchored: boolean,
): JsonValue {
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

/**
 * Full metering: every unit counts, except that a unit with reasoning state is replaced by the
 * output count of its source (the complete-output-group method of sealed output-history.ts; each
 * family keeps the name of its own method). With an anchor: only
 * the units after the covered prefix count, by the complete envelope difference
 * (`count(envelope + new units) − count(envelope + [])`, sealed marginal.ts), and the anchor is
 * added without margin. A negative difference misses the anchor (`continuation-shrank`) and the
 * full path answers. A reasoning unit whose source is withheld, or absent, is a named
 * unavailability on the path that needs it, never zero.
 */
export function calibratedAmount(
  input: CalibrationArithmeticInput,
): Outcome<CalibratedAmount, TransportFailure> {
  const entries = entriesOf(input.tokenInput)
  const items = entries === null ? null : unitsOf(entries)
  if (entries === null || items === null) return invalid('tokenInput', 'schema')
  if (input.reasoning.length !== items.length)
    throw new TypeError('the reasoning flags must align with the message units')
  if (!DECIMAL.test(input.marginPercent))
    throw new RangeError('marginPercent must be a non-negative decimal integer')
  const { units } = input
  if (units !== undefined && units.length !== items.length)
    return invalid('representation.units', 'length')
  const percent = BigInt(input.marginPercent)
  const outputs = new Map(input.calibration.outputs.map(entry => [entry.message, entry]))

  const outputOf = (index: number): Outcome<bigint, TransportFailure> => {
    const message = units?.[index] ?? null
    const entry = message === null ? undefined : outputs.get(message)
    if (entry === undefined) return unavailable(input.dependency, input.uncountable)
    if (entry.kind === 'withheld') return unavailable(input.dependency, entry.reason)
    if (!DECIMAL.test(entry.outputTokens)) return invalid('calibration.outputs', 'output-tokens')
    return { ok: BigInt(entry.outputTokens) }
  }

  const estimate = (
    indices: readonly number[],
    anchored: boolean,
  ): Outcome<Estimate, TransportFailure> => {
    let total = 0n
    let substituted = false
    const visible: number[] = []
    for (const index of indices) {
      if (input.reasoning[index] === true) {
        const output = outputOf(index)
        if (!('ok' in output)) return output
        total += output.ok
        substituted = true
      } else visible.push(index)
    }
    // The family image rules run before the tokenizer, as the family orders its checks.
    const extra = input.extra(visible)
    if (!('ok' in extra)) return extra
    const kept = visible.map(index => items[index]).filter(item => item !== undefined)
    // Without a replaced unit the full body is the token input itself, so the bytes are the same.
    const body =
      !anchored && kept.length === items.length
        ? input.tokenInput
        : withMessages(entries, kept, anchored)
    const counted = input.count(body)
    if (!('ok' in counted)) return counted
    let text = counted.ok
    if (anchored) {
      const empty = input.count(withMessages(entries, [], true))
      if (!('ok' in empty)) return empty
      text -= empty.ok
    }
    return { ok: { text, outputs: total, extra: extra.ok, substituted } }
  }

  const all = items.map((_, index) => index)
  const { anchor } = input.calibration
  let shrank = false
  if (anchor !== null) {
    if (units === undefined) return invalid('representation.units', 'missing')
    if (!DECIMAL.test(anchor.inputTotal)) return invalid('calibration.anchor', 'input-total')
    const covered = new Set<string>(anchor.covered)
    const fresh = all.filter(index => {
      const message = units[index]
      return message !== null && message !== undefined && !covered.has(message)
    })
    const anchored = estimate(fresh, true)
    if (!('ok' in anchored)) return anchored
    if (anchored.ok.text >= 0n) {
      const estimated = anchored.ok.text + anchored.ok.outputs + anchored.ok.extra
      return {
        ok: {
          amount: BigInt(anchor.inputTotal) + estimated,
          margin: ceilPercent(estimated, percent),
          anchor: { kind: 'hit' },
          substituted: anchored.ok.substituted,
        },
      }
    }
    shrank = true
  }
  const full = estimate(all, false)
  if (!('ok' in full)) return full
  const estimated = full.ok.text + full.ok.outputs + full.ok.extra
  return {
    ok: {
      amount: estimated,
      margin: ceilPercent(estimated, percent),
      anchor: shrank ? { kind: 'miss', reason: 'continuation-shrank' } : null,
      substituted: full.ok.substituted,
    },
  }
}
