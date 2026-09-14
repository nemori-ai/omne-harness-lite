import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'
import { createScanner, parseTree, printParseErrorCode, SyntaxKind } from 'jsonc-parser'
import type { Node as JsonNode, ParseError } from 'jsonc-parser'

export type JsonValue = null | boolean | number | string | JsonObject | readonly JsonValue[]
export type JsonObject = { readonly [key: string]: JsonValue }
export type OpaqueId = string
export type SessionRef = Readonly<{ tenantId: OpaqueId; sessionId: OpaqueId }>
export type AgentRef = SessionRef & Readonly<{ incarnationId: OpaqueId }>
export type UserRef = Readonly<{ userId: OpaqueId }>
export type MembershipRef = Readonly<{ tenantId: OpaqueId; userId: OpaqueId }>
export type DefinitionRef = Readonly<{ ownerTenantId: OpaqueId; definitionId: OpaqueId }>
export type DefinitionVersion = Readonly<{ definition: DefinitionRef; version: OpaqueId }>
export type RunRef = Readonly<{ session: SessionRef; runId: OpaqueId }>
export type StepRef = Readonly<{ run: RunRef; stepId: OpaqueId }>
export type WorkRef = Readonly<{ tenantId: OpaqueId; workId: OpaqueId }>
export type WorkOwner = StepRef | WorkRef
export type MediaRef = Readonly<{ tenantId: OpaqueId; mediaId: OpaqueId }>
export type MediaMetadata = Readonly<{
  media: MediaRef
  sha256: string
  byteLength: number
  mimeType: string
  filename?: string
}>
export type ResourceRef = Readonly<{
  tenantId: OpaqueId
  kind: string
  resourceId: OpaqueId
  version: OpaqueId
}>
export type SecretRef = Readonly<{
  kind: 'secret_version'
  tenantId: OpaqueId
  secretId: OpaqueId
  version: OpaqueId
}>
export type Binding = Readonly<{
  implementationId: OpaqueId
  generation: OpaqueId
  configurationRevision: OpaqueId
  environment: ResourceRef
  parserVersion: OpaqueId
}>
export type Confirmation =
  | Readonly<{ confirmation: 'none' | 'before_effect'; provisionalContract?: ResourceRef }>
  | Readonly<{ confirmation: 'provisional'; provisionalContract: ResourceRef }>
export type Action = Readonly<{
  tenantId: OpaqueId
  callId: OpaqueId
  attemptId: OpaqueId
  owner: WorkOwner
  definition: DefinitionVersion
  toolKey: OpaqueId
  commandKey: OpaqueId
  declarationVersion: OpaqueId
  binding: Binding
  params: JsonObject
  resources: readonly ResourceRef[]
  permissions: readonly string[]
  grantorKinds: readonly string[]
  impact: string
}> & Confirmation
export type CallRef = Readonly<{ owner: WorkOwner; callId: OpaqueId; attemptId: OpaqueId }>
export type RequestRef = Readonly<{ tenantId: OpaqueId; requestId: OpaqueId }>
export type Money = Readonly<{ integer: string; scale: number; currency: string }>
export type OperationRef = Readonly<{
  namespace: OpaqueId
  principalId: OpaqueId
  operationId: OpaqueId
}>
export type Decision = Readonly<{
  request: RequestRef
  contentVersion: OpaqueId
  outcomeVersion: OpaqueId
  actor: UserRef
}> & (
  | Readonly<{ outcome: 'answer'; answer: JsonValue }>
  | Readonly<{ outcome: 'approve' | 'reject'; answer?: never }>
)
export type TextBlock = Readonly<{ blockId: OpaqueId; kind: 'text'; text: string }>
export type MediaBlock = Readonly<{
  blockId: OpaqueId
  kind: 'image' | 'audio' | 'video' | 'file'
  media: MediaRef
  delivery: 'model_native' | 'agent_attachment'
}>
export type ToolCallBlock = Readonly<{
  blockId: OpaqueId
  kind: 'tool_call'
  call: CallRef
  action: Action
}>
export type ToolResultBlock = Readonly<{
  blockId: OpaqueId
  kind: 'tool_result'
  call: CallRef
  outcome: 'succeeded' | 'failed' | 'denied_before_execution' |
    'cancelled_before_execution' | 'interrupted' | 'unknown'
  value: JsonValue
}>
export type DeferredReceiptBlock = Readonly<{
  blockId: OpaqueId
  kind: 'deferred_receipt'
  call: CallRef
  request: RequestRef
  continuationId: OpaqueId
  status: 'pending'
}>
export type ContentBlock = TextBlock | MediaBlock | ToolCallBlock | ToolResultBlock | DeferredReceiptBlock
export type InputBlock = TextBlock | MediaBlock
export type Input = Readonly<{
  session: SessionRef
  inputId: OpaqueId
  revision: number
  content: readonly InputBlock[]
  busyBehavior: 'queue' | 'interrupt_then_run'
  literal: boolean
}>
export type ProtocolVersion = Readonly<{ protocolId: string; version: string }>
export type BackgroundDeclaration =
  | Readonly<{ mode: 'unsupported' }>
  | Readonly<{
      mode: 'supported'
      executionOwnerProtocol: ProtocolVersion
      requiredResources: readonly string[]
      reconnectProtocol: ProtocolVersion
      form: 'independent_execution'
      automatic?: Readonly<{ thresholdMs: number; stopMarginMs: number }>
    }>
