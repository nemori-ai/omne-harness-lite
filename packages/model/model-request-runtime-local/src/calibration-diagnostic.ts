import {
  copyJsonValue,
  isJsonNumber,
  jsonNumberSource,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { BoundCredentialRedaction } from '@omne-harness-lite/model-request-runtime'
import type {
  DiagnosticBinding,
  DiagnosticMeasurementFact,
  DiagnosticCalibrationSource,
} from '@omne-harness-lite/model-request-runtime'

export const measurementDiagnosticKeys = [
  'kind',
  'mode',
  'fallbackReason',
  'basis',
  'precision',
  'predictedInput',
  'admissionTokens',
  'fullContribution',
  'replayContribution',
  'newContribution',
  'calibrationSource',
] as const
const basisKeys = [
  'model',
  'provider',
  'tokenizerRevision',
  'meterRevision',
  'replayRevision',
  'transformRevision',
  'projectionRevision',
] as const
const precisions = ['exact', 'upperBound', 'estimated']
const fallbackReasons = ['no_observation', 'source_unavailable', 'prefix_changed', 'basis_changed']

/** Read data descriptors only. Neither unknown keys nor getters become a projection. */
function data(raw: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  try {
    if (
      ![null, Object.prototype].includes(Object.getPrototypeOf(raw)) ||
      Object.getOwnPropertySymbols(raw).length
    )
      return undefined
    const result: Record<string, unknown> = Object.create(null)
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(raw))) {
      if (!keys.includes(key) || !descriptor.enumerable || !('value' in descriptor))
        return undefined
      if (descriptor.value !== undefined) result[key] = descriptor.value
    }
    return result
  } catch {
    return undefined
  }
}
function field(raw: unknown, key: string): unknown {
  if (!raw || typeof raw !== 'object') return undefined
  const descriptor = Object.getOwnPropertyDescriptor(raw, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}
function number(raw: unknown, maxBytes: number, signed = false): JsonNumber | undefined {
  const copied = copyJsonValue(raw)
  if ('failed' in copied || !isJsonNumber(copied.ok)) return undefined
  const value = copied.ok
  if (
    Buffer.byteLength(jsonNumberSource(value)) > maxBytes ||
    (typeof value === 'number' && !Number.isSafeInteger(value))
  )
    return undefined
  const decimal = ExactDecimal.from(value)
  return decimal.isInteger && (signed || decimal.compare(ExactDecimal.from(0)) >= 0)
    ? value
    : undefined
}
function text(raw: unknown, maxBytes: number): raw is string {
  return typeof raw === 'string' && raw.length > 0 && Buffer.byteLength(raw) <= maxBytes
}
function priorRequestInput(raw: unknown, maxBytes: number) {
  const prior = data(raw, [
    'projectionRevision',
    'prefixBoundary',
    'prefixDigest',
    'inputEnvelopeDigest',
  ])
  if (!prior || !text(prior.projectionRevision, maxBytes)) return undefined
  const prefixBoundary = number(prior.prefixBoundary, maxBytes)
  if (
    prefixBoundary === undefined ||
    ![prior.prefixDigest, prior.inputEnvelopeDigest].every(
      v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) && v.length <= maxBytes,
    )
  )
    return undefined
  return Object.freeze({
    projectionRevision: prior.projectionRevision,
    prefixBoundary,
    prefixDigest: prior.prefixDigest as string,
    inputEnvelopeDigest: prior.inputEnvelopeDigest as string,
  })
}
function source(raw: unknown, maxBytes: number): DiagnosticCalibrationSource | undefined {
  const value = data(raw, ['kind', 'reason', 'observedInputKind', 'requestInput'])
  if (!value) return undefined
  if (value.kind === 'none') {
    if (
      Object.keys(value).length !== 2 ||
      !['no_observation', 'source_unavailable'].includes(value.reason as string)
    )
      return undefined
    return Object.freeze({ kind: 'none', reason: value.reason }) as DiagnosticCalibrationSource
  }
  if (
    value.kind !== 'observation' ||
    value.reason !== undefined ||
    !['from_usage', 'upstream_total', 'unavailable'].includes(value.observedInputKind as string)
  )
    return undefined
  let requestInput: Extract<DiagnosticCalibrationSource, { kind: 'observation' }>['requestInput']
  if (value.requestInput !== undefined) {
    requestInput = priorRequestInput(value.requestInput, maxBytes)
    if (!requestInput) return undefined
  }
  return Object.freeze({
    kind: 'observation',
    observedInputKind: value.observedInputKind,
    ...(requestInput ? { requestInput } : {}),
  }) as DiagnosticCalibrationSource
}
function contribution(raw: unknown, signed: boolean, maxBytes: number) {
  const part = data(raw, ['tokens', 'precision'])
  if (!part || !precisions.includes(part.precision as string)) return undefined
  const tokens = number(part.tokens, maxBytes, signed)
  return tokens === undefined ? undefined : Object.freeze({ tokens, precision: part.precision })
}
function fullMeasurement(
  value: Record<string, unknown>,
  common: Record<string, unknown>,
  maxBytes: number,
): DiagnosticMeasurementFact | null {
  if (
    value.replayContribution !== undefined ||
    value.newContribution !== undefined ||
    (value.fallbackReason !== undefined &&
      !fallbackReasons.includes(value.fallbackReason as string))
  )
    return null
  const fullContribution = contribution(value.fullContribution, false, maxBytes)
  return fullContribution
    ? (Object.freeze({
        ...common,
        fullContribution,
        ...(value.fallbackReason === undefined ? {} : { fallbackReason: value.fallbackReason }),
      }) as DiagnosticMeasurementFact)
    : null
}
function marginalMeasurement(
  value: Record<string, unknown>,
  common: Record<string, unknown>,
  maxBytes: number,
): DiagnosticMeasurementFact | null {
  if (value.fullContribution !== undefined || value.fallbackReason !== undefined) return null
  const replayContribution = contribution(value.replayContribution, true, maxBytes),
    newContribution = contribution(value.newContribution, true, maxBytes)
  return replayContribution && newContribution
    ? (Object.freeze({
        ...common,
        replayContribution,
        newContribution,
      }) as DiagnosticMeasurementFact)
    : null
}
/** Collector boundary: own, validate and freeze the narrow representation, including exact signed numbers. */
export function copyMeasurementDiagnostic(
  raw: unknown,
  maxBytes: number,
): DiagnosticMeasurementFact | null {
  try {
    const value = data(raw, measurementDiagnosticKeys)
    if (
      !value ||
      value.kind !== 'measurement' ||
      !['full', 'marginal'].includes(value.mode as string) ||
      !precisions.includes(value.precision as string)
    )
      return null
    const rawBasis = data(value.basis, basisKeys)
    if (!rawBasis || !basisKeys.every(key => text(rawBasis[key], maxBytes))) return null
    const basis = Object.freeze({ ...rawBasis })
    const predictedInput = number(value.predictedInput, maxBytes),
      admissionTokens = number(value.admissionTokens, maxBytes),
      calibrationSource = source(value.calibrationSource, maxBytes)
    if (predictedInput === undefined || admissionTokens === undefined || !calibrationSource)
      return null
    const common = {
      kind: 'measurement',
      mode: value.mode,
      precision: value.precision,
      predictedInput,
      admissionTokens,
      basis,
      calibrationSource,
    }
    return value.mode === 'full'
      ? fullMeasurement(value, common, maxBytes)
      : marginalMeasurement(value, common, maxBytes)
  } catch {
    return null
  }
}
function clean(value: unknown, bound: BoundCredentialRedaction): value is string {
  if (typeof value !== 'string' || !value.length) return false
  const checked = bound.text(value)
  return 'ok' in checked && checked.ok === value
}
function binding(raw: unknown, bound: BoundCredentialRedaction): DiagnosticBinding | undefined {
  const b = data(raw, ['implementation', 'definition', 'configuration'])
  if (!b) return undefined
  const implementation = data(b.implementation, ['name', 'revision']),
    definition = data(b.definition, ['modelId', 'revision']),
    configuration = data(b.configuration, ['revision', 'values'])
  if (!implementation || !definition || !configuration) return undefined
  const result = {
    implementation: implementation.name,
    implementationRevision: implementation.revision,
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    configurationRevision: configuration.revision,
  }
  if (!Object.values(result).every(v => clean(v, bound))) return undefined
  return Object.freeze(result) as DiagnosticBinding
}
function projectCalibrationSource(raw: unknown, bound: BoundCredentialRedaction): unknown {
  const calibration = data(raw, [
    'kind',
    'reason',
    'inputCalibration',
    'usage',
    'outputBlocks',
    'replaySelection',
  ])
  if (!calibration) return undefined
  let calibrationSource: unknown
  if (calibration.kind === 'none') calibrationSource = { kind: 'none', reason: calibration.reason }
  else if (calibration.kind === 'observation') {
    const original = data(calibration.inputCalibration, [
      'requestInput',
      'observedInput',
      'outputGroup',
    ])
    const observed = data(original?.observedInput, ['kind', 'reason', 'tokens', 'provenance'])
    const requestInput = data(original?.requestInput, [
      'kind',
      'reason',
      'projectionRevision',
      'prefixBoundary',
      'prefixDigest',
      'inputEnvelopeDigest',
      'countingBasis',
    ])
    if (!observed || !requestInput) return undefined
    calibrationSource = {
      kind: 'observation',
      observedInputKind: observed.kind,
      ...(requestInput.kind === 'known'
        ? {
            requestInput: {
              projectionRevision: requestInput.projectionRevision,
              prefixBoundary: requestInput.prefixBoundary,
              prefixDigest: requestInput.prefixDigest,
              inputEnvelopeDigest: requestInput.inputEnvelopeDigest,
            },
          }
        : {}),
    }
    if (
      requestInput.kind === 'known' &&
      !['projectionRevision', 'prefixDigest', 'inputEnvelopeDigest'].every(key =>
        clean(requestInput[key], bound),
      )
    )
      return undefined
  } else return undefined
  return calibrationSource
}
/** Invocation boundary, not a new source authority. It never reads configuration values, content or signatures. */
export function projectCalibrationDiagnostic(
  planned: unknown,
  bound: BoundCredentialRedaction,
): { binding: DiagnosticBinding; facts: DiagnosticMeasurementFact } | undefined {
  try {
    const value = data(
      field(planned, 'measurement'),
      measurementDiagnosticKeys.filter(key => key !== 'kind' && key !== 'calibrationSource'),
    )
    if (!value) return undefined
    const rawBasis = data(value.basis, ['binding', ...basisKeys])
    if (!rawBasis) return undefined
    const safeBinding = binding(
      field(field(field(planned, 'input'), 'snapshot'), 'adaptation'),
      bound,
    )
    if (!safeBinding || !basisKeys.every(key => clean(rawBasis[key], bound))) return undefined
    const calibrationSource = projectCalibrationSource(
      field(field(planned, 'input'), 'calibration'),
      bound,
    )
    if (calibrationSource === undefined) return undefined
    const facts = copyMeasurementDiagnostic(
      {
        ...value,
        kind: 'measurement',
        basis: Object.fromEntries(basisKeys.map(key => [key, rawBasis[key]])),
        calibrationSource,
      },
      Number.MAX_SAFE_INTEGER,
    )
    return facts ? { binding: safeBinding, facts } : undefined
  } catch {
    return undefined
  }
}
