// What both family meters share around the calibrated arithmetic: the meter itself (the supplier
// and representation checks, the refusal of pending media, the call of the arithmetic and the
// budget it returns), the calibration of a plain `measure`, the method name of a measurement, the
// input digest and the per-unit extra tokens. Pure. A family gives only its own values: its
// adoptions, how to read the units of its token input, its image rules, its tokenizer, the name of
// its output-group method and the diagnostic of an uncountable reasoning unit.
import { createHash } from 'node:crypto'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  BudgetCheck,
  MediaMeasurementFact,
  ModelCountingBasis,
  ModelInputMeter,
  ModelLimit,
  RequestBudget,
  TransportFailure,
  UpstreamLimit,
} from '@omne-harness/model-contract'
import type {
  CalibratedInputMeter,
  MeterCalibration,
  ModelTextTokenizer,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import {
  calibratedAmount,
  type CalibratedAmount,
  type CalibrationArithmeticInput,
} from './calibration.ts'

/** The method name suffix of a measurement that the anchor applied to. */
export const ANCHORED_METHOD = 'continuation-anchored/1'

/** The calibration of a plain `measure`: no anchor, no outputs. */
export const NO_CALIBRATION: MeterCalibration = Object.freeze({ anchor: null, outputs: [] })

/**
 * The method of a measurement: the meter adoption, with the output-group method of the family
 * appended when a unit was counted as the output of its source, then `ANCHORED_METHOD` when the
 * anchor applied. Each suffix follows a `+`. Owner, revision and digest stay the meter's.
 */
export function calibratedMethod(
  input: Readonly<{ meter: Adoption; outputGroup: string; amount: CalibratedAmount }>,
): Adoption {
  const { meter, outputGroup, amount } = input
  const suffixes = [
    ...(amount.substituted ? [outputGroup] : []),
    ...(amount.anchor?.kind === 'hit' ? [ANCHORED_METHOD] : []),
  ]
  return suffixes.length === 0
    ? meter
    : Object.freeze({ ...meter, name: `${meter.name}+${suffixes.join('+')}` })
}

/**
 * The `inputDigest` of a measurement: the SHA-256 hex of what the estimate depends on. A
 * calibration enters it only when it carries an anchor or an output, so a plain measurement keeps
 * the digest it had without calibration. A different anchor or output count is a different input.
 */
export function calibratedDigest(
  input: Readonly<{
    measure: Parameters<ModelInputMeter['measure']>[0]
    calibration: MeterCalibration
  }>,
): string {
  const { measure, calibration } = input
  const fixed = {
    profile: measure.profile,
    supplier: measure.supplier,
    context: measure.context,
    limits: measure.limits,
    parameters: measure.parameters,
    representation: {
      adoption: measure.representation.adoption,
      tokenInput: writeJsonText(measure.representation.tokenInput),
      media: measure.representation.media,
    },
    calibration:
      calibration.anchor === null && calibration.outputs.length === 0 ? undefined : calibration,
  }
  return createHash('sha256').update(JSON.stringify(fixed)).digest('hex')
}

/**
 * The `extra` of the calibrated arithmetic from the extra tokens of every unit. The arithmetic
 * calls it with the units it counts. Each call asks `perUnit` again and sums the units it names.
 * A unit without an entry adds zero. A failure of `perUnit` is the failure of the call.
 */
export function unitExtras(
  perUnit: () => Outcome<readonly bigint[], TransportFailure>,
): CalibrationArithmeticInput['extra'] {
  return indices => {
    const extras = perUnit()
    if (!('ok' in extras)) return extras
    return { ok: indices.reduce((sum, index) => sum + (extras.ok[index] ?? 0n), 0n) }
  }
}

/** The margin that every estimate of a family carries, from the family configuration. */
export type MeterMargin = Readonly<{
  /** A non-negative decimal integer: the margin is `ceil(amount * percent / 100)`. */
  percent: string
  /** The adoption of the margin policy that the assembly configured. */
  source: Adoption
}>

/** What the meter reads from one message unit of a token input: whether it carries reasoning state. */
export type MeteredUnit = Readonly<{ reasoning: boolean }>

/** What one family record gives the shared meter. The meter is a pure function of it. */
export type CalibratedMeterRules<U extends MeteredUnit> = Readonly<{
  /** The family owner: the `dependency` of an unavailability of the meter. */
  owner: string
  /** The supplier adoption of the record. The meter refuses any other supplier. */
  supplier: Adoption
  /** The adoptions of the record's meter, representation and media components. */
  adoptions: Readonly<{ meter: Adoption; representation: Adoption; media: Adoption }>
  basis: ModelCountingBasis
  margin: MeterMargin
  /** The method name suffix of a measurement that counted a unit as the output of its source. */
  outputGroup: string
  /** The diagnostic of a reasoning unit that no output count stands for. */
  uncountable: string
  /**
   * The family tokenizer and the form of the text it counts: the JSON text as written, or its
   * NFKC form.
   */
  tokens: Readonly<{ tokenizer: ModelTextTokenizer; form: 'as-written' | 'nfkc' }>
  /** The units of a token input of the family schema, in order, or `null` for another schema. */
  contentOf(tokenInput: JsonValue): readonly U[] | null
  /**
   * The extra tokens of each unit after the family image rules, in unit order, or the failure that
   * keeps an image out. The media facts stand for the images of the whole token input.
   */
  imageTokens(
    input: Readonly<{ units: readonly U[]; media: readonly MediaMeasurementFact[] }>,
  ): Outcome<readonly bigint[], TransportFailure>
}>

type MeasureInput = Parameters<ModelInputMeter['measure']>[0]

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function upstreamOf(entries: ModelLimit['upstream'], supplier: Adoption): UpstreamLimit {
  return entries.find(entry => sameAdoption(entry.supplier, supplier))?.limit ?? { kind: 'unknown' }
}

/** The input bound: the separate input limit, else the window less the output limit. */
function inputCheck<U extends MeteredUnit>(
  input: Readonly<{
    measure: MeasureInput
    rules: CalibratedMeterRules<U>
    amount: CalibratedAmount
  }>,
): BudgetCheck {
  const { measure, rules, amount } = input
  const supplier = measure.supplier.adoption
  const { context } = measure
  const separate = context.input
  const limit =
    separate === null
      ? BigInt(context.window.provided) - BigInt(context.output.provided)
      : BigInt(separate.provided)
  const upstream = upstreamOf((separate ?? context.window).upstream, supplier)
  return {
    supplier,
    metric: 'input-tokens',
    subject: 'request',
    measurement: {
      kind: 'estimate',
      amount: String(amount.amount),
      margin: String(amount.margin),
      method: calibratedMethod({
        meter: rules.adoptions.meter,
        outputGroup: rules.outputGroup,
        amount,
      }),
      marginSource: rules.margin.source,
    },
    limit: String(limit),
    constraint: { profile: measure.profile, upstream },
  }
}

/** The exact byte and count checks of the profile limits that apply to this request. */
function exactChecks(measure: MeasureInput, method: Adoption): readonly BudgetCheck[] {
  const supplier = measure.supplier.adoption
  const images = measure.representation.media.filter(fact => fact.kind === 'image')
  const checks: BudgetCheck[] = []
  for (const limit of measure.limits) {
    const constraint = { profile: measure.profile, upstream: upstreamOf(limit.upstream, supplier) }
    const check = (subject: string, amount: string): BudgetCheck => ({
      supplier,
      metric: limit.metric,
      subject,
      measurement: { kind: 'exact', amount, method },
      limit: limit.provided,
      constraint,
    })
    switch (limit.metric) {
      case 'image-bytes':
        for (const fact of images) checks.push(check(fact.reference.key, fact.bytes))
        break
      case 'image-count':
        checks.push(check('request', String(images.length)))
        break
      case 'request-bytes':
        if (measure.representation.kind === 'materialized')
          checks.push(check('request', measure.representation.requestBytes))
        break
      case 'voice-bytes':
      case 'voice-duration-ms':
        break
      default: {
        const _exhaustive: never = limit.metric
        return _exhaustive
      }
    }
  }
  return checks
}

/** Counts the JSON text of a token input, in the form the family counts. */
function countWith(
  tokens: CalibratedMeterRules<MeteredUnit>['tokens'],
  tokenInput: JsonValue,
): Outcome<bigint, TransportFailure> {
  const written = writeJsonText(tokenInput)
  const text = tokens.form === 'nfkc' ? written.normalize('NFKC') : written
  const counted = tokens.tokenizer.count([{ kind: 'text', text }])
  if (!('ok' in counted))
    return {
      failure: { kind: 'unavailable', dependency: 'tokenizer', diagnostic: counted.failure.kind },
    }
  return { ok: BigInt(counted.ok.tokens) }
}

function measureCalibrated<U extends MeteredUnit>(
  input: Readonly<{
    rules: CalibratedMeterRules<U>
    measure: MeasureInput
    calibration: MeterCalibration
  }>,
): Outcome<RequestBudget, TransportFailure> {
  const { rules, measure, calibration } = input
  const adapter = rules.adoptions.meter
  if (!sameAdoption(measure.supplier.adoption, rules.supplier))
    return { failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-meter' } }
  const { representation } = measure
  if (!sameAdoption(representation.adoption, rules.adoptions.representation))
    return { failure: { kind: 'unsupported', field: 'representation', adapter } }
  // Media that is not read yet has no pixels here; the media path is not part of this meter.
  if (representation.kind === 'pending-media')
    return { failure: { kind: 'unsupported', field: 'representation.kind', adapter } }
  const units = rules.contentOf(representation.tokenInput)
  if (units === null) return { failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' } }
  const amount = calibratedAmount({
    tokenInput: representation.tokenInput,
    units: representation.units,
    reasoning: units.map(unit => unit.reasoning),
    calibration,
    count: body => countWith(rules.tokens, body),
    extra: unitExtras(() => rules.imageTokens({ units, media: representation.media })),
    uncountable: rules.uncountable,
    dependency: rules.owner,
    marginPercent: rules.margin.percent,
  })
  if (!('ok' in amount)) return amount
  return {
    ok: {
      kind: 'complete',
      inputDigest: calibratedDigest({ measure, calibration }),
      checks: [
        inputCheck({ measure, rules, amount: amount.ok }),
        ...exactChecks(measure, rules.adoptions.media),
      ],
      counting: [rules.basis],
      ...(amount.ok.anchor === null ? {} : { calibration: { anchor: amount.ok.anchor } }),
    },
  }
}

/**
 * The calibrated meter of one family record. It refuses another supplier (`invalid`, `supplier`,
 * `not-this-meter`), another representation and pending media (`unsupported`), and a token input
 * of another schema (`invalid`, `tokenInput`, `schema`). Otherwise it calls `calibratedAmount` and
 * returns a complete budget: the input-token estimate with the method of `calibratedMethod` and
 * the margin source of the family, the exact checks of the profile limits, the counting basis, and
 * the anchor verdict when the calibration had an anchor. `measure(input)` is
 * `measureCalibrated(input, NO_CALIBRATION)`.
 */
export function createCalibratedMeter<U extends MeteredUnit>(
  rules: CalibratedMeterRules<U>,
): CalibratedInputMeter {
  return Object.freeze({
    basis: rules.basis,
    measure: (measure: MeasureInput) =>
      measureCalibrated({ rules, measure, calibration: NO_CALIBRATION }),
    measureCalibrated: (measure: MeasureInput, calibration: MeterCalibration) =>
      measureCalibrated({ rules, measure, calibration }),
  })
}