export type AuthorizationDeclaration = Readonly<{
  version: string
  permissions: readonly string[]
  resourceResolver: Readonly<{ resolverId: string; version: string }>
  grantorKinds: readonly string[]
  impactTemplate: string
}> & Confirmation
export type Command = Readonly<{
  commandKey: string
  inputSchema: JsonObject | boolean
  outputSchema: JsonObject | boolean
  authorization: AuthorizationDeclaration
  effect: 'read' | 'write' | 'external'
  cancellation: 'supported' | 'unsupported'
  background: BackgroundDeclaration
  requiredSkills: readonly DefinitionVersion[]
  environmentCapabilities: readonly string[]
}>
export type ToolDefinition = Readonly<{
  definition: DefinitionVersion
  toolKey: string
  commands: readonly Command[]
}>

export interface DataTypes {
  OpaqueId: OpaqueId
  SessionRef: SessionRef
  AgentRef: AgentRef
  UserRef: UserRef
  MembershipRef: MembershipRef
  DefinitionRef: DefinitionRef
  DefinitionVersion: DefinitionVersion
  RunRef: RunRef
  StepRef: StepRef
  WorkRef: WorkRef
  WorkOwner: WorkOwner
  MediaRef: MediaRef
  MediaMetadata: MediaMetadata
  ResourceRef: ResourceRef
  SecretRef: SecretRef
  Binding: Binding
  Action: Action
  CallRef: CallRef
  RequestRef: RequestRef
  Money: Money
  OperationRef: OperationRef
  Decision: Decision
  Input: Input
  ContentBlock: ContentBlock
  AuthorizationDeclaration: AuthorizationDeclaration
  Command: Command
  ToolDefinition: ToolDefinition
  BackgroundDeclaration: BackgroundDeclaration
  InputBlock: InputBlock
}

const DATA_TYPE_NAMES = [
  'OpaqueId',
  'SessionRef',
  'AgentRef',
  'UserRef',
  'MembershipRef',
  'DefinitionRef',
  'DefinitionVersion',
  'RunRef',
  'StepRef',
  'WorkRef',
  'WorkOwner',
  'MediaRef',
  'MediaMetadata',
  'ResourceRef',
  'SecretRef',
  'Binding',
  'Action',
  'CallRef',
  'RequestRef',
  'Money',
  'OperationRef',
  'Decision',
  'Input',
  'ContentBlock',
  'AuthorizationDeclaration',
  'Command',
  'ToolDefinition',
  'BackgroundDeclaration',
  'InputBlock',
] as const satisfies readonly (keyof DataTypes)[]

