// The provider of the three identity operations and the standing read over the SQL storage
// contract (identity SPEC ID-16, ID-17; DP-3). Every computation that is not SQL happens here, in
// the main thread: input checks, scrypt, identities, digests, deadlines and result mapping. The
// participant and the read handlers in `./worker` only run statements. A reply to the caller
// never carries a credential, a proof or a login identifier in a diagnostic.
import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLES,
  DEFAULT_TEAM_ROLE_MAPPING,
  qualificationsOf,
  type IdentityClock,
  type IdentityOperations,
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
  type Instant,
} from '@omne-harness/utc-instant'
import { addDuration, isPositive } from './deadline.ts'
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

/** The stricter input rules of this provider (DP3-C8). Both bounds are inclusive UTF-8 byte counts. */
export const LOGIN_IDENTIFIER_UTF8_LIMIT = 1024
export const CREDENTIAL_UTF8_LIMIT = 4096

export type IdentitySqlInput = Readonly<{
  storage: SqlStorage
  clock: IdentityClock
  terms: LoginTermsSource
  /** An open scrypt module. The caller closes it after `stop()`. */
  scrypt: ScryptModule
  /** Material derived from a random secret at start, compared for an unknown account (DP3-C6). */
  decoyMaterial: string
  identifiers?: IdentifierSource
}>

export type IdentitySql = Readonly<{
  operations: IdentityOperations
  standing: TenantStandingSource
  /** New calls get the stopped answers (DP3-C16). Calls already accepted run to their end. */
  stop(): void
}>

/** The result of a commit or an issue is not known. The message names no secret. */
export class IdentitySqlResultUnknown extends Error {
  override readonly name = 'IdentitySqlResultUnknown'
}

type Unavailable = Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>
type TimeBasis = Readonly<{ kind: 'read'; instant: Instant }> | Unavailable
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

function unavailable(diagnostic: string): Unavailable {
  return Object.freeze({ kind: 'basis-unavailable', diagnostic })
}

function field(input: unknown, name: string): unknown {
  return isRecord(input) ? input[name] : undefined
}

function utf8Within(value: string, limit: number): boolean {
  return Buffer.byteLength(value, 'utf8') <= limit
}

type CredentialInput = Readonly<{ loginIdentifier: string; credential: string }>

/** Non-empty text within the byte bounds; anything else is a malformed input. */
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

function readReason(result: Exclude<ReadResult, { kind: 'read' }>): string {
  return result.kind === 'cancelled' ? 'cancelled' : result.reason
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

// --- Read output parsing: the Worker answers JSON, judged once here. ------------------------

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
  if (!isRecord(login) || !LOGIN_FIELDS.every(name => isText(login[name]))) return undefined
  const typed = login as Readonly<Record<(typeof LOGIN_FIELDS)[number], string>>
  return {
    login: {
      login: typed.login,
      account: typed.account,
      tenantText: typed.tenantText,
      issuedAt: typed.issuedAt,
      maxDeadline: typed.maxDeadline,
      idleDeadline: typed.idleDeadline,
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

/**
 * Creates the provider over an injected storage, clock, terms and scrypt module. There is no
 * default for any of them, and the factory reads no wall clock. It registers nothing: the caller
 * registers the identity combination (`identitySqlRegistration()`) before the first operation.
 */
export function createIdentitySql(input: IdentitySqlInput): IdentitySql {
  const { storage, clock, terms, scrypt, decoyMaterial } = input
  const identifiers = input.identifiers ?? randomIdentifiers()
  const combination = identitySqlCombination()
  let stopped = false
  // The latest clock reading this instance adopted. An earlier reading is not adopted (ID-17).
  let latest: Instant | undefined

  // --- Injected bases -----------------------------------------------------------------------

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

  // --- Storage ------------------------------------------------------------------------------

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

  // --- Operations (ID-17) ------------------------------------------------------------------

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

  // The steps follow SPEC ID-17 "签发登录" and DP3-C9; an earlier step's answer wins.
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
    // 2. A malformed input. An over-long value can belong to no account (DP3-C8).
    const parsed = parseCredentialInput(input)
    if (parsed === undefined) return UNIFORM_AUTH_FAILURE
    // 3. The account rows and the login table, read before the credential is compared.
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
    // 4. The comparison. An unknown account compares against the decoy, through the same module.
    const compared = await compare(found.account?.material ?? decoyMaterial, parsed.credential)
    if (typeof compared !== 'string')
      return unavailable(`credential-check-unavailable:${compared.unavailable}`)
    if (found.account === null || personal === undefined || compared === 'mismatch')
      return UNIFORM_AUTH_FAILURE
    // 5. A new, independent login. A write that is not known to be committed rejects the promise.
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

  // The steps follow SPEC ID-17 "识别登录" and DP3-C11; an earlier step's answer wins.
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
    // The lower bound of this reading is the later of the adopted reading and the issue time.
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

  // --- Standing (ID-16, DP3-C12) ------------------------------------------------------------

  const readStanding: TenantStandingSource['read'] = async input => {
    if (stopped) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    const encoded = tenantCodec.encode(field(input, 'tenant') as TenantId)
    const tenantText = encoded.ok ? encoded.value : ''
    // The evidence of a non-member comes from the input alone, so it tells nothing about the rows.
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

  return Object.freeze({
    operations: Object.freeze({ registerAndActivate, issueLogin, recognizeLogin }),
    standing: Object.freeze({ read: readStanding }),
    stop() {
      stopped = true
    },
  })
}
