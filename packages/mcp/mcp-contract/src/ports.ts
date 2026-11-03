// The five requirement ports that MCP declares. Four are provided outside the group; the
// catalog store keeps the MCP action catalogs. Each port has a conformance suite in `./testing`.
import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import type { Ack, Outcome } from '@omne-harness/operation-result'
import type { ActionCatalogRecord, ExpectedRevision } from './catalog.ts'
import type { BlockedReason } from './outcomes.ts'
import type {
  AdoptionRevision,
  CatalogKey,
  ConnectionTarget,
  CredentialBinding,
  EndpointHolding,
  EndpointRef,
  EndpointSettings,
  StdioLaunch,
} from './values.ts'

/** One non-secret setting value for the process environment of a stdio endpoint. */
export type ProcessSetting = Readonly<{ name: string; value: string }>

/**
 * One adopted endpoint. The revision changes when the body or any setting value changes. A
 * setting without a value is reported as missing; the port fills in no default.
 */
export type AdoptedEndpoint = Readonly<{
  ref: EndpointRef
  revision: AdoptionRevision
  body: JsonValue
  settings: EndpointSettings
  processEnv: readonly ProcessSetting[]
}>

export interface AdoptionView<P, S> {
  /** The endpoints adopted in the scope, for this access. */
  endpoints(access: Access<P>, scope: S): Promise<Outcome<readonly AdoptedEndpoint[], 'unknown'>>
  /** One endpoint by reference. A reference that is not adopted for this access is `not-adopted`. */
  endpoint(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<AdoptedEndpoint | 'not-adopted', 'unknown'>>
}

/**
 * The use eligibility of a principal for an endpoint, decided at each use. `not-eligible` is
 * also the answer for an endpoint that does not exist. A blocked reason is given only to a
 * principal that has use eligibility.
 */
export type EligibilityVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused'; reason: 'not-eligible' | BlockedReason }>
  | Readonly<{ kind: 'unknown' }>

export interface UseEligibility<P> {
  check(access: Access<P>, endpoint: EndpointRef): Promise<EligibilityVerdict>
}

/** What a credential handle is used for. A handle for HTTP is bound to one connection target. */
export type CredentialPurpose =
  | Readonly<{ kind: 'process-env' }>
  | Readonly<{ kind: 'http-authorization'; target: ConnectionTarget }>

/**
 * A limited use of one MCP credential of one holding. It is not a secret value, and no member
 * of it reveals one.
 */
export interface CredentialHandle {
  /** Authorizes one outgoing HTTP request by setting its headers. */
  authorize(headers: Headers): Promise<Ack<'rejected' | 'unknown'>>
  /** Reports that the peer refused the authorization of this handle. */
  reportRejection(): Promise<void>
  release(): Promise<void>
}

export interface CredentialUse<P> {
  acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: CredentialPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<CredentialHandle, 'missing' | 'rejected' | 'unknown'>>
}

/** The stop range that a process handle confirmed. */
export type StopScope = 'tree-confirmed' | 'root-only' | 'unconfirmed'

/** One local process. Its standard error is masked of secret values before it is handed over. */
export interface ProcessHandle {
  readonly stdin: WritableStream<Uint8Array>
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<string>
  /** Resolves when the root process has exited. */
  readonly exited: Promise<void>
  /** Stops the process and all its descendants, and reports the range it confirmed. */
  stop(): Promise<StopScope>
}

/** The environment of a process: non-secret values, and variables a credential handle fills. */
export type ProcessEnvironment = Readonly<{
  values: readonly ProcessSetting[]
  credentials: readonly Readonly<{ name: string; handle: CredentialHandle }>[]
}>

export interface ProcessLanding<P> {
  start(
    access: Access<P>,
    launch: StdioLaunch,
    env: ProcessEnvironment,
  ): Promise<Outcome<ProcessHandle, 'landing-invalid' | 'facility-missing' | 'unknown'>>
}

export interface CatalogStore {
  read(key: CatalogKey): Promise<Outcome<ActionCatalogRecord | 'absent', 'unavailable'>>
  /** Writes the whole record only when the stored revision equals `expected`. */
  write(
    key: CatalogKey,
    record: ActionCatalogRecord,
    expected: ExpectedRevision,
  ): Promise<Ack<'unavailable' | 'revision-conflict'>>
}
