import { coordinationOver } from './coordination.ts'
import type {
  PrincipalVerifier,
  StandingDestinationResolver,
  StandingReservations,
  IdentityGovernanceRecovery,
} from '@omne-harness/identity'
import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLES,
  DEFAULT_TEAM_ROLE_MAPPING,
  qualificationsOf,
  type IdentityClock,
  type IdentityGovernance,
  type IdentityOperations,
  type InvitationTermsSource,
  type IssueLoginOutcome,
  type LoginRecognition,
  type LoginTerms,
  type LoginTermsSource,
  type RegisterAndActivateOutcome,
  type RoleRef,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { ScryptModule } from '@omne-harness/scrypt'
import type {
  CommitResultV2,
  DomainRef,
  JsonValue,
  ReadResult,
  SqlIdentity,
  SqlStorage,
} from '@omne-harness/sql-contract'
import {
  compareInstants,
  encodeDuration,
  encodeInstant,
  parseInstant,
  type Duration,
  type Instant,
} from '@omne-harness/utc-instant'
import { addDuration, isPositive } from './deadline.ts'
import { governanceOver } from './governance.ts'
import {
  newLoginProof,
  operationKey,
  randomIdentifiers,
  requestKey,
  sha256Hex,
  type IdentifierSource,
} from './identifiers.ts'
import { IDENTITY_DOMAIN, IDENTITY_SCOPE, identitySqlCombination } from './materials.ts'
import {
  IdentitySqlResultUnknown,
  readReason,
  unavailable,
  type TimeBasis,
  type Unavailable,
} from './result.ts'
import {
  HANDLERS,
  IDENTITY_PARTICIPANT,
  MEMBERSHIP_ACTIVE,
  OPERATIONS,
  isRecord,
  isText,
  type IdentityFacts,
  type IssueBasisOutput,
  type LoginByProofOutput,
  type StandingOutput,
} from './worker/schema.ts'

export const LOGIN_IDENTIFIER_UTF8_LIMIT = 1024
export const CREDENTIAL_UTF8_LIMIT = 4096

export type IdentitySqlInput = Readonly<{
  storage: SqlStorage
  clock: IdentityClock
  terms: LoginTermsSource
  invitationTerms: InvitationTermsSource
  accessRefreshGranularity: Duration
  scrypt: ScryptModule
  decoyMaterial: string
  identifiers?: IdentifierSource
  principalVerifier?: PrincipalVerifier
  destinationResolver?: StandingDestinationResolver
}>

export type IdentitySql = Readonly<{
  operations: IdentityOperations
  standing: TenantStandingSource
  governance: IdentityGovernance
  reservations: StandingReservations
  governanceRecovery: IdentityGovernanceRecovery
  stop(): void
}>

export { IdentitySqlResultUnknown }

type TermsBasis = Readonly<{ kind: 'read'; terms: LoginTerms }> | Unavailable
type Comparison = 'match' | 'mismatch' | Readonly<{ unavailable: string }>
type Recall = 'committed' | 'not-committed' | 'unknown'

const NOT_LOGINABLE: RegisterAndActivateOutcome = Object.freeze({ kind: 'not-loginable' })
const UNIFORM_AUTH_FAILURE: IssueLoginOutcome = Object.freeze({ kind: 'uniform-auth-failure' })
const INVALID: LoginRecognition = Object.freeze({ kind: 'invalid' })
const ACCEPT_ANY_SECRET = (): { ok: true } => ({ ok: true })
const DOMAIN: DomainRef = Object.freeze({
  scope: IDENTITY_SCOPE,
  transactionDomain: IDENTITY_DOMAIN,
})
const STANDING_RECORD_PREFIX = 'identity-sql/membership/'
const PERSONAL_ROLE: RoleRef = Object.freeze({
  model: DEFAULT_TEAM_MODEL,
  role: DEFAULT_TEAM_ROLES.superAdmin,
})

function field(input: unknown, name: string): unknown {
  return isRecord(input) ? input[name] : undefined
}

