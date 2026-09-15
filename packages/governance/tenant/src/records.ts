import type {
  Checked,
  MembershipRef,
  OpaqueId,
  UserRef,
  ValidationIssue,
} from '@omne-harness-lite/work-data'
import type { Counter, OwnedRecord, Principal } from '@omne-harness-lite/records'

export type TenantKind = 'personal' | 'organization'
export type MemberRole = 'owner' | 'super_admin' | 'member'
export type MemberState = 'active' | 'suspended' | 'removed'

export type Member = Readonly<{
  member: MembershipRef
  role: MemberRole
  state: MemberState
  revision: Counter
  joinedRevision: Counter
  delegatedOperations: readonly string[]
}>

export type Tenant = Readonly<{
  tenantId: OpaqueId
  kind: TenantKind
  creator: Principal
  status: 'active'
  members: readonly Member[]
}>

export type BootstrapEstablished = Readonly<{
  bootstrapId: OpaqueId
  deploymentId: OpaqueId
  seedPrincipal: Principal
  initialRights: readonly string[]
}>

export type PersonalTenantClaim = Readonly<{
  user: UserRef
  tenantId: OpaqueId
}>

export type TenantRecordEvent =
  | Readonly<{ kind: 'tenant.bootstrap_established'; data: BootstrapEstablished }>
  | Readonly<{ kind: 'tenant.personal_claimed'; data: PersonalTenantClaim }>
  | Readonly<{ kind: 'tenant.created'; data: Readonly<{ tenant: Tenant }> }>
  | Readonly<{
      kind: 'tenant.member_changed'
      data: Readonly<{ member: Member; previousRevision: Counter; reason: string }>
    }>

export type MembershipJoin = Readonly<Pick<Member, 'member' | 'joinedRevision'>>

/** Derived fold state retains every consumed membership join so a removed identity cannot revive. */
export type TenantFoldState = Readonly<{
  tenant: Tenant
  joinHistory: readonly MembershipJoin[]
}>

class RecordShapeError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message)
  }
}

function checked<T>(work: () => T): Checked<T> {
  try {
    return Object.freeze({ ok: true, value: work() })
  } catch (error) {
    const issue: ValidationIssue = Object.freeze({
      path: error instanceof RecordShapeError ? error.path : '',
      code: 'schema',
      message: error instanceof Error ? error.message : 'invalid tenant record',
    })
    return Object.freeze({ ok: false, issues: Object.freeze([issue]) })
  }
}

function plainObject(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RecordShapeError(path, 'must be an object')
  }
  const prototype = Reflect.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RecordShapeError(path, 'must be a plain object')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor)) throw new RecordShapeError(`${path}/${key}`, 'accessor rejected')
  }
  return value as Readonly<Record<string, unknown>>
}

function exactObject(
  value: unknown,
  path: string,
  required: readonly string[],
): Readonly<Record<string, unknown>> {
  const object = plainObject(value, path)
  const keys = Object.keys(object)
  for (const key of required) {
    if (!Object.hasOwn(object, key)) throw new RecordShapeError(`${path}/${key}`, 'field required')
  }
  for (const key of keys) {
    if (!required.includes(key)) throw new RecordShapeError(`${path}/${key}`, 'unknown field')
  }
  return object
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RecordShapeError(path, 'must be a non-empty string')
  }
  return value
}

function counter(value: unknown, path: string, positive = false): Counter {
  const text = nonEmptyString(value, path)
  if (!/^(0|[1-9][0-9]*)$/.test(text) || (positive && text === '0')) {
    throw new RecordShapeError(path, positive ? 'must be a positive counter' : 'invalid counter')
  }
  return text
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw new RecordShapeError(path, 'must be an array')
  const result = value.map((entry, index) => nonEmptyString(entry, `${path}/${index}`))
  if (new Set(result).size !== result.length) {
    throw new RecordShapeError(path, 'must not contain duplicates')
  }
  return Object.freeze(result)
}

function user(value: unknown, path: string): UserRef {
  const object = exactObject(value, path, ['userId'])
  return Object.freeze({ userId: nonEmptyString(object.userId, `${path}/userId`) })
}

function principal(value: unknown, path: string): Principal {
  const object = plainObject(value, path)
  if (object.kind === 'user') {
    const exact = exactObject(value, path, ['kind', 'user'])
    return Object.freeze({ kind: 'user', user: user(exact.user, `${path}/user`) })
  }
  if (object.kind === 'system') {
    const exact = exactObject(value, path, ['kind', 'systemId'])
    return Object.freeze({
      kind: 'system',
      systemId: nonEmptyString(exact.systemId, `${path}/systemId`),
    })
  }
  throw new RecordShapeError(`${path}/kind`, 'unknown principal kind')
}