export type ValidationIssue = Readonly<{
  path: string
  code: 'invalid_json' | 'schema' | 'unsupported_number' | 'capacity'
  message: string
}>
export type Checked<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>
export type JsonLimits = Readonly<{ maxBytes: number; maxDepth: number; maxNodes: number }>

function readSchema(filename: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(new URL(`./schemas/${filename}`, import.meta.url), 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`schema resource ${filename} is not an object`)
  }
  return value as Record<string, unknown>
}

const identitySchema = readSchema('agent-runtime-identity.schema.json')
const coreWorkSchema = readSchema('core-work.schema.json')
const identitySchemaId = identitySchema.$id
const coreWorkSchemaId = coreWorkSchema.$id
if (typeof identitySchemaId !== 'string' || typeof coreWorkSchemaId !== 'string') {
  throw new TypeError('schema resources must have string $id values')
}

const ajv = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  strictSchema: true,
  strictNumbers: true,
  strictTypes: false,
  strictRequired: false,
  allowUnionTypes: true,
  ownProperties: true,
})
ajv.addSchema(identitySchema)
ajv.addSchema(coreWorkSchema)

const identityTypes = new Set<keyof DataTypes>(['OpaqueId', 'SessionRef', 'AgentRef'])
const validators = new Map<keyof DataTypes, ValidateFunction>()
for (const name of DATA_TYPE_NAMES) {
  const schemaId = identityTypes.has(name) ? identitySchemaId : coreWorkSchemaId
  validators.set(name, ajv.compile({ $ref: `${schemaId}#/$defs/${name}` }))
}

type PathSegment = string | number

type ScanPath = Readonly<{
  parent: ScanPath | undefined
  segment: PathSegment
}>

type ScanFrame =
  | {
      kind: 'array'
      path: ScanPath | undefined
      depth: number
      state: 'firstOrEnd' | 'value' | 'commaOrEnd'
      nextIndex: number
    }
  | {
      kind: 'object'
      path: ScanPath | undefined
      depth: number
      state: 'firstKeyOrEnd' | 'key' | 'colon' | 'value' | 'commaOrEnd'
      key: string | undefined
    }

type Destination =
  | Readonly<{ kind: 'root' }>
  | Readonly<{ kind: 'array'; target: JsonValue[]; index: number }>
  | Readonly<{ kind: 'object'; target: Record<string, JsonValue>; key: string }>

type TreeTask = Readonly<{
  node: JsonNode
  path: readonly PathSegment[]
  depth: number
  destination: Destination
}>

type CopyTask =
  | Readonly<{
      kind: 'visit'
      value: unknown
      path: readonly PathSegment[]
      depth: number
      destination: Destination
    }>
  | Readonly<{ kind: 'leave'; value: object }>

function issue(
  code: ValidationIssue['code'],
  path: string,
  message: string,
): Checked<never> {
  return failed([{ path, code, message }])
}

function passed<T>(value: T): Checked<T> {
  return Object.freeze({ ok: true, value })
}

function failed(issues: readonly ValidationIssue[]): Checked<never> {
  const frozenIssues = Object.freeze(issues.map(entry => Object.freeze({ ...entry })))
  return Object.freeze({ ok: false, issues: frozenIssues })
}

