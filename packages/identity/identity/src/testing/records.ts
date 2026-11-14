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

export type IdentityRecords = Readonly<{
  accountsByIdentifier: Map<string, AccountRecord>
  accountsById: Map<string, AccountRecord>
  organizations: Map<string, OrganizationRecord>
  memberships: Map<string, MembershipRecord>
  loginsByProof: Map<string, LoginRecord>
  loginsById: Map<string, LoginRecord>
  invitations: Map<string, InvitationRecord>
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

export type Instance = {
  readonly clock: IdentityClock
  readonly faults: RecordStoreFaults
  readonly off: ReadonlySet<DoubleCheck>
  latest: Instant | undefined
}

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

export function randomBody(): string {
  return [...randomBytes(26)].map(byte => ID_ALPHABET[byte % 32]).join('')
}

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

export function isLive(record: LoginRecord, now: Instant): boolean {
  return (
    !record.revoked &&
    compareInstants(now, record.maxDeadline) < 0 &&
    compareInstants(now, record.idleDeadline) < 0
  )
}
