import {
  judgeJsonValue,
  readJsonBytes,
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import {
  accountCodec,
  organizationCodec,
  loginStateCodec,
  tenantCodec,
  type IdentityTextCodec,
} from '@omne-harness/legal-identity'
import { encodeInstant, parseInstant, type Instant } from '@omne-harness/utc-instant'
import { readRequestDocument } from './correlation.ts'
import { empty, governanceFamily, type Family, type Rule } from './operation-rules.ts'
import type {
  EmptyBody,
  GovernanceCodecLimits,
  GovernanceDiagnostic,
  GovernanceEncodeResult,
  GovernanceOperation,
  GovernanceProtocolResult,
  GovernanceRequest,
  GovernanceRequestRead,
  GovernanceResponseEncodeInput,
  GovernanceResponseRead,
  ProofInput,
} from './messages.ts'

const encoder = new TextEncoder()
type Fields = Readonly<Record<string, unknown>>
type Converted = { readonly local: unknown; readonly wire: JsonValue }
type Direction = 'encode' | 'decode'
type RefusalOutcome = 'protocol-rejected' | 'stage-not-provided'
type Refusal<V extends string, K extends RefusalOutcome> = {
  readonly protocolVersion: V
  readonly messageId?: string
  readonly outcome: K
  readonly body: EmptyBody
}
/** Family-neutral read result. Each public wrapper narrows `request` to its family's validated model. */
export type RequestRead<V extends string> =
  | { readonly kind: 'request'; readonly request: unknown }
  | {
      readonly kind: 'protocol-rejected'
      readonly response: Refusal<V, 'protocol-rejected'>
      readonly diagnostic: GovernanceDiagnostic
    }
  | { readonly kind: 'stage-not-provided'; readonly response: Refusal<V, 'stage-not-provided'> }
/** Family-neutral response read. Each public wrapper narrows `response` to its operation's model. */
export type ResponseRead =
  | { readonly kind: 'response'; readonly response: unknown }
  | { readonly kind: 'unmatched' }
  | { readonly kind: 'unreadable'; readonly diagnostic: GovernanceDiagnostic }
type ResponseModel<V extends string> = {
  readonly local: {
    readonly protocolVersion: V
    readonly messageId?: string
    readonly outcome: string
    readonly body: unknown
  }
  readonly wire: JsonValue
}
function invalid(): GovernanceEncodeResult {
  return { kind: 'invalid', diagnostic: { code: 'field' } }
}

function fields(value: unknown): Fields | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  try {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return undefined
    const result: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return undefined
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor))
        return undefined
      result[key] = descriptor.value
    }
    return result
  } catch {
    return undefined
  }
}

function list(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return undefined
    const keys = Reflect.ownKeys(value)
    if (keys.length !== length + 1) return undefined
    const result: unknown[] = []
    for (let i = 0; i < length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor))
        return undefined
      result.push(descriptor.value)
    }
    return result
  } catch {
    return undefined
  }
}

function exact(
  value: Fields,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key))
  )
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
    const getter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      'byteLength',
    )?.get
    if (getter === undefined) return programmingError(error)
    const bytes = new Uint8Array(getter.call(value))
    Uint8Array.prototype.set.call(bytes, value)
    return bytes
  } catch {
    return programmingError(error)
  }
}

function operationOf<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  value: unknown,
): P | S {
  if (family.isProvided(value) || family.isStage(value)) return value
  return programmingError(family.error)
}