function pointer(path: readonly PathSegment[]): string {
  return path.length === 0
    ? ''
    : `/${path.map(segment => String(segment).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
}

function scanPointer(path: ScanPath | undefined): string {
  const segments: PathSegment[] = []
  for (let current = path; current !== undefined; current = current.parent) {
    segments.push(current.segment)
  }
  segments.reverse()
  return pointer(segments)
}

function preflightCapacity(text: string, limits: JsonLimits): Checked<never> | undefined {
  const scanner = createScanner(text, false)
  const frames: ScanFrame[] = []
  let rootState: 'value' | 'done' = 'value'
  let nodes = 0

  const beginValue = (): Readonly<{ path: ScanPath | undefined; depth: number }> | undefined => {
    const parent = frames.at(-1)
    if (parent === undefined) {
      if (rootState === 'done') return undefined
      rootState = 'done'
      return { path: undefined, depth: 0 }
    }
    if (parent.kind === 'array') {
      if (parent.state !== 'firstOrEnd' && parent.state !== 'value') return undefined
      parent.state = 'commaOrEnd'
      return {
        path: { parent: parent.path, segment: parent.nextIndex },
        depth: parent.depth + 1,
      }
    }
    if (parent.state !== 'value' || parent.key === undefined) return undefined
    parent.state = 'commaOrEnd'
    return {
      path: { parent: parent.path, segment: parent.key },
      depth: parent.depth + 1,
    }
  }

  const enterValue = (): Readonly<{ path: ScanPath | undefined; depth: number }> | Checked<never> | undefined => {
    const value = beginValue()
    if (value === undefined) return undefined
    nodes += 1
    if (nodes > limits.maxNodes) {
      return issue('capacity', scanPointer(value.path), `maximum node count ${limits.maxNodes} exceeded`)
    }
    if (value.depth > limits.maxDepth) {
      return issue('capacity', scanPointer(value.path), `maximum depth ${limits.maxDepth} exceeded`)
    }
    return value
  }

  while (true) {
    const token = scanner.scan()
    if (token === SyntaxKind.EOF) return undefined
    if (token >= SyntaxKind.LineCommentTrivia && token <= SyntaxKind.Trivia) continue

    const frame = frames.at(-1)
    if (token === SyntaxKind.StringLiteral
      && frame?.kind === 'object'
      && (frame.state === 'firstKeyOrEnd' || frame.state === 'key')) {
      frame.key = scanner.getTokenValue()
      frame.state = 'colon'
      continue
    }
    if (token === SyntaxKind.ColonToken && frame?.kind === 'object' && frame.state === 'colon') {
      frame.state = 'value'
      continue
    }
    if (token === SyntaxKind.CommaToken && frame?.state === 'commaOrEnd') {
      if (frame.kind === 'array') {
        frame.nextIndex += 1
        frame.state = 'value'
      } else {
        frame.key = undefined
        frame.state = 'key'
      }
      continue
    }
    if (token === SyntaxKind.CloseBracketToken && frame?.kind === 'array') {
      frames.pop()
      continue
    }
    if (token === SyntaxKind.CloseBraceToken && frame?.kind === 'object') {
      frames.pop()
      continue
    }
    if (token === SyntaxKind.OpenBracketToken || token === SyntaxKind.OpenBraceToken) {
      const value = enterValue()
      if (value !== undefined && 'ok' in value) return value
      if (value === undefined) continue
      frames.push(token === SyntaxKind.OpenBracketToken
        ? { kind: 'array', path: value.path, depth: value.depth, state: 'firstOrEnd', nextIndex: 0 }
        : { kind: 'object', path: value.path, depth: value.depth, state: 'firstKeyOrEnd', key: undefined })
      continue
    }
    if (token === SyntaxKind.StringLiteral
      || token === SyntaxKind.NumericLiteral
      || token === SyntaxKind.NullKeyword
      || token === SyntaxKind.TrueKeyword
      || token === SyntaxKind.FalseKeyword) {
      const value = enterValue()
      if (value !== undefined && 'ok' in value) return value
    }
  }
}

function checkedLimits(limits: JsonLimits): Checked<JsonLimits> {
  if (limits === null || typeof limits !== 'object') {
    return issue('capacity', '', 'limits must be an object')
  }
  for (const name of ['maxBytes', 'maxDepth', 'maxNodes'] as const) {
    const value: unknown = limits[name]
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      return issue('capacity', '', `${name} must be a non-negative safe integer`)
    }
  }
  return passed(limits)
}

type Decimal = Readonly<{ negative: boolean; coefficient: string; exponent: bigint }>

function decimal(token: string): Decimal | undefined {
  const match = /^(-)?(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token)
  if (match === null) return undefined
  const fraction = match[3] ?? ''
  let coefficient = `${match[2]}${fraction}`.replace(/^0+/, '')
  if (coefficient.length === 0) return { negative: match[1] === '-', coefficient: '0', exponent: 0n }
  let exponent = BigInt(match[4] ?? '0') - BigInt(fraction.length)
  const trailing = /0+$/.exec(coefficient)?.[0].length ?? 0
  if (trailing > 0) {
    coefficient = coefficient.slice(0, -trailing)
    exponent += BigInt(trailing)
  }
  return { negative: match[1] === '-', coefficient, exponent }
}

function supportedNumber(token: string, value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) return false
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) return false
  const original = decimal(token)
  const encoded = decimal(JSON.stringify(value))
  return original !== undefined
    && encoded !== undefined
    && original.negative === encoded.negative
    && original.coefficient === encoded.coefficient
    && original.exponent === encoded.exponent
}

function define(target: Record<string, JsonValue>, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

function freezeJson(value: JsonValue): JsonValue {
  const pending: JsonValue[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === null || typeof current !== 'object') continue
    if (Array.isArray(current)) {
      for (const child of current) pending.push(child)
    } else {
      for (const child of Object.values(current)) pending.push(child)
    }
    Object.freeze(current)
  }
  return value
}

function hasIntrinsicConstructor(prototype: object, name: 'Array' | 'Object'): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor')
  const constructor: unknown = descriptor?.value
  if (typeof constructor !== 'function') return false
  try {
    return constructor.name === name
      && constructor.prototype === prototype
      && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`
  } catch {
    return false
  }
}

