import {
  readJsonBytes,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { readRequestDocument } from './correlation.ts'
import {
  convert,
  exact,
  fields,
  nodeOf,
  objectWire,
  stringWire,
  textWire,
  wireObject,
  type Converted,
  type Direction,
  type Fields,
} from './leaf-codec.ts'
import { governanceFamily } from './operation-rules.ts'
import { empty, type Family, type RequestRule, type Rule } from './rule.ts'
import type {
  EmptyBody,
  GovernanceCodecLimits,
  GovernanceDiagnostic,
  GovernanceEncodeResult,
  GovernanceOperation,
  GovernanceProtocolResult,
  GovernanceRequest,
  GovernanceRequestRead,
  GovernanceResponse,
  GovernanceResponseEncodeInput,
  GovernanceResponseRead,
  ProofInput,
} from './messages.ts'

const encoder = new TextEncoder()
type RefusalOutcome = 'protocol-rejected' | 'stage-not-provided'
type Refusal<V extends string, K extends RefusalOutcome> = {
  readonly protocolVersion: V
  readonly messageId?: string
  readonly outcome: K
  readonly body: EmptyBody
}
type StageRead<V extends string, S extends string> = [S] extends [never]
  ? never
  : { readonly kind: 'stage-not-provided'; readonly response: Refusal<V, 'stage-not-provided'> }
export type RequestRead<V extends string, S extends string> =
  | { readonly kind: 'request'; readonly request: unknown }
  | {
      readonly kind: 'protocol-rejected'
      readonly response: Refusal<V, 'protocol-rejected'>
      readonly diagnostic: GovernanceDiagnostic
    }
  | StageRead<V, S>
export type ResponseRead =
  | { readonly kind: 'response'; readonly response: unknown }
  | { readonly kind: 'unmatched' }
  | { readonly kind: 'unreadable'; readonly diagnostic: GovernanceDiagnostic }
type ResponseHead = { readonly outcome: string; readonly messageId?: string }
type ResponseModel<V extends string> = {
  readonly local: {
    readonly protocolVersion: V
    readonly messageId?: string
    readonly outcome: string
    readonly body: unknown
  }
  readonly wire: JsonValue
}
const tenantRule: Rule = { kind: 'tenant' }

function invalid(): GovernanceEncodeResult {
  return { kind: 'invalid', diagnostic: { code: 'field' } }
}

function programmingError(message: string): never {
  throw new TypeError(message)
}

function limitsOf(value: unknown, error: string): JsonLimits {
  const data = fields(value)
  const keys = [
    'maxBytes',
    'maxDepth',
    'maxItems',
    'maxMembers',
    'maxStringLength',
    'maxNumberLength',
  ] as const
  if (data === undefined || !exact(data, keys)) return programmingError(error)
  for (const key of keys) {
    const n = data[key]
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) return programmingError(error)
  }
  return Object.freeze(data as JsonLimits)
}

function argumentsOf(
  error: string,
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): { data: Fields; limits: JsonLimits } {
  const data = fields(input)
  if (data === undefined || !exact(data, required, optional)) return programmingError(error)
  return { data, limits: limitsOf(data.limits, error) }
}

function bytesOf(value: unknown, error: string): Uint8Array {
  try {
    if (!(value instanceof Uint8Array) || !ArrayBuffer.isView(value)) return programmingError(error)
    const byteLength = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      'byteLength',
    )?.get
    const bytes = new Uint8Array(byteLength!.call(value))
    Uint8Array.prototype.set.call(bytes, value)
    return bytes
  } catch {
    return programmingError(error)
  }
}

function isStage<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  value: unknown,
): value is S {
  return family.stages.some(stage => stage === value)
}

function isRefusal<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  outcome: string,
): boolean {
  return (
    outcome === 'protocol-rejected' ||
    (outcome === 'stage-not-provided' && (family.stages.length > 0 || family.declarable))
  )
}

function operationOf<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  value: unknown,
): P | S {
  if (family.isProvided(value) || isStage(family, value)) return value
  return programmingError(family.error)
}

function refusal<V extends string, K extends RefusalOutcome>(
  version: V,
  outcome: K,
  messageId: string | undefined,
): Refusal<V, K> {
  return {
    protocolVersion: version,
    ...(messageId === undefined ? {} : { messageId }),
    outcome,
    body: {},
  }
}
function rejected<V extends string, S extends string>(
  version: V,
  code: GovernanceDiagnostic['code'],
  messageId?: string,
): RequestRead<V, S> {
  return {
    kind: 'protocol-rejected',
    response: refusal(version, 'protocol-rejected', messageId),
    diagnostic: { code },
  }
}
function stageRead<V extends string, S extends string>(
  version: V,
  messageId: string | undefined,
): RequestRead<V, S> {
  const read = {
    kind: 'stage-not-provided',
    response: refusal(version, 'stage-not-provided', messageId),
  }
  return read as StageRead<V, S>
}

