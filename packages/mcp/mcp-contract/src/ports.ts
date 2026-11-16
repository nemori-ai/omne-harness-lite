import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import type { Ack, Outcome } from '@omne-harness/operation-result'
import type {
  AdoptionRevision,
  ConnectionTarget,
  CredentialBinding,
  EndpointHolding,
} from './brands.ts'
import type { ActionCatalogRecord, ExpectedRevision } from './catalog.ts'
import type { BlockedReason } from './outcomes.ts'
import type { CatalogKey, EndpointRef, EndpointSettings, StdioLaunch } from './values.ts'

export type ProcessSetting = Readonly<{ name: string; value: string }>

export type AdoptedEndpoint = Readonly<{
  ref: EndpointRef
  revision: AdoptionRevision
  body: JsonValue
  settings: EndpointSettings
  processEnv: readonly ProcessSetting[]
}>

export interface AdoptionView<P, S> {
  endpoints(access: Access<P>, scope: S): Promise<Outcome<readonly AdoptedEndpoint[], 'unknown'>>
  endpoint(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<AdoptedEndpoint | 'not-adopted', 'unknown'>>
}

export type EligibilityVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused'; reason: 'not-eligible' | BlockedReason }>
  | Readonly<{ kind: 'unknown' }>

export interface UseEligibility<P> {
  check(access: Access<P>, endpoint: EndpointRef): Promise<EligibilityVerdict>
}

export type ProcessPurpose = Readonly<{ kind: 'process-env' }>
export type HttpPurpose = Readonly<{ kind: 'http-authorization'; target: ConnectionTarget }>
export type CredentialPurpose = ProcessPurpose | HttpPurpose

export interface HttpCredentialHandle {
  readonly purpose: 'http-authorization'
  authorize(headers: Headers): Promise<Ack<'rejected' | 'unknown'>>
  reportRejection(): Promise<void>
  release(): Promise<void>
}

export interface ProcessCredentialHandle {
  readonly purpose: 'process-env'
  release(): Promise<void>
}

export type CredentialFailure = 'missing' | 'rejected' | 'unknown'

export interface CredentialUse<P> {
  acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: ProcessPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<ProcessCredentialHandle, CredentialFailure>>
  acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
}

export interface McpClock {
  now(): Date
}

export type StopScope = 'tree-confirmed' | 'root-only' | 'unconfirmed'

export interface ProcessHandle {
  readonly stdin: WritableStream<Uint8Array>
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<string>
  readonly exited: Promise<void>
  stop(): Promise<StopScope>
}

export type ProcessEnvironment = Readonly<{
  values: readonly ProcessSetting[]
  credentials: readonly Readonly<{ name: string; handle: ProcessCredentialHandle }>[]
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
  write(
    key: CatalogKey,
    record: ActionCatalogRecord,
    expected: ExpectedRevision,
  ): Promise<Ack<'unavailable' | 'revision-conflict'>>
}