function isIntrinsicObjectPrototype(value: object): boolean {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, 'Object')
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === null
    || typeof prototype === 'object' && prototype !== null && isIntrinsicObjectPrototype(prototype)
}

function isPlainArray(value: unknown[]): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array')) return false
  const objectPrototype: unknown = Object.getPrototypeOf(prototype)
  return typeof objectPrototype === 'object'
    && objectPrototype !== null
    && isIntrinsicObjectPrototype(objectPrototype)
}

function dataProperties(
  value: object,
  path: readonly PathSegment[],
): Checked<readonly Readonly<{ key: string; value: unknown }>[]> {
  const properties: Readonly<{ key: string; value: unknown }>[] = []
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      return issue('invalid_json', pointer(path), 'symbol properties are not JSON data')
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable) {
      return issue('invalid_json', pointer([...path, key]), 'non-enumerable properties are not JSON data')
    }
    if (!('value' in descriptor)) {
      return issue('invalid_json', pointer([...path, key]), 'accessor properties are not JSON data')
    }
    properties.push({ key, value: descriptor.value })
  }
  return passed(properties)
}

function arrayItems(
  value: unknown[],
  path: readonly PathSegment[],
): Checked<readonly unknown[]> {
  if (!isPlainArray(value)) return issue('invalid_json', pointer(path), 'array must use an intrinsic Array prototype')
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1 || !keys.includes('length')) {
    return issue('invalid_json', pointer(path), 'array must be dense and have no extra properties')
  }
  const items: unknown[] = new Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return issue('invalid_json', pointer([...path, index]), 'array item must be an enumerable data property')
    }
    items[index] = descriptor.value
  }
  return passed(items)
}