function member(value: unknown, path: string): Member {
  const object = exactObject(value, path, [
    'member',
    'role',
    'state',
    'revision',
    'joinedRevision',
    'delegatedOperations',
  ])
  const reference = exactObject(object.member, `${path}/member`, ['tenantId', 'userId'])
  const role = object.role
  if (role !== 'owner' && role !== 'super_admin' && role !== 'member') {
    throw new RecordShapeError(`${path}/role`, 'unknown member role')
  }
  const state = object.state
  if (state !== 'active' && state !== 'suspended' && state !== 'removed') {
    throw new RecordShapeError(`${path}/state`, 'unknown member state')
  }
  return Object.freeze({
    member: Object.freeze({
      tenantId: nonEmptyString(reference.tenantId, `${path}/member/tenantId`),
      userId: nonEmptyString(reference.userId, `${path}/member/userId`),
    }),
    role,
    state,
    revision: counter(object.revision, `${path}/revision`, true),
    joinedRevision: counter(object.joinedRevision, `${path}/joinedRevision`, true),
    delegatedOperations: stringArray(object.delegatedOperations, `${path}/delegatedOperations`),
  })
}

function validateTenantInvariant(tenant: Tenant, path: string): void {
  if (tenant.members.length === 0)
    throw new RecordShapeError(`${path}/members`, 'must not be empty')
  const users = new Set<string>()
  for (const entry of tenant.members) {
    if (entry.member.tenantId !== tenant.tenantId) {
      throw new RecordShapeError(`${path}/members`, 'membership tenant does not match')
    }
    if (users.has(entry.member.userId)) {
      throw new RecordShapeError(`${path}/members`, 'duplicate member user')
    }
    users.add(entry.member.userId)
  }
  if (tenant.kind === 'personal') {
    const owner = tenant.members[0]
    if (
      tenant.members.length !== 1 ||
      owner?.role !== 'owner' ||
      owner.state !== 'active' ||
      tenant.creator.kind !== 'user' ||
      owner.member.userId !== tenant.creator.user.userId
    ) {
      throw new RecordShapeError(path, 'personal tenant must have its creator as sole active owner')
    }
    return
  }
  if (tenant.members.some(entry => entry.role === 'owner')) {
    throw new RecordShapeError(`${path}/members`, 'organization cannot contain owner role')
  }
  if (!tenant.members.some(entry => entry.role === 'super_admin' && entry.state === 'active')) {
    throw new RecordShapeError(`${path}/members`, 'organization requires an active super_admin')
  }
}

function tenant(value: unknown, path: string): Tenant {
  const object = exactObject(value, path, ['tenantId', 'kind', 'creator', 'status', 'members'])
  const kind = object.kind
  if (kind !== 'personal' && kind !== 'organization') {
    throw new RecordShapeError(`${path}/kind`, 'unknown tenant kind')
  }
  if (object.status !== 'active') {
    throw new RecordShapeError(`${path}/status`, 'unsupported tenant status')
  }
  if (!Array.isArray(object.members)) {
    throw new RecordShapeError(`${path}/members`, 'must be an array')
  }
  const result: Tenant = Object.freeze({
    tenantId: nonEmptyString(object.tenantId, `${path}/tenantId`),
    kind,
    creator: principal(object.creator, `${path}/creator`),
    status: 'active',
    members: Object.freeze(
      object.members.map((entry, index) => member(entry, `${path}/members/${index}`)),
    ),
  })
  validateTenantInvariant(result, path)
  return result
}

function decode(value: OwnedRecord): TenantRecordEvent {
  const record = exactObject(value, '', ['kind', 'version', 'data'])
  const kind = nonEmptyString(record.kind, '/kind')
  if (record.version !== '1') throw new RecordShapeError('/version', 'unsupported record version')
  if (kind === 'tenant.bootstrap_established') {
    const data = exactObject(record.data, '/data', [
      'bootstrapId',
      'deploymentId',
      'seedPrincipal',
      'initialRights',
    ])
    return Object.freeze({
      kind,
      data: Object.freeze({
        bootstrapId: nonEmptyString(data.bootstrapId, '/data/bootstrapId'),
        deploymentId: nonEmptyString(data.deploymentId, '/data/deploymentId'),
        seedPrincipal: principal(data.seedPrincipal, '/data/seedPrincipal'),
        initialRights: stringArray(data.initialRights, '/data/initialRights'),
      }),
    })
  }
  if (kind === 'tenant.personal_claimed') {
    const data = exactObject(record.data, '/data', ['user', 'tenantId'])
    return Object.freeze({
      kind,
      data: Object.freeze({
        user: user(data.user, '/data/user'),
        tenantId: nonEmptyString(data.tenantId, '/data/tenantId'),
      }),
    })
  }
  if (kind === 'tenant.created') {
    const data = exactObject(record.data, '/data', ['tenant'])
    return Object.freeze({
      kind,
      data: Object.freeze({ tenant: tenant(data.tenant, '/data/tenant') }),
    })
  }
  if (kind === 'tenant.member_changed') {
    const data = exactObject(record.data, '/data', ['member', 'previousRevision', 'reason'])
    return Object.freeze({
      kind,
      data: Object.freeze({
        member: member(data.member, '/data/member'),
        previousRevision: counter(data.previousRevision, '/data/previousRevision'),
        reason: nonEmptyString(data.reason, '/data/reason'),
      }),
    })
  }
  throw new RecordShapeError('/kind', `unknown tenant record kind: ${kind}`)
}

