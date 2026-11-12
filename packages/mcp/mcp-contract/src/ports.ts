// The four requirement ports that MCP declares. Three are provided outside the group; the
// catalog store keeps the MCP action catalogs. Each port has a conformance suite in `./testing`.
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
import type { CatalogKey, EndpointRef, EndpointSettings } from './values.ts'

/**
 * One adopted endpoint. The revision changes when the body or any setting value changes. A
 * setting without a value is reported as absent, and a value its guard refuses as invalid; the
 * port fills in no default.
 */
export type AdoptedEndpoint = Readonly<{
  ref: EndpointRef
  revision: AdoptionRevision
  body: JsonValue
  settings: EndpointSettings
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

/** What a credential handle is used for: outgoing HTTP requests to one connection target. */
export type HttpPurpose = Readonly<{ kind: 'http-authorization'; target: ConnectionTarget }>

/**
 * A limited use of one MCP credential for outgoing HTTP requests to one connection target. It is
 * not a secret value, and no member of it reveals one.
 */
export interface HttpCredentialHandle {
  readonly purpose: 'http-authorization'
  /** Authorizes one outgoing HTTP request by setting its headers. */
  authorize(headers: Headers): Promise<Ack<'rejected' | 'unknown'>>
  /** Reports that the peer refused a request that this handle authorized. */
  reportRejection(): Promise<void>
  release(): Promise<void>
}

export type CredentialFailure = 'missing' | 'rejected' | 'unknown'

export interface CredentialUse<P> {
  acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
}

/** The clock of the MCP services: the instant that the catalog freshness is stamped with. */
export interface McpClock {
  now(): Date
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