function utf8Within(value: string, limit: number): boolean {
  return Buffer.byteLength(value, 'utf8') <= limit
}

type CredentialInput = Readonly<{ loginIdentifier: string; credential: string }>

function parseCredentialInput(input: unknown): CredentialInput | undefined {
  const loginIdentifier = field(input, 'loginIdentifier')
  const credential = field(input, 'credential')
  if (
    !isText(loginIdentifier) ||
    loginIdentifier === '' ||
    !isText(credential) ||
    credential === ''
  )
    return undefined
  if (
    !utf8Within(loginIdentifier, LOGIN_IDENTIFIER_UTF8_LIMIT) ||
    !utf8Within(credential, CREDENTIAL_UTF8_LIMIT)
  )
    return undefined
  return { loginIdentifier, credential }
}

function encodeTenant(value: TenantId): string {
  const encoded = tenantCodec.encode(value)
  if (!encoded.ok) throw new TypeError('a minted tenant did not encode')
  return encoded.value
}

function parseTenantOf(organization: string, account: string): TenantId | undefined {
  const parsedOrganization = organizationCodec.parse(organization)
  const parsedAccount = accountCodec.parse(account)
  return parsedOrganization.ok && parsedAccount.ok
    ? tenant(parsedOrganization.value, parsedAccount.value)
    : undefined
}

function parseIssueBasis(output: JsonValue): IssueBasisOutput | undefined {
  if (!isRecord(output)) return undefined
  const account = output['account']
  if (account === null) return { account: null }
  if (
    !isRecord(account) ||
    !isText(account['account']) ||
    !isText(account['organization']) ||
    !isText(account['material'])
  )
    return undefined
  return {
    account: {
      account: account['account'],
      organization: account['organization'],
      material: account['material'],
    },
  }
}

const LOGIN_FIELDS = [
  'login',
  'account',
  'tenantText',
  'issuedAt',
  'maxDeadline',
  'idleDeadline',
] as const

function parseLoginByProof(output: JsonValue): LoginByProofOutput | undefined {
  if (!isRecord(output)) return undefined
  const login = output['login']
  if (login === null) return { login: null }
  if (
    !isRecord(login) ||
    !LOGIN_FIELDS.every(name => isText(login[name])) ||
    typeof login['revoked'] !== 'boolean'
  )
    return undefined
  const typed = login as Readonly<Record<(typeof LOGIN_FIELDS)[number], string>>
  return {
    login: {
      login: typed.login,
      account: typed.account,
      tenantText: typed.tenantText,
      issuedAt: typed.issuedAt,
      maxDeadline: typed.maxDeadline,
      idleDeadline: typed.idleDeadline,
      revoked: login['revoked'],
    },
  }
}

const MEMBERSHIP_FIELDS = ['state', 'roleModel', 'roleModelRevision', 'role', 'revision'] as const

function parseStanding(output: JsonValue): StandingOutput | undefined {
  if (!isRecord(output)) return undefined
  const membership = output['membership']
  if (membership === null) return { membership: null }
  if (!isRecord(membership) || !MEMBERSHIP_FIELDS.every(name => isText(membership[name])))
    return undefined
  const typed = membership as Readonly<Record<(typeof MEMBERSHIP_FIELDS)[number], string>>
  return {
    membership: {
      state: typed.state,
      roleModel: typed.roleModel,
      roleModelRevision: typed.roleModelRevision,
      role: typed.role,
      revision: typed.revision,
    },
  }
}

type LoginRecord = Readonly<{
  login: ReturnType<typeof loginStateCodec.parse>
  account: ReturnType<typeof accountCodec.parse>
  tenant: ReturnType<typeof tenantCodec.parse>
  issuedAt: ReturnType<typeof parseInstant>
  maxDeadline: ReturnType<typeof parseInstant>
  idleDeadline: ReturnType<typeof parseInstant>
}>

