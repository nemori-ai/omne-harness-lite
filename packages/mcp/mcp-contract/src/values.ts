// The composite MCP value objects. Their primitive members are the brands of `brands.ts`.
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ActionName,
  AdoptionRevision,
  ConnectionTarget,
  CredentialBinding,
  EndpointHolding,
  EndpointName,
  Generation,
  InstructionsDigest,
  Millis,
  ProtocolVersion,
} from './brands.ts'

/**
 * Content that the peer reports about itself. It is never evidence of identity or
 * authorization. A field of this type is read only through `untrusted`.
 */
export type Untrusted<T> = Readonly<{ untrusted: T }>

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

/**
 * The value of one setting as the adoption reports it: no value, a value that its brand guard
 * refused (with the text as configured), or a checked value. Nothing is defaulted.
 */
export type SettingValue<T> =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid'; text: string }>
  | Readonly<{ kind: 'value'; value: T }>

/** The values of the three fixed settings. */
export type EndpointSettings = Readonly<{
  target: SettingValue<ConnectionTarget>
  credential: SettingValue<CredentialBinding>
  connectTimeout: SettingValue<Millis>
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

/** Peer instructions cut to the configured byte bound, with the digest of the whole text. */
export type BoundedInstructions = Readonly<{
  text: string
  truncated: boolean
  digest: InstructionsDigest
}>

/** The negotiated facts of one connection, and what the peer says about itself. */
export type PeerIdentity = Readonly<{
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
  serverInfo: Untrusted<JsonValue>
  instructions?: Untrusted<BoundedInstructions & Readonly<{ generation: Generation }>>
}>

/**
 * The latest lawful definition of a peer action, kept as the peer wrote it. `definition` is the
 * peer object without `annotations`; the annotations are kept apart because they are untrusted.
 * `name` and `outputSchema` are read from the same object.
 */
export type ActionDefinition = Readonly<{
  name: ActionName
  outputSchema?: JsonValue
  definition: JsonValue
  annotations?: Untrusted<JsonValue>
}>

/** The identity of a known action: the endpoint name and the peer action name. */
export type KnownActionId = Readonly<{ endpoint: EndpointName; action: ActionName }>
