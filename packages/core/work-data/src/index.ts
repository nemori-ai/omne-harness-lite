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

export type ValidationIssue = Readonly<{
  path: string
  code: 'invalid_json' | 'schema' | 'unsupported_number' | 'capacity'
  message: string
}>
export type Checked<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>
export type JsonLimits = Readonly<{ maxBytes: number; maxDepth: number; maxNodes: number }>

type PathSegment = string | number

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

function issue(
  code: ValidationIssue['code'],
  path: string,
  message: string,
): Checked<never> {
  return { ok: false, issues: [{ path, code, message }] }
}

function pointer(path: readonly PathSegment[]): string {
  return path.length === 0
    ? ''
    : `/${path.map(segment => String(segment).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
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
  return { ok: true, value: limits }
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
  return { ok: true, value: freezeJson(root) }
}

export function parseJson(text: string, limits: JsonLimits): Checked<JsonValue> {
  const validLimits = checkedLimits(limits)
  if (!validLimits.ok) return validLimits
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > limits.maxBytes) {
    return issue('capacity', '', `input byte length ${bytes} exceeds maxBytes ${limits.maxBytes}`)
  }
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

export function copyJson(_value: unknown, _limits: JsonLimits): Checked<JsonValue> {
  return issue('invalid_json', '', 'copyJson is not implemented')
}

export function parseData<K extends keyof DataTypes>(
  _type: K,
  _value: unknown,
  _limits: JsonLimits,
): Checked<DataTypes[K]> {
  return issue('invalid_json', '', 'parseData is not implemented')
}

export function canonicalJson(_value: JsonValue): string {
  throw new TypeError('canonicalJson is not implemented')
}

export function equalJson(_a: JsonValue, _b: JsonValue): boolean {
  return false
}
import { parseTree, printParseErrorCode } from 'jsonc-parser'
import type { Node as JsonNode, ParseError } from 'jsonc-parser'
