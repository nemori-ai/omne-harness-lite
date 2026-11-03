// The records that the in-process reference double keeps for one deployment, shared by its
// operations and its governance (SPEC ID-17, ID-18), and the helpers both use. Records outlive a
// provider instance: `restart` makes new instances over the same records, the way a durable
// provider reopens its store. The latest adopted clock reading belongs to an instance.
import { randomBytes } from 'node:crypto'
import type {
  AccountId,
  IdentityTextCodec,
  LoginStateId,
  OrganizationId,
  TenantId,
} from '@omne-harness/legal-identity'
import { compareInstants, type Duration, type Instant } from '@omne-harness/utc-instant'
import type { CreateOrganizationOutcome, InvitationState } from '../governance.ts'
import type { IdentityClock } from '../operations.ts'
import type { RecordStore, RecordStoreFaults } from './controls.ts'

export type AccountRecord = Readonly<{
  account: AccountId
  loginIdentifier: string
  personal: OrganizationId
  tenant: TenantId
  salt: Uint8Array
  digest: Uint8Array
}>

export type OrganizationRecord = Readonly<{
  organization: OrganizationId
  kind: 'personal' | 'team'
}>

export type MembershipRecord = {
  readonly organization: OrganizationId
  readonly account: AccountId
  readonly tenant: TenantId
  state: 'active' | 'removed'
  role: string
}

export type LoginRecord = {
  readonly login: LoginStateId
  readonly account: AccountId
  readonly issuedAt: Instant
  readonly maxDeadline: Instant
  readonly idlePeriod: Duration
  idleDeadline: Instant
  selection: TenantId
  revoked: boolean
}

export type InvitationRecord = {
  readonly invitation: string
  readonly organization: OrganizationId
  readonly invitedAccount: AccountId
  readonly expiresAt: Instant
  state: InvitationState
}

export type CreateReceipt = Readonly<{
  name: string
  governanceModelId: string
  outcome: CreateOrganizationOutcome
}>

/** Everything one deployment of the double has committed. Keys are identity texts. */
export type IdentityRecords = Readonly<{
  accountsByIdentifier: Map<string, AccountRecord>
  accountsById: Map<string, AccountRecord>
  organizations: Map<string, OrganizationRecord>
  /** Keyed by `memberKey(organization, account)`. */
  memberships: Map<string, MembershipRecord>
  loginsByProof: Map<string, LoginRecord>
  loginsById: Map<string, LoginRecord>
  invitations: Map<string, InvitationRecord>
  /** Keyed by account text, a space, and the create call id. */
  receipts: Map<string, CreateReceipt>
}>

export function newRecords(): IdentityRecords {
  return Object.freeze({
    accountsByIdentifier: new Map(),
    accountsById: new Map(),
    organizations: new Map(),
    memberships: new Map(),
    loginsByProof: new Map(),
    loginsById: new Map(),
    invitations: new Map(),
    receipts: new Map(),
  })
}

export function memberKey(organization: OrganizationId, account: AccountId): string {
  return `${organization.text} ${account.text}`
}

/**
 * The checks of the double that a negative control can switch off, one at a time, to show that a
 * contract case turns red without it. Product code and the public `./testing` entry never switch
 * one off.
 */
export type DoubleCheck =
  | 'acting-tenant'
  | 'atomic-commit'
  | 'create-binding'
  | 'duration-range'
  | 'expected-role'
  | 'expiry-persisted'
  | 'initiator-valid'
  | 'invitation-visibility'
  | 'invitee-only'
  | 'last-admin'
  | 'list-completeness'
  | 'model'
  | 'personal-organization'
  | 'refresh-live-only'
  | 'removed-requires-admin'
  | 'revocation-ends-recognition'
  | 'single-terminal'
  | 'super-admin'
  | 'switch-membership'
  | 'uniform-not-visible'

export type Unavailable = Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

export type TimeBasis = Readonly<{ kind: 'read'; instant: Instant }> | Unavailable

/** One provider instance: its injections, its latest adopted reading and the switched-off checks. */
export type Instance = {
  readonly clock: IdentityClock
  readonly faults: RecordStoreFaults
  readonly off: ReadonlySet<DoubleCheck>
  latest: Instant | undefined
}

// An atomic identity body is 26 characters from this 32-character alphabet, which leaves out i, l,
// o and u.
const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

export function randomBody(): string {
  return [...randomBytes(26)].map(byte => ID_ALPHABET[byte % 32]).join('')
}

/** The owner emits lexically valid text, then parses it like any caller (SPEC "已采用的纯值边界"). */
export function emit<T>(codec: IdentityTextCodec<T>, prefix: string): T {
  const parsed = codec.parse(`${prefix}${randomBody()}`)
  if (!parsed.ok) throw new TypeError(`emitted ${prefix} text did not parse`)
  return parsed.value
}

export function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function field(input: unknown, name: string): unknown {
  return typeof input === 'object' && input !== null
    ? (input as Readonly<Record<string, unknown>>)[name]
    : undefined
}

export function unavailable(diagnostic: string): Unavailable {
  return Object.freeze({ kind: 'basis-unavailable', diagnostic })
}

/** Reads the clock. An earlier reading than the latest adopted one is not adopted (SPEC ID-17). */
export async function readTime(instance: Instance): Promise<TimeBasis> {
  let reading
  try {
    reading = await instance.clock.now()
  } catch {
    return unavailable('the clock failed')
  }
  if (reading.kind !== 'read') return unavailable(`the clock is unavailable: ${reading.diagnostic}`)
  if (instance.latest !== undefined && compareInstants(reading.instant, instance.latest) < 0)
    return unavailable('the clock reads earlier than the latest reading adopted')
  instance.latest = reading.instant
  return Object.freeze({ kind: 'read', instant: reading.instant })
}

export function storeDown(instance: Instance, store: RecordStore): Unavailable | undefined {
  const diagnostic = instance.faults.unavailable(store)
  return diagnostic === undefined
    ? undefined
    : unavailable(`the ${store} store does not answer: ${diagnostic}`)
}

/** True while the login is not revoked and `now` reaches neither deadline. */
export function isLive(record: LoginRecord, now: Instant): boolean {
  return (
    !record.revoked &&
    compareInstants(now, record.maxDeadline) < 0 &&
    compareInstants(now, record.idleDeadline) < 0
  )
}