function proofOf(value: unknown): ProofInput | undefined {
  const proof = fields(value)
  if (proof === undefined) return undefined
  if ((proof.kind === 'missing' || proof.kind === 'empty') && exact(proof, ['kind']))
    return { kind: proof.kind }
  if (
    proof.kind === 'present' &&
    exact(proof, ['kind', 'value']) &&
    typeof proof.value === 'string' &&
    proof.value !== ''
  )
    return { kind: 'present', value: proof.value }
  return undefined
}

function proofFromWire(data: Readonly<Record<string, JsonValue>>): ProofInput | undefined {
  if (!Object.hasOwn(data, 'loginProof')) return { kind: 'missing' }
  const text = textWire(data.loginProof)
  if (text === undefined) return undefined
  return text === '' ? { kind: 'empty' } : { kind: 'present', value: text }
}

function proofToWire(proof: ProofInput | null): { readonly loginProof?: JsonValue } {
  if (proof === null || proof.kind === 'missing') return {}
  return { loginProof: stringWire(proof.kind === 'empty' ? '' : proof.value) }
}

function envelopeKeys(rule: RequestRule): string[] {
  return [
    'protocolVersion',
    'messageId',
    'operation',
    'body',
    ...(rule.tenant ? ['actingTenant'] : []),
  ]
}

function requestModelFromWire<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  operation: P,
  data: Readonly<Record<string, JsonValue>>,
  messageId: string,
  limits: JsonLimits,
): object | undefined {
  const rule = family.requestRule(operation)
  const closed = rule.proof
    ? exact(data, envelopeKeys(rule), ['loginProof'])
    : exact(data, envelopeKeys(rule))
  if (!closed) return undefined
  const body = convert(rule.body, data.body, 'decode', limits)
  const actingTenant = rule.tenant ? convert(tenantRule, data.actingTenant, 'decode', limits) : null
  const proof = rule.proof ? proofFromWire(data) : null
  if (body === undefined || actingTenant === undefined || proof === undefined) return undefined
  return {
    protocolVersion: family.version,
    messageId,
    operation,
    body: body.local,
    ...(proof === null ? {} : { proof }),
    ...(actingTenant === null ? {} : { actingTenant: actingTenant.local }),
  }
}

function requestFromWire<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  document: JsonValue,
  limits: JsonLimits,
  messageId: string | undefined,
): RequestRead<V, S> {
  const { version } = family
  const data = objectWire(document)
  if (data === undefined || textWire(data.protocolVersion) !== version)
    return rejected(version, 'version', messageId)
  const operation = textWire(data.operation)
  if (isStage(family, operation)) return stageRead(version, messageId)
  if (!family.isProvided(operation)) return rejected(version, 'operation', messageId)
  const request =
    messageId === undefined
      ? undefined
      : requestModelFromWire(family, operation, data, messageId, limits)
  return request === undefined
    ? rejected(version, 'field', messageId)
    : { kind: 'request', request }
}

export function readRequest<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  input: unknown,
): RequestRead<V, S> {
  const { data, limits } = argumentsOf(family.error, input, ['bytes', 'limits'])
  const { read, messageId } = readRequestDocument(bytesOf(data.bytes, family.error), limits)
  if (read.kind !== 'ok')
    return rejected(family.version, read.kind === 'budget' ? 'budget' : 'json', messageId)
  return requestFromWire(family, read.value, limits, messageId)
}

export function readGovernanceRequest(input: {
  readonly bytes: Uint8Array
  readonly limits: GovernanceCodecLimits
}): GovernanceRequestRead {
  const read = readRequest(governanceFamily, input)
  if (read.kind !== 'request') return read
  return { kind: read.kind, request: read.request as GovernanceRequest }
}

function write(wire: JsonValue, limits: JsonLimits): GovernanceEncodeResult {
  const bytes = encoder.encode(writeJsonText(wire))
  const checked = readJsonBytes(bytes, limits)
  return checked.kind === 'ok'
    ? { kind: 'encoded', bytes }
    : { kind: 'invalid', diagnostic: { code: checked.kind === 'budget' ? 'budget' : 'field' } }
}

function requestModelToWire<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  operation: P,
  messageId: string,
  model: Fields,
  limits: JsonLimits,
): JsonValue | undefined {
  const rule = family.requestRule(operation)
  if (!exact(model, [...envelopeKeys(rule), ...(rule.proof ? ['proof'] : [])])) return undefined
  const body = convert(rule.body, model.body, 'encode', limits)
  const actingTenant = rule.tenant
    ? convert(tenantRule, model.actingTenant, 'encode', limits)
    : null
  const proof = rule.proof ? proofOf(model.proof) : null
  if (body === undefined || actingTenant === undefined || proof === undefined) return undefined
  return wireObject({
    protocolVersion: stringWire(family.version),
    messageId: stringWire(messageId),
    operation: stringWire(operation),
    body: body.wire,
    ...(actingTenant === null ? {} : { actingTenant: actingTenant.wire }),
    ...proofToWire(proof),
  })
}