export function decodeTenantRecord(record: OwnedRecord): Checked<TenantRecordEvent> {
  return checked(() => decode(record))
}

function snapshotBootstrap(value: BootstrapEstablished): BootstrapEstablished {
  const decoded = decode({ kind: 'tenant.bootstrap_established', version: '1', data: value })
  if (decoded.kind !== 'tenant.bootstrap_established') {
    throw new RecordShapeError('/kind', 'invalid bootstrap record')
  }
  return decoded.data
}

export function foldBootstrapRecords(
  previous: BootstrapEstablished | null,
  records: readonly OwnedRecord[],
): Checked<BootstrapEstablished> {
  return checked(() => {
    let state = previous === null ? null : snapshotBootstrap(previous)
    for (const record of records) {
      const event = decode(record)
      if (event.kind !== 'tenant.bootstrap_established') {
        throw new RecordShapeError('/kind', 'record does not belong to the bootstrap stream')
      }
      if (state !== null) throw new RecordShapeError('/kind', 'bootstrap was already established')
      state = event.data
    }
    if (state === null) throw new RecordShapeError('', 'bootstrap stream is empty')
    return state
  })
}

function snapshotClaims(values: readonly PersonalTenantClaim[]): readonly PersonalTenantClaim[] {
  const claims: PersonalTenantClaim[] = []
  const users = new Set<string>()
  const tenants = new Set<string>()
  for (const value of values) {
    const decoded = decode({ kind: 'tenant.personal_claimed', version: '1', data: value })
    if (decoded.kind !== 'tenant.personal_claimed') {
      throw new RecordShapeError('/kind', 'invalid personal claim')
    }
    if (users.has(decoded.data.user.userId) || tenants.has(decoded.data.tenantId)) {
      throw new RecordShapeError('/data', 'personal claim identity was already used')
    }
    users.add(decoded.data.user.userId)
    tenants.add(decoded.data.tenantId)
    claims.push(decoded.data)
  }
  return Object.freeze(claims)
}

export function foldPersonalClaims(
  previous: readonly PersonalTenantClaim[],
  records: readonly OwnedRecord[],
): Checked<readonly PersonalTenantClaim[]> {
  return checked(() => {
    const claims = [...snapshotClaims(previous)]
    const users = new Set(claims.map(entry => entry.user.userId))
    const tenants = new Set(claims.map(entry => entry.tenantId))
    for (const record of records) {
      const event = decode(record)
      if (event.kind !== 'tenant.personal_claimed') {
        throw new RecordShapeError('/kind', 'record does not belong to the personal index')
      }
      if (users.has(event.data.user.userId) || tenants.has(event.data.tenantId)) {
        throw new RecordShapeError('/data', 'personal claim identity was already used')
      }
      users.add(event.data.user.userId)
      tenants.add(event.data.tenantId)
      claims.push(event.data)
    }
    return Object.freeze(claims)
  })
}

function nextCounter(value: Counter): Counter {
  return (BigInt(value) + 1n).toString()
}

function snapshotFoldState(value: TenantFoldState): TenantFoldState {
  const currentTenant = tenant(value.tenant, '/state/tenant')
  if (!Array.isArray(value.joinHistory)) {
    throw new RecordShapeError('/state/joinHistory', 'must be an array')
  }
  const history = value.joinHistory.map((entry, index) => {
    const path = `/state/joinHistory/${index}`
    const object = exactObject(entry, path, ['member', 'joinedRevision'])
    const reference = exactObject(object.member, `${path}/member`, ['tenantId', 'userId'])
    const result: MembershipJoin = Object.freeze({
      member: Object.freeze({
        tenantId: nonEmptyString(reference.tenantId, `${path}/member/tenantId`),
        userId: nonEmptyString(reference.userId, `${path}/member/userId`),
      }),
      joinedRevision: counter(object.joinedRevision, `${path}/joinedRevision`, true),
    })
    if (result.member.tenantId !== currentTenant.tenantId) {
      throw new RecordShapeError(`${path}/member/tenantId`, 'membership tenant does not match')
    }
    return result
  })
  const keys = history.map(joinKey)
  if (new Set(keys).size !== keys.length) {
    throw new RecordShapeError('/state/joinHistory', 'must not contain duplicates')
  }
  for (const entry of currentTenant.members) {
    if (!keys.includes(joinKey(entry))) {
      throw new RecordShapeError('/state/joinHistory', 'missing current membership join')
    }
  }
  return Object.freeze({
    tenant: currentTenant,
    joinHistory: Object.freeze(history),
  })
}