function copyValue(value: unknown, limits: JsonLimits): Checked<JsonValue> {
  let root: JsonValue | undefined
  let nodes = 0
  const ancestors = new Set<object>()
  const tasks: CopyTask[] = [{
    kind: 'visit',
    value,
    path: [],
    depth: 0,
    destination: { kind: 'root' },
  }]
  const assign = (destination: Destination, item: JsonValue): void => {
    if (destination.kind === 'root') root = item
    else if (destination.kind === 'array') destination.target[destination.index] = item
    else define(destination.target, destination.key, item)
  }

  while (tasks.length > 0) {
    const task = tasks.pop()
    if (task === undefined) break
    if (task.kind === 'leave') {
      ancestors.delete(task.value)
      continue
    }
    nodes += 1
    if (nodes > limits.maxNodes) {
      return issue('capacity', pointer(task.path), `maximum node count ${limits.maxNodes} exceeded`)
    }
    if (task.depth > limits.maxDepth) {
      return issue('capacity', pointer(task.path), `maximum depth ${limits.maxDepth} exceeded`)
    }

    const current = task.value
    if (current === null || typeof current === 'boolean' || typeof current === 'string') {
      assign(task.destination, current)
      continue
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0) || Number.isInteger(current) && !Number.isSafeInteger(current)) {
        return issue('unsupported_number', pointer(task.path), 'number is not a supported finite JSON number')
      }
      assign(task.destination, current)
      continue
    }
    if (typeof current !== 'object') {
      return issue('invalid_json', pointer(task.path), `value of type ${typeof current} is not JSON data`)
    }
    if (ancestors.has(current)) return issue('invalid_json', pointer(task.path), 'cyclic value is not JSON data')

    if (Array.isArray(current)) {
      const source = arrayItems(current, task.path)
      if (!source.ok) return source
      const remaining = limits.maxNodes - nodes
      if (source.value.length > remaining) {
        return issue('capacity', pointer([...task.path, Math.max(remaining, 0)]), `maximum node count ${limits.maxNodes} exceeded`)
      }
      const target: JsonValue[] = new Array(source.value.length)
      assign(task.destination, target)
      ancestors.add(current)
      tasks.push({ kind: 'leave', value: current })
      for (let index = source.value.length - 1; index >= 0; index -= 1) {
        tasks.push({
          kind: 'visit',
          value: source.value[index],
          path: [...task.path, index],
          depth: task.depth + 1,
          destination: { kind: 'array', target, index },
        })
      }
      continue
    }

    if (!isPlainObject(current)) {
      return issue('invalid_json', pointer(task.path), 'object must use an intrinsic Object or null prototype')
    }
    const source = dataProperties(current, task.path)
    if (!source.ok) return source
    const remaining = limits.maxNodes - nodes
    if (source.value.length > remaining) {
      const blocked = source.value[Math.max(remaining, 0)]
      return issue('capacity', pointer([...task.path, blocked?.key ?? '']), `maximum node count ${limits.maxNodes} exceeded`)
    }
    const target = Object.create(null) as Record<string, JsonValue>
    assign(task.destination, target)
    ancestors.add(current)
    tasks.push({ kind: 'leave', value: current })
    for (let index = source.value.length - 1; index >= 0; index -= 1) {
      const property = source.value[index]
      if (property === undefined) return issue('invalid_json', pointer(task.path), 'object property disappeared')
      tasks.push({
        kind: 'visit',
        value: property.value,
        path: [...task.path, property.key],
        depth: task.depth + 1,
        destination: { kind: 'object', target, key: property.key },
      })
    }
  }

  if (root === undefined) return issue('invalid_json', '', 'value is not JSON data')
  return passed(freezeJson(root))
}

type EncodeTask =
  | Readonly<{ kind: 'value'; value: JsonValue }>
  | Readonly<{ kind: 'text'; value: string }>