function objectWire(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | undefined {
  return value?.kind === 'object'
    ? Object.fromEntries(value.entries.map(entry => [entry.key, entry.value]))
    : undefined
}
function textWire(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}
function stringWire(value: string): JsonValue {
  return { kind: 'string', value }
}
function wireObject(value: Readonly<Record<string, JsonValue>>): JsonValue {
  return { kind: 'object', entries: Object.entries(value).map(([key, value]) => ({ key, value })) }
}

function identity<T>(
  codec: IdentityTextCodec<T>,
  input: unknown,
  direction: Direction,
): Converted | undefined {
  if (direction === 'decode') {
    if (typeof input !== 'string') return undefined
    const parsed = codec.parse(input)
    return parsed.ok ? { local: parsed.value, wire: stringWire(input) } : undefined
  }
  // Identity codecs accept only their own minted values, including when a caller forges the static type.
  const encoded = codec.encode(input as T)
  return encoded.ok ? { local: input, wire: stringWire(encoded.value) } : undefined
}

function instant(input: unknown, direction: Direction): Converted | undefined {
  if (direction === 'decode') {
    if (typeof input !== 'string') return undefined
    const parsed = parseInstant(input)
    return parsed.ok ? { local: parsed.value, wire: stringWire(input) } : undefined
  }
  // The provider's private brand check throws TypeError for non-minted values without reading user properties.
  try {
    return { local: input, wire: stringWire(encodeInstant(input as Instant)) }
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}

function tenantText(text: string, limits: JsonLimits): boolean {
  if (!text.isWellFormed()) return false
  const parsed = readJsonText(text, { ...limits, maxDepth: 1, maxItems: 3, maxMembers: 2 })
  if (parsed.kind !== 'ok') return false
  const data = objectWire(parsed.value)
  return (
    data !== undefined &&
    exact(data, ['organization', 'account']) &&
    textWire(data.organization) !== undefined &&
    textWire(data.account) !== undefined
  )
}

function snapshotTree(input: unknown, maxItems: number): unknown {
  let root: unknown
  type Pending = { value: unknown; put: (value: unknown) => void } | { leave: object }
  const pending: Pending[] = [
    {
      value: input,
      put: value => {
        root = value
      },
    },
  ]
  const ancestors = new Set<object>()
  let objects = 0
  const maxObjects = Math.min(Number.MAX_SAFE_INTEGER, maxItems * 4 + 1)
  while (pending.length > 0) {
    const next = pending.pop()
    if (next === undefined) break
    if ('leave' in next) {
      ancestors.delete(next.leave)
      continue
    }
    if (typeof next.value !== 'object' || next.value === null) {
      next.put(next.value)
      continue
    }
    if (++objects > maxObjects || ancestors.has(next.value)) return undefined
    const data = fields(next.value) ?? list(next.value)
    if (data === undefined) return undefined
    const copy: Record<string, unknown> | unknown[] = Array.isArray(data) ? [] : Object.create(null)
    next.put(copy)
    ancestors.add(next.value)
    pending.push({ leave: next.value })
    for (const [key, value] of Object.entries(data)) {
      pending.push({
        value,
        put: value => {
          Object.defineProperty(copy, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        },
      })
    }
  }
  return root
}

function isUserMessage(value: JsonValue): boolean {
  return (
    value.kind === 'object' &&
    value.entries.some(
      entry =>
        entry.key === 'role' && entry.value.kind === 'string' && entry.value.value === 'user',
    )
  )
}

function tree(
  kind: 'parameters' | 'json' | 'user-message',
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  const judged = judgeJsonValue(
    direction === 'encode' ? snapshotTree(input, limits.maxItems) : input,
    { maxVisits: limits.maxItems },
  )
  if (!('ok' in judged)) return undefined
  const accepted =
    kind === 'json' ||
    (kind === 'parameters' ? judged.ok.kind === 'object' : isUserMessage(judged.ok))
  return accepted ? { local: judged.ok, wire: judged.ok } : undefined
}

function pattern(input: unknown, shape: RegExp): Converted | undefined {
  return typeof input === 'string' && shape.test(input)
    ? { local: input, wire: stringWire(input) }
    : undefined
}

function scalar(
  rule: Rule,
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  switch (rule.kind) {
    case 'account':
      return identity(accountCodec, input, direction)
    case 'organization':
      return identity(organizationCodec, input, direction)
    case 'login':
      return identity(loginStateCodec, input, direction)
    case 'instant':
      return instant(input, direction)
    case 'tenant': {
      if (direction === 'decode' && (typeof input !== 'string' || !tenantText(input, limits)))
        return undefined
      const converted = identity(tenantCodec, input, direction)
      if (converted?.wire.kind !== 'string' || !tenantText(converted.wire.value, limits))
        return undefined
      return converted
    }
    case 'text':
      return typeof input === 'string' && input !== ''
        ? { local: input, wire: stringWire(input) }
        : undefined
    case 'string':
      return typeof input === 'string' ? { local: input, wire: stringWire(input) } : undefined
    case 'session':
      return pattern(input, /^[0-9a-f]{64}$/)
    case 'page-bytes':
      return pattern(input, /^[1-9][0-9]*$/)
    case 'boolean':
      return typeof input === 'boolean'
        ? { local: input, wire: { kind: 'boolean', value: input } }
        : undefined
    case 'literal':
      return (typeof input === 'string' || typeof input === 'boolean') &&
        rule.values.includes(input)
        ? {
            local: input,
            wire: typeof input === 'string' ? stringWire(input) : { kind: 'boolean', value: input },
          }
        : undefined
    default:
      return undefined
  }
}

function convertObject(
  rule: Extract<Rule, { kind: 'object' }>,
  data: Fields | undefined,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (data === undefined || Object.keys(data).some(key => !Object.hasOwn(rule.fields, key)))
    return undefined
  const local: Record<string, unknown> = {}
  const wire: Record<string, JsonValue> = {}
  for (const [key, field] of Object.entries(rule.fields)) {
    if (!Object.hasOwn(data, key) && field.optional) continue
    const converted = convert(field.rule, data[key], direction, limits)
    if (converted === undefined) return undefined
    local[key] = converted.local
    wire[key] = converted.wire
  }
  return { local, wire: wireObject(wire) }
}

function convertList(
  rule: Extract<Rule, { kind: 'array' }>,
  data: readonly unknown[] | undefined,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (data === undefined || data.length > limits.maxItems || (rule.nonempty && data.length === 0))
    return undefined
  const values: Converted[] = []
  for (const item of data) {
    const converted = convert(rule.item, item, direction, limits)
    if (converted === undefined) return undefined
    values.push(converted)
  }
  return {
    local: values.map(value => value.local),
    wire: { kind: 'array', items: values.map(value => value.wire) },
  }
}

function convert(
  rule: Rule,
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (rule.kind === 'parameters' || rule.kind === 'json' || rule.kind === 'user-message')
    return tree(rule.kind, input, direction, limits)
  if (rule.kind === 'one-of') {
    for (const option of rule.rules) {
      const converted = convert(option, input, direction, limits)
      if (converted !== undefined) return converted
    }
    return undefined
  }
  const node = direction === 'decode' ? (input as JsonValue | undefined) : undefined
  if (rule.kind === 'null')
    return (direction === 'decode' ? node?.kind === 'null' : input === null)
      ? { local: null, wire: { kind: 'null' } }
      : undefined
  if (rule.kind === 'object')
    return convertObject(
      rule,
      direction === 'decode' ? objectWire(node) : fields(input),
      direction,
      limits,
    )
  if (rule.kind === 'array') {
    const items =
      direction === 'decode' ? (node?.kind === 'array' ? node.items : undefined) : list(input)
    return convertList(rule, items, direction, limits)
  }
  const value =
    direction === 'decode'
      ? node?.kind === 'string' || node?.kind === 'boolean'
        ? node.value
        : undefined
      : input
  return scalar(rule, value, direction, limits)
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
function rejected<V extends string>(
  version: V,
  code: GovernanceDiagnostic['code'],
  messageId?: string,
): RequestRead<V> {
  return {
    kind: 'protocol-rejected',
    response: refusal(version, 'protocol-rejected', messageId),
    diagnostic: { code },
  }
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

function requestFromWire<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  document: JsonValue,
  limits: JsonLimits,
  messageId: string | undefined,
): RequestRead<V> {
  const { version } = family
  const data = objectWire(document)
  if (data === undefined || textWire(data.protocolVersion) !== version)
    return rejected(version, 'version', messageId)
  const operation = textWire(data.operation)
  if (family.isStage(operation))
    return {
      kind: 'stage-not-provided',
      response: refusal(version, 'stage-not-provided', messageId),
    }
  if (!family.isProvided(operation)) return rejected(version, 'operation', messageId)
  const rule = family.requestRule(operation)
  const required = [
    'protocolVersion',
    'messageId',
    'operation',
    'body',
    ...(rule.tenant ? ['actingTenant'] : []),
  ]
  if (!exact(data, required, rule.proof ? ['loginProof'] : []) || messageId === undefined)
    return rejected(version, 'field', messageId)
  const body = convert(rule.body, data.body, 'decode', limits)
  const tenant = rule.tenant
    ? convert({ kind: 'tenant' }, data.actingTenant, 'decode', limits)
    : undefined
  if (body === undefined || (rule.tenant && tenant === undefined))
    return rejected(version, 'field', messageId)
  const loginProof = textWire(data.loginProof)
  if (rule.proof && Object.hasOwn(data, 'loginProof') && loginProof === undefined)
    return rejected(version, 'field', messageId)
  const proof: ProofInput =
    loginProof === undefined
      ? { kind: 'missing' }
      : loginProof === ''
        ? { kind: 'empty' }
        : { kind: 'present', value: loginProof }
  const request = {
    protocolVersion: version,
    messageId,
    operation,
    body: body.local,
    ...(rule.proof ? { proof } : {}),
    ...(rule.tenant ? { actingTenant: tenant?.local } : {}),
  }
  return { kind: 'request', request }
}

export function readRequest<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  input: unknown,
): RequestRead<V> {
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
  // The core validated the request against the governance rule table of its operation.
  return readRequest(governanceFamily, input) as GovernanceRequestRead
}

function write(wire: JsonValue, limits: JsonLimits): GovernanceEncodeResult {
  const bytes = encoder.encode(writeJsonText(wire))
  const checked = readJsonBytes(bytes, limits)
  return checked.kind === 'ok'
    ? { kind: 'encoded', bytes }
    : { kind: 'invalid', diagnostic: { code: checked.kind === 'budget' ? 'budget' : 'field' } }
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
  const rule = family.requestRule(model.operation)
  const keys = [
    'protocolVersion',
    'messageId',
    'operation',
    'body',
    ...(rule.proof ? ['proof'] : []),
    ...(rule.tenant ? ['actingTenant'] : []),
  ]
  if (!exact(model, keys)) return invalid()
  const body = convert(rule.body, model.body, 'encode', limits)
  const tenant = rule.tenant
    ? convert({ kind: 'tenant' }, model.actingTenant, 'encode', limits)
    : undefined
  const proof = rule.proof ? proofOf(model.proof) : undefined
  if (
    body === undefined ||
    (rule.tenant && tenant === undefined) ||
    (rule.proof && proof === undefined)
  )
    return invalid()
  const wire: Record<string, JsonValue> = {
    protocolVersion: stringWire(family.version),
    messageId: stringWire(model.messageId),
    operation: stringWire(model.operation),
    body: body.wire,
  }
  if (tenant !== undefined) wire.actingTenant = tenant.wire
  if (proof !== undefined && proof.kind !== 'missing')
    wire.loginProof = stringWire(proof.kind === 'empty' ? '' : proof.value)
  return write(wireObject(wire), limits)
}

export function encodeGovernanceRequest(input: {
  readonly request: GovernanceRequest
  readonly limits: GovernanceCodecLimits
}): GovernanceEncodeResult {
  return encodeRequest(governanceFamily, input)
}

function isRefusal<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  outcome: string,
): boolean {
  return family.refusals.some(known => known === outcome)
}

function responseBody<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  operation: P | S | undefined,
  outcome: string,
): Rule | undefined {
  if (outcome === 'protocol-rejected') return empty
  if (outcome === 'stage-not-provided')
    return family.refusals.includes(outcome) &&
      (operation === undefined || family.isStage(operation))
      ? empty
      : undefined
  return operation !== undefined && family.isProvided(operation)
    ? family.responseRule(operation, outcome)
    : undefined
}

function responseModel<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  input: unknown,
  operation: P | S | undefined,
  direction: Direction,
  limits: JsonLimits,
): ResponseModel<V> | undefined {
  const { version } = family
  const data = direction === 'decode' ? objectWire(input as JsonValue) : fields(input)
  if (data === undefined) return undefined
  const primitive = (key: string) =>
    direction === 'decode' ? textWire(data[key] as JsonValue | undefined) : data[key]
  const outcome = primitive('outcome')
  const messageId = primitive('messageId')
  if (primitive('protocolVersion') !== version || typeof outcome !== 'string') return undefined
  const common = isRefusal(family, outcome)
  if (
    !exact(
      data,
      ['protocolVersion', 'outcome', 'body', ...(common ? [] : ['messageId'])],
      common ? ['messageId'] : [],
    )
  )
    return undefined
  if (Object.hasOwn(data, 'messageId') && typeof messageId !== 'string') return undefined
  const rule = responseBody(family, operation, outcome)
  if (rule === undefined) return undefined
  const body = convert(rule, data.body, direction, limits)
  if (body === undefined) return undefined
  const local = {
    protocolVersion: version,
    ...(typeof messageId === 'string' ? { messageId } : {}),
    outcome,
    body: body.local,
  }
  const wire: Record<string, JsonValue> = {
    protocolVersion: stringWire(version),
    outcome: stringWire(outcome),
    body: body.wire,
  }
  if (typeof messageId === 'string') wire.messageId = stringWire(messageId)
  return { local, wire: wireObject(wire) }
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
  // The core validated the response against the rule table of `input.operation`.
  return readResponse(governanceFamily, input) as GovernanceResponseRead<O>
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
