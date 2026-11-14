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

// Content that the peer reports about itself. It is never evidence of identity or authorization.
// A field of this type is read only through `untrusted`.
export type Untrusted<T> = Readonly<{ untrusted: T }>

export type EndpointRef = Readonly<{ name: EndpointName; holding: EndpointHolding }>

export type AuthKind = 'none' | 'static' | 'oauth'

export type EnvironmentBinding = Readonly<{ name: string; source: 'setting' | 'credential' }>

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

export type SettingValue<T> =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid'; text: string }>
  | Readonly<{ kind: 'value'; value: T }>

export type EndpointSettings = Readonly<{
  target: SettingValue<ConnectionTarget>
  credential: SettingValue<CredentialBinding>
  connectTimeout: SettingValue<Millis>
}>

export type PeerAccount =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'credential'; binding: CredentialBinding }>

export type ConnectionKey = Readonly<{
  tenant: TenantId
  holding: EndpointHolding
  adoptionRevision: AdoptionRevision
  account: PeerAccount
}>

export type CatalogKey = Readonly<{
  tenant: TenantId
  account: PeerAccount
  holding: EndpointHolding
}>

export type BoundedInstructions = Readonly<{
  text: string
  truncated: boolean
  digest: InstructionsDigest
}>

export type PeerIdentity = Readonly<{
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
  serverInfo?: Untrusted<JsonValue>
  instructions?: Untrusted<BoundedInstructions & Readonly<{ generation: Generation }>>
}>

export type ActionDefinition = Readonly<{
  name: ActionName
  outputSchema?: JsonValue
  definition: JsonValue
  annotations?: Untrusted<JsonValue>
}>

export type KnownActionId = Readonly<{ endpoint: EndpointName; action: ActionName }>