function encodeJson(value: JsonValue): string {
  const chunks: string[] = []
  const tasks: EncodeTask[] = [{ kind: 'value', value }]
  while (tasks.length > 0) {
    const task = tasks.pop()
    if (task === undefined) break
    if (task.kind === 'text') {
      chunks.push(task.value)
      continue
    }
    const current = task.value
    if (current === null) {
      chunks.push('null')
    } else if (typeof current === 'boolean' || typeof current === 'number' || typeof current === 'string') {
      chunks.push(JSON.stringify(current))
    } else if (Array.isArray(current)) {
      chunks.push('[')
      tasks.push({ kind: 'text', value: ']' })
      for (let index = current.length - 1; index >= 0; index -= 1) {
        tasks.push({ kind: 'value', value: current[index] as JsonValue })
        if (index > 0) tasks.push({ kind: 'text', value: ',' })
      }
    } else {
      chunks.push('{')
      tasks.push({ kind: 'text', value: '}' })
      const object = current as JsonObject
      const keys = Object.keys(object).sort()
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index]
        if (key === undefined) continue
        tasks.push({ kind: 'value', value: object[key] as JsonValue })
        tasks.push({ kind: 'text', value: ':' })
        tasks.push({ kind: 'text', value: JSON.stringify(key) })
        if (index > 0) tasks.push({ kind: 'text', value: ',' })
      }
    }
  }
  return chunks.join('')
}

function buildTree(text: string, rootNode: JsonNode, limits: JsonLimits): Checked<JsonValue> {
  let root: JsonValue | undefined
  let nodes = 0
  const tasks: TreeTask[] = [{ node: rootNode, path: [], depth: 0, destination: { kind: 'root' } }]
  const assign = (destination: Destination, value: JsonValue): void => {
    if (destination.kind === 'root') root = value
    else if (destination.kind === 'array') destination.target[destination.index] = value
    else define(destination.target, destination.key, value)
  }

  while (tasks.length > 0) {
    const task = tasks.pop()
    if (task === undefined) break
    nodes += 1
    if (nodes > limits.maxNodes) {
      return issue('capacity', pointer(task.path), `maximum node count ${limits.maxNodes} exceeded`)
    }
    if (task.depth > limits.maxDepth) {
      return issue('capacity', pointer(task.path), `maximum depth ${limits.maxDepth} exceeded`)
    }

    const { node } = task
    if (node.type === 'null' || node.type === 'boolean' || node.type === 'string') {
      assign(task.destination, node.value as JsonValue)
      continue
    }
    if (node.type === 'number') {
      const token = text.slice(node.offset, node.offset + node.length)
      if (!supportedNumber(token, node.value)) {
        return issue('unsupported_number', pointer(task.path), `number token is not supported: ${token}`)
      }
      assign(task.destination, node.value as number)
      continue
    }
    if (node.type === 'array') {
      const children = node.children ?? []
      const target: JsonValue[] = new Array(children.length)
      assign(task.destination, target)
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]
        if (child === undefined) return issue('invalid_json', pointer(task.path), 'array node is incomplete')
        tasks.push({
          node: child,
          path: [...task.path, index],
          depth: task.depth + 1,
          destination: { kind: 'array', target, index },
        })
      }
      continue
    }
    if (node.type === 'object') {
      const target = Object.create(null) as Record<string, JsonValue>
      assign(task.destination, target)
      const properties = node.children ?? []
      const seen = new Set<string>()
      const values: Readonly<{ key: string; node: JsonNode }>[] = []
      for (const property of properties) {
        const keyNode = property.children?.[0]
        const valueNode = property.children?.[1]
        if (property.type !== 'property' || keyNode?.type !== 'string' || typeof keyNode.value !== 'string' || valueNode === undefined) {
          return issue('invalid_json', pointer(task.path), 'object property is incomplete')
        }
        const key = keyNode.value
        if (seen.has(key)) {
          return issue('invalid_json', pointer([...task.path, key]), `duplicate object key: ${JSON.stringify(key)}`)
        }
        seen.add(key)
        values.push({ key, node: valueNode })
      }
      for (let index = values.length - 1; index >= 0; index -= 1) {
        const entry = values[index]
        if (entry === undefined) return issue('invalid_json', pointer(task.path), 'object property is incomplete')
        tasks.push({
          node: entry.node,
          path: [...task.path, entry.key],
          depth: task.depth + 1,
          destination: { kind: 'object', target, key: entry.key },
        })
      }
      continue
    }
    return issue('invalid_json', pointer(task.path), `unexpected JSON node: ${node.type}`)
  }

  if (root === undefined) return issue('invalid_json', '', 'JSON input has no value')
  return passed(freezeJson(root))
}