function decodeLogin(row: NonNullable<LoginByProofOutput['login']>): LoginRecord {
  return {
    login: loginStateCodec.parse(row.login),
    account: accountCodec.parse(row.account),
    tenant: tenantCodec.parse(row.tenantText),
    issuedAt: parseInstant(row.issuedAt),
    maxDeadline: parseInstant(row.maxDeadline),
    idleDeadline: parseInstant(row.idleDeadline),
  }
}

export function createIdentitySql(input: IdentitySqlInput): IdentitySql {
  const { storage, clock, terms, invitationTerms, scrypt, decoyMaterial } = input
  const identifiers = input.identifiers ?? randomIdentifiers()
  const combination = identitySqlCombination()
  let stopped = false
  let latest: Instant | undefined

  const readTime = async (floor?: Instant): Promise<TimeBasis> => {
    let reading
    try {
      reading = await clock.now()
    } catch {
      return unavailable('clock-failed')
    }
    if (reading.kind !== 'read') return unavailable('clock-unavailable')
    if (latest !== undefined && compareInstants(reading.instant, latest) < 0)
      return unavailable('clock-earlier-than-adopted')
    if (floor !== undefined && compareInstants(reading.instant, floor) < 0)
      return unavailable('clock-earlier-than-record')
    latest = reading.instant
    return Object.freeze({ kind: 'read', instant: reading.instant })
  }

  const readTerms = async (): Promise<TermsBasis> => {
    let reading
    try {
      reading = await terms.read()
    } catch {
      return unavailable('terms-failed')
    }
    if (reading.kind !== 'read') return unavailable('terms-unavailable')
    if (!isPositive(reading.terms.maxLifetime) || !isPositive(reading.terms.idlePeriod))
      return unavailable('terms-not-positive')
    return Object.freeze({ kind: 'read', terms: reading.terms })
  }

  const derive = async (secret: string): Promise<string | undefined> => {
    const admitted = scrypt.derive(secret, ACCEPT_ANY_SECRET)
    if (!('done' in admitted)) return undefined
    const done = await admitted.done
    return done.code === 'material' ? done.material : undefined
  }

  const compare = async (material: string, secret: string): Promise<Comparison> => {
    const admitted = scrypt.verify(material, secret)
    if (!('done' in admitted))
      return admitted.code === 'mismatch' ? 'mismatch' : { unavailable: admitted.code }
    const done = await admitted.done
    return done.code === 'match' || done.code === 'mismatch'
      ? done.code
      : { unavailable: done.code }
  }

  const commit = (operation: string, facts: IdentityFacts): Promise<CommitResultV2> => {
    const identity: SqlIdentity = {
      ...DOMAIN,
      operation,
      protocolVersion: '2',
      operationKey: operationKey(),
    }
    return storage.commit({
      identity,
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: [{ participant: IDENTITY_PARTICIPANT, facts }],
    })
  }

  const recall = async (identity: SqlIdentity, attempts: number): Promise<Recall> => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await storage.query(identity)
      if (result.kind === 'committed') return 'committed'
      if (result.kind === 'rolled_back' || result.kind === 'not_committed') return 'not-committed'
    }
    return 'unknown'
  }

  const read = (handler: string, input: JsonValue): Promise<ReadResult> =>
    storage.read({ domain: DOMAIN, handler, protocol: '1', requestKey: requestKey(), input })

  const registerAndActivate: IdentityOperations['registerAndActivate'] = async input => {
    const parsed = parseCredentialInput(input)
    if (parsed === undefined || stopped) return NOT_LOGINABLE
    const material = await derive(parsed.credential)
    if (material === undefined) return NOT_LOGINABLE
    const account = identifiers.account()
    const organization = identifiers.organization()
    const personal = tenant(organization, account)
    const result = await commit(OPERATIONS.register, {
      kind: 'register',
      loginIdentifier: parsed.loginIdentifier,
      account: account.text,
      organization: organization.text,
      tenantText: encodeTenant(personal),
      material,
      roleModel: PERSONAL_ROLE.model.model,
      roleModelRevision: PERSONAL_ROLE.model.revision,
      role: PERSONAL_ROLE.role,
    })
    const succeeded = (): RegisterAndActivateOutcome =>
      Object.freeze({ kind: 'succeeded', account, organization, tenant: personal })
    switch (result.kind) {
      case 'committed':
        return succeeded()
      case 'rolled_back':
      case 'rejected_before_accept':
        return NOT_LOGINABLE
      case 'unknown': {
        const recalled = await recall(result.identity, 3)
        if (recalled === 'committed') return succeeded()
        if (recalled === 'not-committed') return NOT_LOGINABLE
        throw new IdentitySqlResultUnknown('the registration commit result stays unknown')
      }
      case 'identity_conflict':
        throw new IdentitySqlResultUnknown('the registration operation key was already used')
      default: {
        const _exhaustive: never = result
        throw new IdentitySqlResultUnknown(`unexpected commit result ${String(_exhaustive)}`)
      }
    }
  }

  const issueLogin: IdentityOperations['issueLogin'] = async input => {
    // 1. The basis comes first, so `basis-unavailable` never tells whether the credential matches.
    if (stopped) return unavailable('provider-stopped')
    const time = await readTime()
    if (time.kind !== 'read') return time
    const lifetimes = await readTerms()
    if (lifetimes.kind !== 'read') return lifetimes
    const maxDeadline = addDuration(time.instant, lifetimes.terms.maxLifetime)
    const idleDeadline = addDuration(time.instant, lifetimes.terms.idlePeriod)
    if (maxDeadline === undefined || idleDeadline === undefined)
      return unavailable('deadline-out-of-range')
    const parsed = parseCredentialInput(input)
    if (parsed === undefined) return UNIFORM_AUTH_FAILURE
    const basis = await read(HANDLERS.issueBasis, { loginIdentifier: parsed.loginIdentifier })
    if (basis.kind !== 'read') return unavailable(`account-basis-unavailable:${readReason(basis)}`)
    const found = parseIssueBasis(basis.output)
    if (found === undefined) return unavailable('account-basis-malformed')
    const personal =
      found.account === null
        ? undefined
        : parseTenantOf(found.account.organization, found.account.account)
    if (found.account !== null && personal === undefined)
      return unavailable('account-basis-malformed')
    const compared = await compare(found.account?.material ?? decoyMaterial, parsed.credential)
    if (typeof compared !== 'string')
      return unavailable(`credential-check-unavailable:${compared.unavailable}`)
    if (found.account === null || personal === undefined || compared === 'mismatch')
      return UNIFORM_AUTH_FAILURE
    const login = identifiers.login()
    const proof = newLoginProof()
    const result = await commit(OPERATIONS.issueLogin, {
      kind: 'issue-login',
      login: login.text,
      account: found.account.account,
      tenantText: encodeTenant(personal),
      proofDigest: proof.digest,
      issuedAt: encodeInstant(time.instant),
      maxDeadline: encodeInstant(maxDeadline),
      idleDeadline: encodeInstant(idleDeadline),
      maxLifetime: encodeDuration(lifetimes.terms.maxLifetime),
      idlePeriod: encodeDuration(lifetimes.terms.idlePeriod),
    })
    const settled = result.kind === 'unknown' ? await recall(result.identity, 1) : result.kind
    if (settled !== 'committed')
      throw new IdentitySqlResultUnknown(`the login record was not committed (${settled})`)
    return Object.freeze({
      kind: 'succeeded',
      login,
      account: personal.account,
      loginIdentifier: parsed.loginIdentifier,
      issuedAt: time.instant,
      maxDeadline,
      idleDeadline,
      tenant: personal,
      loginProof: proof.proof,
    })
  }

  const recognizeLogin: IdentityOperations['recognizeLogin'] = async input => {
    const loginProof = field(input, 'loginProof')
    if (!isText(loginProof) || loginProof === '') return INVALID
    if (stopped) return unavailable('provider-stopped')
    const found = await read(HANDLERS.loginByProof, { proofDigest: sha256Hex(loginProof) })
    if (found.kind !== 'read') return unavailable(`login-record-unavailable:${readReason(found)}`)
    const output = parseLoginByProof(found.output)
    if (output === undefined) return unavailable('login-record-malformed')
    if (output.login === null) return INVALID
    const record = decodeLogin(output.login)
    if (
      !record.login.ok ||
      !record.account.ok ||
      !record.tenant.ok ||
      !record.issuedAt.ok ||
      !record.maxDeadline.ok ||
      !record.idleDeadline.ok
    )
      return unavailable('login-record-malformed')
    // A revoked login has ended: after step 3, before the clock is read (ID-18).
    if (output.login.revoked) return INVALID
    const time = await readTime(record.issuedAt.value)
    if (time.kind !== 'read') return time
    if (
      compareInstants(time.instant, record.maxDeadline.value) >= 0 ||
      compareInstants(time.instant, record.idleDeadline.value) >= 0
    )
      return INVALID
    return Object.freeze({
      kind: 'recognized',
      account: record.account.value,
      login: record.login.value,
      tenant: record.tenant.value,
    })
  }

  const readStanding: TenantStandingSource['read'] = async input => {
    if (stopped) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    const encoded = tenantCodec.encode(field(input, 'tenant') as TenantId)
    const tenantText = encoded.ok ? encoded.value : ''
    const record = `${STANDING_RECORD_PREFIX}${sha256Hex(tenantText)}`
    const notMember: TenantStandingReading = Object.freeze({
      kind: 'not-member',
      evidence: Object.freeze({ record, revision: '0' }),
    })
    if (!encoded.ok) return notMember
    const found = await read(HANDLERS.standing, { tenantText })
    if (found.kind !== 'read')
      return { kind: 'unavailable', diagnostic: `membership-unavailable:${readReason(found)}` }
    const output = parseStanding(found.output)
    if (output === undefined) return { kind: 'unavailable', diagnostic: 'membership-malformed' }
    if (output.membership === null || output.membership.state !== MEMBERSHIP_ACTIVE)
      return notMember
    const role: RoleRef = {
      model: { model: output.membership.roleModel, revision: output.membership.roleModelRevision },
      role: output.membership.role,
    }
    const resolved = qualificationsOf(DEFAULT_TEAM_ROLE_MAPPING, role)
    if ('failure' in resolved)
      return { kind: 'unavailable', diagnostic: `role-mapping:${resolved.failure.reason}` }
    return Object.freeze({
      kind: 'member',
      role,
      qualifications: resolved.ok,
      evidence: Object.freeze({ record, revision: output.membership.revision }),
    })
  }

  const coordination = coordinationOver({
    stopped: () => stopped,
    readTime: () => readTime(),
    commit: (facts, identity) =>
      storage.commit({
        identity,
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [{ participant: IDENTITY_PARTICIPANT, facts }],
      }),
    query: identity => storage.query(identity),
    read: input => read('identity.coordination', input),
    ...(input.principalVerifier === undefined ? {} : { verifier: input.principalVerifier }),
    ...(input.destinationResolver === undefined ? {} : { resolver: input.destinationResolver }),
  })
  const governance = governanceOver(
    {
      stopped: () => stopped,
      readTime: () => readTime(),
      commit,
      writeMembership: coordination.writeMembership,
      query: identity => storage.query(identity),
      read,
    },
    { invitationTerms, identifiers, accessRefreshGranularity: input.accessRefreshGranularity },
  )

  return Object.freeze({
    operations: Object.freeze({ registerAndActivate, issueLogin, recognizeLogin }),
    standing: Object.freeze({ read: readStanding }),
    governance,
    reservations: coordination.reservations,
    governanceRecovery: coordination.governanceRecovery,
    stop() {
      stopped = true
    },
  })
}
