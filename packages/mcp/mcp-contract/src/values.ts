// The MCP value objects. Each brand is granted by exactly one guard in this file; no other
// module asserts a brand.
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

/** The name of an endpoint: the capability name of the MCP asset. */
export type EndpointName = Brand<string, 'EndpointName'>
/** The holding of an endpoint asset. MCP does not read it; it only compares it. */
export type EndpointHolding = Brand<string, 'EndpointHolding'>
/** The adoption revision. It changes when the body or any setting value changes. */
export type AdoptionRevision = Brand<string, 'AdoptionRevision'>
/** A reference to one MCP credential of the tenant. It is not a secret value. */
export type CredentialBinding = Brand<string, 'CredentialBinding'>
/** The name of a peer action, as the peer wrote it. */
export type ActionName = Brand<string, 'ActionName'>
/** The content digest of the latest lawful definition of a known action. */
export type DefinitionDigest = Brand<string, 'DefinitionDigest'>
/** The generation of one MCP connection. */
export type Generation = Brand<number, 'Generation'>
/** The revision of one MCP action catalog. */
export type CatalogRevision = Brand<number, 'CatalogRevision'>
/** The correlation key that the caller gives. It is not an MCP identity. */
export type CorrelationKey = Brand<string, 'CorrelationKey'>
/** The opaque request state of a multi round-trip request, as the peer wrote it. */
export type RequestState = Brand<string, 'RequestState'>
/** The task identifier, as the peer wrote it. */
export type TaskId = Brand<string, 'TaskId'>
/** A negotiated protocol version, as the peer wrote it. */
export type ProtocolVersion = Brand<string, 'ProtocolVersion'>
/** A positive span of time in whole milliseconds. */
export type Millis = Brand<number, 'Millis'>
/** A syntactically checked absolute `http` or `https` address. It is a setting, not body text. */
export type ConnectionTarget = Brand<string, 'ConnectionTarget'>

/**
 * Content that the peer reports about itself. It is never evidence of identity or
 * authorization. A field of this type is read only through `untrusted`.
 */
export type Untrusted<T> = Readonly<{ untrusted: T }>

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const NAME_MAX = 64
const DIGEST = /^sha256:[0-9a-f]{64}$/u
// The scheme, then a non-empty authority.
const SCHEME = /^https?:\/\/[^/?#\\]/u
const WHITESPACE = /\s/u

/** True for whitespace, a C0 or C1 control character, or DEL. */
function hasUnsafeCharacter(text: string): boolean {
  if (WHITESPACE.test(text)) return true
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isWhole(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

export function isEndpointName(value: unknown): value is EndpointName {
  return typeof value === 'string' && value.length <= NAME_MAX && NAME.test(value)
}

export function isEndpointHolding(value: unknown): value is EndpointHolding {
  return isText(value)
}

export function isAdoptionRevision(value: unknown): value is AdoptionRevision {
  return isText(value)
}

export function isCredentialBinding(value: unknown): value is CredentialBinding {
  return isText(value)
}

export function isActionName(value: unknown): value is ActionName {
  return isText(value)
}

export function isDefinitionDigest(value: unknown): value is DefinitionDigest {
  return typeof value === 'string' && DIGEST.test(value)
}

export function isGeneration(value: unknown): value is Generation {
  return isWhole(value, 0)
}

export function isCatalogRevision(value: unknown): value is CatalogRevision {
  return isWhole(value, 1)
}

export function isCorrelationKey(value: unknown): value is CorrelationKey {
  return isText(value)
}

export function isRequestState(value: unknown): value is RequestState {
  return isText(value)
}

export function isTaskId(value: unknown): value is TaskId {
  return isText(value)
}

export function isProtocolVersion(value: unknown): value is ProtocolVersion {
  return isText(value)
}

export function isMillis(value: unknown): value is Millis {
  return isWhole(value, 1)
}

/**
 * Syntax only: lower-case `http` or `https`, absolute, a host, no fragment, no user
 * information, and no whitespace, control character or backslash anywhere. The text is not repaired. The
 * check does not decide that the peer is trustworthy, and it does not find secrets in the text.
 */
export function isConnectionTarget(value: unknown): value is ConnectionTarget {
  if (typeof value !== 'string' || !SCHEME.test(value) || hasUnsafeCharacter(value)) return false
  if (value.includes('#') || value.includes('\\')) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.hostname !== '' && url.username === '' && url.password === ''
}

/** Names an endpoint: the endpoint name and its holding. It carries no tenant and no account. */
export type EndpointRef = Readonly<{ name: EndpointName; holding: EndpointHolding }>

export type AuthKind = 'none' | 'static' | 'oauth'

/**
 * One variable of the process environment. `setting` takes the non-secret setting value of the
 * same name from the adoption; `credential` is filled from a credential handle when the process
 * starts. The body never carries a value.
 */
export type EnvironmentBinding = Readonly<{ name: string; source: 'setting' | 'credential' }>

/** The launch declaration of a stdio endpoint. The command is one program; no shell reads it. */
export type StdioLaunch = Readonly<{
  command: string
  args: readonly string[]
  cwd?: string
  env: readonly EnvironmentBinding[]
  facilities: readonly string[]
}>

export type TransportDeclaration =
  | Readonly<{ kind: 'stdio'; launch: StdioLaunch }>
  | Readonly<{ kind: 'streamable-http' }>

export type EndpointDefinition = Readonly<{
  name: EndpointName
  transport: TransportDeclaration
  auth: AuthKind
}>

/** The values of the three fixed settings. A missing value stays missing; nothing is defaulted. */
export type EndpointSettings = Readonly<{
  target?: ConnectionTarget
  credential?: CredentialBinding
  connectTimeout?: Millis
}>

/** The peer account. Only `peerAccountOf` derives it. */
export type PeerAccount =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'credential'; binding: CredentialBinding }>

/** The key of one MCP connection. Two tenants or two peer accounts never share a connection. */
export type ConnectionKey = Readonly<{
  tenant: TenantId
  holding: EndpointHolding
  adoptionRevision: AdoptionRevision
  account: PeerAccount
}>

/** The key of one MCP action catalog. It has no protocol version and no adoption revision. */
export type CatalogKey = Readonly<{
  tenant: TenantId
  account: PeerAccount
  holding: EndpointHolding
}>

/** The negotiated facts of one connection, and what the peer says about itself. */
export type PeerIdentity = Readonly<{
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
  serverInfo: Untrusted<JsonValue>
  instructions?: Untrusted<
    Readonly<{ text: string; truncated: boolean; digest: string; generation: Generation }>
  >
}>

export type TaskSupport = 'forbidden' | 'optional' | 'required'

/**
 * The latest lawful definition of a peer action, kept as the peer wrote it. `definition` is the
 * peer object without `annotations`; the annotations are kept apart because they are untrusted.
 * `name`, `taskSupport` and `outputSchema` are read from the same object.
 */
export type ActionDefinition = Readonly<{
  name: ActionName
  taskSupport: TaskSupport
  outputSchema?: JsonValue
  definition: JsonValue
  annotations?: Untrusted<JsonValue>
}>

/** The identity of a known action: the endpoint name and the peer action name. */
export type KnownActionId = Readonly<{ endpoint: EndpointName; action: ActionName }>

export type CallMode = 'direct' | 'task'
