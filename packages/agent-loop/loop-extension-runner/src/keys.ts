import { isCapabilityName } from '@omne-harness-lite/asset-model'
import { isJsonNumber, jsonNumberSource, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { POSITIONS, type Dimension, type Position } from '@omne-harness-lite/loop-extension'

export type RunnerOccurrence =
  { readonly kind: 'final' } | { readonly kind: 'ask'; readonly ordinal: JsonNumber }

export interface RunnerKeyInput {
  readonly position: Position
  readonly dimension?: Dimension
  readonly anchor: string
  readonly extension?: string
  readonly occurrence?: RunnerOccurrence
  readonly modelCallId?: string
}

export interface RunnerKeys {
  readonly pass: string
  readonly all: string
  readonly final?: string
  readonly ask?: string
  readonly modelCall?: string
}

const invalid = Object.freeze({ invalidInput: true } as const)
export const runnerFormat = 'runner/5'
export const runnerAllKey = `${runnerFormat}/${JSON.stringify(['all'])}`

function identity(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'RunnerKey')
}

function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

export function dimensionPart(position: unknown, dimension: unknown): string | null | undefined {
  if (position === 'after_model_call') {
    if (!object(dimension) || Object.keys(dimension).length !== 1) return undefined
    if (dimension.ending === 'complete_reply') return 'ending:complete_reply'
    if (dimension.ending === 'failure') return 'ending:failure'
    return undefined
  }
  if (position === 'after_action') {
    if (!object(dimension) || Object.keys(dimension).length !== 1) return undefined
    if (dimension.scope === 'each') return 'scope:each'
    if (dimension.scope === 'batch') return 'scope:batch'
    return undefined
  }
  return dimension === undefined ? null : undefined
}

function ordinalText(value: unknown): string | undefined {
  if (!isJsonNumber(value)) return undefined
  const source = jsonNumberSource(value)
  const [mantissa = '', exponent = '0'] = source.toLowerCase().split('e')
  if (mantissa.startsWith('-')) return undefined
  const [whole = '', fraction = ''] = mantissa.split('.')
  const digits = `${whole}${fraction}`.replace(/^0+/u, '')
  if (digits === '') return undefined
  const significant = digits.replace(/0+$/u, '')
  const scale =
    BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length)
  if (scale < 0n) return undefined
  return `${significant}${'0'.repeat(Number(scale))}`
}

export function encodeRunnerKey(parts: readonly (string | null)[]): string {
  return `${runnerFormat}/${JSON.stringify(parts)}`
}

function hasUndefinedOption(input: RunnerKeyInput): boolean {
  const { dimension, extension, occurrence, modelCallId } = input
  if (
    (Object.hasOwn(input, 'dimension') && dimension === undefined) ||
    (Object.hasOwn(input, 'extension') && extension === undefined) ||
    (Object.hasOwn(input, 'occurrence') && occurrence === undefined) ||
    (Object.hasOwn(input, 'modelCallId') && modelCallId === undefined)
  )
    return true
  return false
}

function keyInputShape(input: RunnerKeyInput): boolean {
  if (
    !object(input) ||
    Object.keys(input).some(
      key =>
        !['position', 'dimension', 'anchor', 'extension', 'occurrence', 'modelCallId'].includes(
          key,
        ),
    )
  )
    return false
  return true
}

function validModelCall(
  modelCallId: string | undefined,
  position: Position,
  part: string | null,
): boolean {
  return (
    modelCallId === undefined ||
    (position === 'after_model_call' && part === 'ending:failure' && identity(modelCallId))
  )
}

export function passKeys(input: RunnerKeyInput): RunnerKeys | typeof invalid {
  if (!keyInputShape(input)) return invalid
  const { position, dimension, anchor, extension, occurrence, modelCallId } = input
  if (hasUndefinedOption(input)) return invalid
  if (!POSITIONS.includes(position) || !identity(anchor)) return invalid
  const part = dimensionPart(position, dimension)
  if (part === undefined) return invalid
  if ((extension === undefined) !== (occurrence === undefined)) return invalid
  if (extension !== undefined && !isCapabilityName(extension)) return invalid
  if (!validModelCall(modelCallId, position, part)) return invalid
  const base = {
    pass: encodeRunnerKey(['pass', position, part, anchor]),
    all: runnerAllKey,
    ...(modelCallId === undefined
      ? {}
      : { modelCall: encodeRunnerKey(['model-call', modelCallId]) }),
  }
  return occurrenceKeys(base, position, part, anchor, extension, occurrence)
}

function occurrenceKeys(
  base: RunnerKeys,
  position: Position,
  part: string | null,
  anchor: string,
  extension: string | undefined,
  occurrence: RunnerOccurrence | undefined,
): RunnerKeys | typeof invalid {
  if (occurrence === undefined) return base
  if (!object(occurrence) || extension === undefined) return invalid
  if (occurrence.kind === 'final' && Object.keys(occurrence).length === 1) {
    return { ...base, final: encodeRunnerKey(['final', position, part, anchor, extension]) }
  }
  if (occurrence.kind === 'ask' && Object.keys(occurrence).length === 2) {
    const ordinal = ordinalText(occurrence.ordinal)
    if (ordinal === undefined) return invalid
    return { ...base, ask: encodeRunnerKey(['ask', position, part, anchor, extension, ordinal]) }
  }
  return invalid
}

/** All runner-prefixed strings are domain claims, including unknown future markers. */
export function claimsRunnerKey(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('runner/')
}