export function parseJson(text: string, limits: JsonLimits): Checked<JsonValue> {
  const validLimits = checkedLimits(limits)
  if (!validLimits.ok) return validLimits
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > limits.maxBytes) {
    return issue('capacity', '', `input byte length ${bytes} exceeds maxBytes ${limits.maxBytes}`)
  }
  const capacity = preflightCapacity(text, limits)
  if (capacity !== undefined) return capacity
  const errors: ParseError[] = []
  const root = parseTree(text, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  })
  const first = errors[0]
  if (first !== undefined) {
    return issue(
      'invalid_json',
      '',
      `${printParseErrorCode(first.error)} at character offset ${first.offset}`,
    )
  }
  if (root === undefined) return issue('invalid_json', '', 'JSON input has no value')
  return buildTree(text, root, limits)
}

export function copyJson(value: unknown, limits: JsonLimits): Checked<JsonValue> {
  const validLimits = checkedLimits(limits)
  if (!validLimits.ok) return validLimits
  const copied = copyValue(value, limits)
  if (!copied.ok) return copied
  const bytes = Buffer.byteLength(encodeJson(copied.value), 'utf8')
  if (bytes > limits.maxBytes) {
    return issue('capacity', '', `canonical byte length ${bytes} exceeds maxBytes ${limits.maxBytes}`)
  }
  return copied
}

export function parseData<K extends keyof DataTypes>(
  type: K,
  value: unknown,
  limits: JsonLimits,
): Checked<DataTypes[K]> {
  const validator = validators.get(type)
  if (validator === undefined) return issue('schema', '', `unknown data type: ${String(type)}`)
  const copied = copyJson(value, limits)
  if (!copied.ok) return copied
  if (!validator(copied.value)) {
    const errors = (validator.errors ?? []).filter(error => error.keyword !== 'if')
    return failed(errors.map(error => ({
        path: schemaIssuePath(error),
        code: 'schema',
        message: `${error.keyword}: ${error.message ?? 'schema validation failed'}`,
      })))
  }
  // The validator is compiled from the exact $defs selected by K; this is the
  // single bridge from its runtime schema proof to the matching static type.
  return passed(copied.value as DataTypes[K])
}

function schemaIssuePath(error: ErrorObject): string {
  if (error.keyword === 'required') {
    const missing: unknown = error.params.missingProperty
    if (typeof missing === 'string') return `${error.instancePath}/${missing.replaceAll('~', '~0').replaceAll('/', '~1')}`
  }
  if (error.keyword === 'additionalProperties') {
    const extra: unknown = error.params.additionalProperty
    if (typeof extra === 'string') return `${error.instancePath}/${extra.replaceAll('~', '~0').replaceAll('/', '~1')}`
  }
  if (error.keyword === 'not' && error.schemaPath.includes('/else/not')) {
    return `${error.instancePath}/answer`
  }
  return error.instancePath
}

export function canonicalJson(value: JsonValue): string {
  const copied = copyValue(value, {
    maxBytes: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
    maxNodes: Number.MAX_SAFE_INTEGER,
  })
  if (!copied.ok) {
    const error = new TypeError(`invalid JSON value at ${copied.issues[0]?.path || '<root>'}: ${copied.issues[0]?.message ?? 'unknown error'}`)
    error.name = 'InvalidJsonValueError'
    throw error
  }
  return encodeJson(copied.value)
}

export function equalJson(a: JsonValue, b: JsonValue): boolean {
  return canonicalJson(a) === canonicalJson(b)
}
