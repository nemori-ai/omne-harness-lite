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
import {
  empty,
  governanceFamily,
  type Family,
  type LeafKind,
  type RequestRule,
  type Rule,
} from './operation-rules.ts'
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
type StageRead<V extends string, S extends string> = [S] extends [never]
  ? never
  : { readonly kind: 'stage-not-provided'; readonly response: Refusal<V, 'stage-not-provided'> }
/** Family-neutral read result. Each public wrapper narrows only `request` to its validated model. */
export type RequestRead<V extends string, S extends string> =
  | { readonly kind: 'request'; readonly request: unknown }
  | {
      readonly kind: 'protocol-rejected'
      readonly response: Refusal<V, 'protocol-rejected'>
      readonly diagnostic: GovernanceDiagnostic
    }
  | StageRead<V, S>
/** Family-neutral response read. Each public wrapper narrows only `response` to its operation's model. */
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
type Leaf = (input: unknown, direction: Direction, limits: JsonLimits) => Converted | undefined
type TreeKind = 'parameters' | 'json' | 'user-message'
const tenantRule: Rule = { kind: 'tenant' }

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
    const byteLength = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      'byteLength',
    )?.get
    // A missing intrinsic getter makes this call throw TypeError, which the catch reports.
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

/** `protocol-rejected` belongs to every family, `stage-not-provided` only to one with stages. */
function isRefusal<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  outcome: string,
): boolean {
  return (
    outcome === 'protocol-rejected' ||
    (outcome === 'stage-not-provided' && family.stages.length > 0)
  )
}

function operationOf<V extends string, P extends string, S extends string>(
  family: Family<V, P, S>,
  value: unknown,
): P | S {
  if (family.isProvided(value) || isStage(family, value)) return value
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

/** Decoding walks json-text nodes; encoding walks caller values. */
function nodeOf(input: unknown): JsonValue | undefined {
  return input as JsonValue | undefined
}

function primitive(input: unknown, direction: Direction): unknown {
  if (direction === 'encode') return input
  const node = nodeOf(input)
  return node?.kind === 'string' || node?.kind === 'boolean' ? node.value : undefined
}

/** Both directions check the inner tenant text; when decoding, that text is the input itself. */
function tenant(input: unknown, direction: Direction, limits: JsonLimits): Converted | undefined {
  const converted = identity(tenantCodec, input, direction)
  return converted?.wire.kind === 'string' && tenantText(converted.wire.value, limits)
    ? converted
    : undefined
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

function treeAccepts(kind: TreeKind, value: JsonValue): boolean {
  switch (kind) {
    case 'json':
      return true
    case 'parameters':
      return value.kind === 'object'
    case 'user-message':
      return isUserMessage(value)
  }
}

function tree(kind: TreeKind): Leaf {
  return (input, direction, limits) => {
    const judged = judgeJsonValue(
      direction === 'encode' ? snapshotTree(input, limits.maxItems) : input,
      { maxVisits: limits.maxItems },
    )
    return 'ok' in judged && treeAccepts(kind, judged.ok)
      ? { local: judged.ok, wire: judged.ok }
      : undefined
  }
}

function onPrimitive(convert: Leaf): Leaf {
  return (input, direction, limits) => convert(primitive(input, direction), direction, limits)
}

function textLeaf(accepts: (value: string) => boolean): Leaf {
  return onPrimitive(value =>
    typeof value === 'string' && accepts(value)
      ? { local: value, wire: stringWire(value) }
      : undefined,
  )
}

function identityLeaf<T>(codec: IdentityTextCodec<T>): Leaf {
  return onPrimitive((value, direction) => identity(codec, value, direction))
}

function nullLeaf(input: unknown, direction: Direction): Converted | undefined {
  const isNull = direction === 'decode' ? nodeOf(input)?.kind === 'null' : input === null
  return isNull ? { local: null, wire: { kind: 'null' } } : undefined
}

const leaves: { readonly [K in LeafKind]: Leaf } = {
  text: textLeaf(value => value !== ''),
  string: textLeaf(() => true),
  session: textLeaf(value => /^[0-9a-f]{64}$/.test(value)),
  'page-bytes': textLeaf(value => /^[1-9][0-9]*$/.test(value)),
  boolean: onPrimitive(value =>
    typeof value === 'boolean' ? { local: value, wire: { kind: 'boolean', value } } : undefined,
  ),
  null: nullLeaf,
  account: identityLeaf(accountCodec),
  organization: identityLeaf(organizationCodec),
  login: identityLeaf(loginStateCodec),
  tenant: onPrimitive(tenant),
  instant: onPrimitive(instant),
  parameters: tree('parameters'),
  json: tree('json'),
  'user-message': tree('user-message'),
}

function isLeaf(rule: Rule): rule is Extract<Rule, { readonly kind: LeafKind }> {
  return Object.hasOwn(leaves, rule.kind)
}

function literal(rule: Extract<Rule, { kind: 'literal' }>, value: unknown): Converted | undefined {
  if (typeof value === 'string' && rule.values.includes(value))
    return { local: value, wire: stringWire(value) }
  if (typeof value === 'boolean' && rule.values.includes(value))
    return { local: value, wire: { kind: 'boolean', value } }
  return undefined
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

function firstMatch(
  rules: readonly Rule[],
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  for (const option of rules) {
    const converted = convert(option, input, direction, limits)
    if (converted !== undefined) return converted
  }
  return undefined
}

function itemsOf(input: unknown, direction: Direction): readonly unknown[] | undefined {
  if (direction === 'encode') return list(input)
  const node = nodeOf(input)
  return node?.kind === 'array' ? node.items : undefined
}

function convert(
  rule: Rule,
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (isLeaf(rule)) return leaves[rule.kind](input, direction, limits)
  switch (rule.kind) {
    case 'literal':
      return literal(rule, primitive(input, direction))
    case 'object':
      return convertObject(
        rule,
        direction === 'decode' ? objectWire(nodeOf(input)) : fields(input),
        direction,
        limits,
      )
    case 'array':
      return convertList(rule, itemsOf(input, direction), direction, limits)
    case 'one-of':
      return firstMatch(rule.rules, input, direction, limits)
    default: {
      const unreachable: never = rule
      return unreachable
    }
  }
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
  // Callers reach this only after narrowing an operation to S, so S is not `never` here.
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

/** Converts the closed envelope and body of a provided operation; any failure is a field failure. */
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

/** Converts a local request model of a provided operation; any failure is an invalid model. */
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
    return operation !== undefined && family.isProvided(operation)
      ? family.responseRule(operation, outcome)
      : undefined
  if (outcome === 'protocol-rejected') return empty
  return operation === undefined || isStage(family, operation) ? empty : undefined
}

/** Reads version, outcome and correlation of a response, closing its top-level fields. */
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
  const local: { -readonly [K in keyof ResponseModel<V>['local']]: ResponseModel<V>['local'][K] } =
    {
      protocolVersion: version,
      outcome,
      body: body.local,
    }
  const wire: Record<string, JsonValue> = {
    protocolVersion: stringWire(version),
    outcome: stringWire(outcome),
    body: body.wire,
  }
  if (messageId !== undefined) {
    local.messageId = messageId
    wire.messageId = stringWire(messageId)
  }
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
