import { sorted } from './json.ts'
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

export const ANCHORED_METHOD = 'continuation-anchored/1'

export const NO_CALIBRATION: MeterCalibration = Object.freeze({ anchor: null, outputs: [] })

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

export function calibratedDigest(
  input: Readonly<{
    measure: MeterFacts
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
      tokenInput: writeJsonText(sorted(measure.representation.tokenInput)),
      media: measure.representation.media,
    },
    calibration:
      calibration.anchor === null && calibration.outputs.length === 0 ? undefined : calibration,
  }
  return createHash('sha256').update(JSON.stringify(fixed)).digest('hex')
}

export function unitExtras(
  perUnit: () => Outcome<readonly bigint[], TransportFailure>,
): CalibrationArithmeticInput['extra'] {
  return indices => {
    const extras = perUnit()
    if (!('ok' in extras)) return extras
    return { ok: indices.reduce((sum, index) => sum + (extras.ok[index] ?? 0n), 0n) }
  }
}

export type MeterMargin = Readonly<{
  percent: string
  source: Adoption
}>

export type MeteredUnit = Readonly<{ reasoning: boolean }>

export type CalibratedMeterRules<U extends MeteredUnit> = Readonly<{
  owner: string
  supplier: Adoption
  adoptions: Readonly<{ meter: Adoption; representation: Adoption; media: Adoption }>
  basis: ModelCountingBasis
  margin: MeterMargin
  outputGroup: string
  uncountable: string
  tokens: Readonly<{ tokenizer: ModelTextTokenizer; form: 'as-written' | 'nfkc' }>
  contentOf(tokenInput: JsonValue): readonly U[] | null
  imageTokens(
    input: Readonly<{ units: readonly U[]; media: readonly MediaMeasurementFact[] }>,
  ): Outcome<readonly bigint[], TransportFailure>
}>

type MeasureInput = Parameters<ModelInputMeter['measure']>[0]
type MeterFacts = Omit<MeasureInput, 'assembled'>

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

function inputCheck<U extends MeteredUnit>(
  input: Readonly<{
    measure: MeterFacts
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

type Measured = readonly (readonly [subject: string, amount: string])[]

/** What each limit is checked against; bytes only once read: a pending image is read at the send, within its limit. */
function measuredOf(
  representation: MeterFacts['representation'],
): Record<MeterFacts['limits'][number]['metric'], Measured> {
  const images = representation.media.filter(fact => fact.kind === 'image')
  const read = representation.kind === 'materialized' ? representation : null
  return {
    'image-bytes': read === null ? [] : images.map(fact => [fact.reference.key, fact.bytes]),
    'image-count': [['request', String(images.length)]],
    'request-bytes': read === null ? [] : [['request', read.requestBytes]],
    'voice-bytes': [],
    'voice-duration-ms': [],
  }
}

function exactChecks(measure: MeterFacts, method: Adoption): readonly BudgetCheck[] {
  const supplier = measure.supplier.adoption
  const measured = measuredOf(measure.representation)
  return measure.limits.flatMap(limit => {
    const constraint = { profile: measure.profile, upstream: upstreamOf(limit.upstream, supplier) }
    return measured[limit.metric].map(([subject, amount]) => ({
      supplier,
      metric: limit.metric,
      subject,
      measurement: { kind: 'exact', amount, method },
      limit: limit.provided,
      constraint,
    }))
  })
}

async function countWith(
  tokens: CalibratedMeterRules<MeteredUnit>['tokens'],
  tokenInput: JsonValue,
): Promise<Outcome<bigint, TransportFailure>> {
  const written = writeJsonText(sorted(tokenInput))
  const text = tokens.form === 'nfkc' ? written.normalize('NFKC') : written
  const counted = await tokens.tokenizer.count([{ kind: 'text', text }])
  if (!('ok' in counted))
    return {
      failure: { kind: 'unavailable', dependency: 'tokenizer', diagnostic: counted.failure.kind },
    }
  return { ok: BigInt(counted.ok.tokens) }
}

async function measureCalibrated<U extends MeteredUnit>(
  input: Readonly<{
    rules: CalibratedMeterRules<U>
    measure: MeasureInput
    calibration: MeterCalibration
  }>,
): Promise<Outcome<RequestBudget, TransportFailure>> {
  const { rules, measure: submitted } = input
  const adapter = rules.adoptions.meter
  if (!sameAdoption(submitted.supplier.adoption, rules.supplier))
    return { failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-meter' } }
  const representation = submitted.representation
  if (!sameAdoption(representation.adoption, rules.adoptions.representation))
    return { failure: { kind: 'unsupported', field: 'representation', adapter } }
  const { assembled: _assembled, ...facts } = submitted
  const measure = structuredClone(facts)
  const calibration = structuredClone(input.calibration)
  const owned = measure.representation
  const units = rules.contentOf(owned.tokenInput)
  if (units === null) return { failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' } }
  const amount = await calibratedAmount({
    tokenInput: owned.tokenInput,
    units: owned.units,
    reasoning: units.map(unit => unit.reasoning),
    calibration,
    count: body => countWith(rules.tokens, body),
    extra: unitExtras(() => rules.imageTokens({ units, media: owned.media })),
    uncountable: rules.uncountable,
    dependency: rules.owner,
    marginPercent: rules.margin.percent,
  })
  if (!('ok' in amount)) return amount
  const pending:
    | Pick<Extract<RequestBudget, { kind: 'deferred-media' }>, 'kind' | 'references'>
    | { kind: 'complete' } =
    owned.kind === 'pending-media'
      ? { kind: 'deferred-media', references: owned.references }
      : { kind: 'complete' }
  return {
    ok: {
      ...pending,
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