function joinKey(value: MembershipJoin): string {
  return JSON.stringify([value.member.tenantId, value.member.userId, value.joinedRevision])
}

function applyMemberChange(
  state: TenantFoldState,
  event: Extract<TenantRecordEvent, { kind: 'tenant.member_changed' }>,
): TenantFoldState {
  const changed = event.data.member
  if (changed.member.tenantId !== state.tenant.tenantId) {
    throw new RecordShapeError(
      '/data/member/member/tenantId',
      'membership tenant does not match stream root',
    )
  }
  const members = [...state.tenant.members]
  const index = members.findIndex(entry => entry.member.userId === changed.member.userId)
  const previous = members[index]
  const used = new Set(state.joinHistory.map(joinKey))
  const history = [...state.joinHistory]
  if (previous === undefined) {
    if (
      event.data.previousRevision !== '0' ||
      changed.revision !== '1' ||
      changed.state !== 'active'
    ) {
      throw new RecordShapeError(
        '/data/member',
        'new member must begin active at revision 1 from revision 0',
      )
    }
    if (used.has(joinKey(changed))) {
      throw new RecordShapeError('/data/member/joinedRevision', 'membership join was already used')
    }
    members.push(changed)
    history.push(Object.freeze({ member: changed.member, joinedRevision: changed.joinedRevision }))
    used.add(joinKey(changed))
  } else {
    if (
      event.data.previousRevision !== previous.revision ||
      changed.revision !== nextCounter(previous.revision)
    ) {
      throw new RecordShapeError(
        '/data/member/revision',
        'member revision is not the next expected revision',
      )
    }
    if (previous.member.tenantId !== changed.member.tenantId) {
      throw new RecordShapeError('/data/member/member', 'member identity changed')
    }
    if (previous.state === 'removed') {
      if (
        changed.state !== 'active' ||
        changed.joinedRevision === previous.joinedRevision ||
        used.has(joinKey(changed))
      ) {
        throw new RecordShapeError(
          '/data/member/joinedRevision',
          'rejoin requires a new unused join revision',
        )
      }
      history.push(
        Object.freeze({ member: changed.member, joinedRevision: changed.joinedRevision }),
      )
      used.add(joinKey(changed))
    } else if (changed.joinedRevision !== previous.joinedRevision) {
      throw new RecordShapeError(
        '/data/member/joinedRevision',
        'ordinary change must retain join revision',
      )
    }
    members[index] = changed
  }
  const nextTenant: Tenant = Object.freeze({
    ...state.tenant,
    members: Object.freeze(members),
  })
  return Object.freeze({
    tenant: nextTenant,
    joinHistory: Object.freeze(history),
  })
}

/**
 * Fold one tenant stream append. Cross-member invariants are checked on the final append result,
 * allowing an atomic transfer to avoid inventing a transient role state between its records.
 */
export function foldTenantRecords(
  previous: TenantFoldState | null,
  records: readonly OwnedRecord[],
): Checked<TenantFoldState> {
  return checked(() => {
    let state = previous === null ? null : snapshotFoldState(previous)
    for (const record of records) {
      const event = decode(record)
      if (event.kind === 'tenant.created') {
        if (state !== null) throw new RecordShapeError('/kind', 'tenant was already created')
        state = Object.freeze({
          tenant: event.data.tenant,
          joinHistory: Object.freeze(
            event.data.tenant.members.map(entry =>
              Object.freeze({
                member: entry.member,
                joinedRevision: entry.joinedRevision,
              }),
            ),
          ),
        })
        const keys = state.joinHistory.map(joinKey)
        if (new Set(keys).size !== keys.length) {
          throw new RecordShapeError('/data/tenant/members', 'membership joins must be unique')
        }
        continue
      }
      if (event.kind !== 'tenant.member_changed') {
        throw new RecordShapeError('/kind', 'record does not belong to a tenant root stream')
      }
      if (state === null)
        throw new RecordShapeError('/kind', 'member change precedes tenant creation')
      state = applyMemberChange(state, event)
    }
    if (state === null) throw new RecordShapeError('', 'tenant stream is empty')
    validateTenantInvariant(state.tenant, '/tenant')
    return state
  })
}