export function encodeRequest<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  input: unknown,
): GovernanceEncodeResult {
  const { data, limits } = argumentsOf(family.error, input, ['request', 'limits'])
  const model = fields(data.request)
  if (
    model === undefined ||
    model.protocolVersion !== family.version ||
    typeof model.messageId !== 'string' ||
    !family.isProvided(model.operation)
  )
    return invalid()
  const wire = requestModelToWire(family, model.operation, model.messageId, model, limits)
  return wire === undefined ? invalid() : write(wire, limits)
}

export function encodeGovernanceRequest(input: {
  readonly request: GovernanceRequest
  readonly limits: GovernanceCodecLimits
}): GovernanceEncodeResult {
  return encodeRequest(governanceFamily, input)
}

function responseBody<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  operation: P | S | undefined,
  outcome: string,
): Rule | undefined {
  if (!isRefusal(family, outcome))
    return family.isProvided(operation) ? family.responseRule(operation, outcome) : undefined
  return empty
}

function responseHead<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  data: Fields,
  direction: Direction,
): ResponseHead | undefined {
  const value = (key: string) => (direction === 'decode' ? textWire(nodeOf(data[key])) : data[key])
  const outcome = value('outcome')
  const messageId = value('messageId')
  if (value('protocolVersion') !== family.version || typeof outcome !== 'string') return undefined
  const required = ['protocolVersion', 'outcome', 'body']
  const closed = isRefusal(family, outcome)
    ? exact(data, required, ['messageId'])
    : exact(data, [...required, 'messageId'])
  if (!closed) return undefined
  if (!Object.hasOwn(data, 'messageId')) return { outcome }
  return typeof messageId === 'string' ? { outcome, messageId } : undefined
}

function responseOutput<V extends string>(
  version: V,
  { outcome, messageId }: ResponseHead,
  body: Converted,
): ResponseModel<V> {
  const local = {
    protocolVersion: version,
    ...(messageId === undefined ? {} : { messageId }),
    outcome,
    body: body.local,
  } as ResponseModel<V>['local']
  const wire: Record<string, JsonValue> = {
    protocolVersion: stringWire(version),
    outcome: stringWire(outcome),
    body: body.wire,
  }
  if (messageId !== undefined) wire.messageId = stringWire(messageId)
  return { local, wire: wireObject(wire) }
}

function responseModel<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  input: unknown,
  operation: P | S | undefined,
  direction: Direction,
  limits: JsonLimits,
): ResponseModel<V> | undefined {
  const data = direction === 'decode' ? objectWire(nodeOf(input)) : fields(input)
  if (data === undefined) return undefined
  const head = responseHead(family, data, direction)
  if (head === undefined) return undefined
  const rule = responseBody(family, operation, head.outcome)
  const body = rule === undefined ? undefined : convert(rule, data.body, direction, limits)
  return body === undefined ? undefined : responseOutput(family.version, head, body)
}

export function readResponse<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  input: unknown,
): ResponseRead {
  const { data, limits } = argumentsOf(family.error, input, [
    'bytes',
    'operation',
    'expectedMessageId',
    'limits',
  ])
  const operation = operationOf(family, data.operation)
  if (typeof data.expectedMessageId !== 'string') return programmingError(family.error)
  const read = readJsonBytes(bytesOf(data.bytes, family.error), limits)
  if (read.kind !== 'ok')
    return { kind: 'unreadable', diagnostic: { code: read.kind === 'budget' ? 'budget' : 'json' } }
  const converted = responseModel(family, read.value, operation, 'decode', limits)
  if (converted === undefined) return { kind: 'unreadable', diagnostic: { code: 'field' } }
  return converted.local.messageId === data.expectedMessageId
    ? { kind: 'response', response: converted.local }
    : { kind: 'unmatched' }
}

export function readGovernanceResponse<O extends GovernanceOperation>(input: {
  readonly bytes: Uint8Array
  readonly operation: O
  readonly expectedMessageId: string
  readonly limits: GovernanceCodecLimits
}): GovernanceResponseRead<O> {
  const read = readResponse(governanceFamily, input)
  if (read.kind !== 'response') return read
  return { kind: read.kind, response: read.response as GovernanceResponse<O> }
}

export function encodeResponse<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  input: unknown,
): GovernanceEncodeResult {
  const { data, limits } = argumentsOf(family.error, input, ['response', 'limits'], ['operation'])
  const operation = Object.hasOwn(data, 'operation')
    ? operationOf(family, data.operation)
    : undefined
  const converted = responseModel(family, data.response, operation, 'encode', limits)
  return converted === undefined ? invalid() : write(converted.wire, limits)
}

export function encodeGovernanceResponse(input: {
  readonly response: GovernanceProtocolResult
  readonly limits: GovernanceCodecLimits
}): GovernanceEncodeResult
export function encodeGovernanceResponse<O extends GovernanceOperation>(
  input: GovernanceResponseEncodeInput<O>,
): GovernanceEncodeResult
export function encodeGovernanceResponse(input: unknown): GovernanceEncodeResult {
  return encodeResponse(governanceFamily, input)
}
