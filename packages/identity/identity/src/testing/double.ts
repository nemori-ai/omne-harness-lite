// The in-process reference double of the identity operations (SPEC ID-17). It implements one
// provisioning scheme only: the account is active as soon as it registers. Accounts and logins live
// in memory; a credential is kept as a salted digest. It is not durable and holds in one process.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  tenant,
  type AccountId,
  type IdentityTextCodec,
  type LoginStateId,
  type TenantId,
} from '@omne-harness/legal-identity'
import { compareInstants, type Instant } from '@omne-harness/utc-instant'
import type {
  IdentityOperations,
  IdentityOperationsOptions,
  IssueLoginOutcome,
  LoginRecognition,
  LoginTerms,
  RegisterAndActivateOutcome,
} from '../operations.ts'
import type { RecordStoreFaults } from './controls.ts'
import { addDuration, isPositive } from './time.ts'

/** The injected clock and terms, and an optional fault switch for the two record stores. */
export type InProcessIdentityOptions = IdentityOperationsOptions &
  Readonly<{ faults?: RecordStoreFaults }>

// The lexicon of an atomic identity body: 26 characters, no i, l, o or u.
const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

type AccountRecord = Readonly<{
  account: AccountId
  tenant: TenantId
  salt: Buffer
  digest: Buffer
}>

type LoginRecord = Readonly<{
  login: LoginStateId
  account: AccountId
  tenant: TenantId
  maxDeadline: Instant
  idleDeadline: Instant
}>

type Unavailable = Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

type TimeBasis = Readonly<{ kind: 'read'; instant: Instant }> | Unavailable

const NOT_LOGINABLE: RegisterAndActivateOutcome = Object.freeze({ kind: 'not-loginable' })
const UNIFORM_AUTH_FAILURE: IssueLoginOutcome = Object.freeze({ kind: 'uniform-auth-failure' })
const INVALID: LoginRecognition = Object.freeze({ kind: 'invalid' })
const NO_FAULTS: RecordStoreFaults = Object.freeze({ unavailable: () => undefined })

function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function field(input: unknown, name: string): unknown {
  return typeof input === 'object' && input !== null
    ? (input as Readonly<Record<string, unknown>>)[name]
    : undefined
}

/** The owner emits lexically valid text, then parses it like any caller (SPEC "已采用的纯值边界"). */
function emit<T>(codec: IdentityTextCodec<T>, prefix: string): T {
  const body = [...randomBytes(26)].map(byte => ID_ALPHABET[byte % 32]).join('')
  const parsed = codec.parse(`${prefix}${body}`)
  if (!parsed.ok) throw new TypeError(`emitted ${prefix} text did not parse`)
  return parsed.value
}

function digestOf(salt: Buffer, credential: string): Buffer {
  return createHash('sha256').update(salt).update(credential, 'utf8').digest()
}

function unavailable(diagnostic: string): Unavailable {
  return Object.freeze({ kind: 'basis-unavailable', diagnostic })
}

/**
 * Creates the double over an injected clock and injected login terms. There is no default for
 * either. Each call makes a separate deployment: a proof from one is `invalid` in another. A read
 * failure comes only from `faults`, so it never depends on whether an account exists.
 */
export function inProcessIdentityOperations(options: InProcessIdentityOptions): IdentityOperations {
  const { clock, terms, faults = NO_FAULTS } = options
  const accounts = new Map<string, AccountRecord>()
  const logins = new Map<string, LoginRecord>()
  // The latest clock reading this provider adopted. An earlier reading is not adopted (SPEC ID-17).
  let latest: Instant | undefined

  const readTime = async (): Promise<TimeBasis> => {
    let reading
    try {
      reading = await clock.now()
    } catch {
      return unavailable('the clock failed')
    }
    if (reading.kind !== 'read')
      return unavailable(`the clock is unavailable: ${reading.diagnostic}`)
    if (latest !== undefined && compareInstants(reading.instant, latest) < 0)
      return unavailable('the clock reads earlier than the latest reading adopted')
    latest = reading.instant
    return Object.freeze({ kind: 'read', instant: reading.instant })
  }

  const readTerms = async (): Promise<LoginTerms | Unavailable> => {
    let reading
    try {
      reading = await terms.read()
    } catch {
      return unavailable('the login terms source failed')
    }
    if (reading.kind !== 'read')
      return unavailable(`the login terms are unavailable: ${reading.diagnostic}`)
    if (!isPositive(reading.terms.maxLifetime) || !isPositive(reading.terms.idlePeriod))
      return unavailable('the login terms are not legal: a duration is not longer than zero')
    return reading.terms
  }

  const storeDown = (store: 'accounts' | 'logins'): Unavailable | undefined => {
    const diagnostic = faults.unavailable(store)
    return diagnostic === undefined
      ? undefined
      : unavailable(`the ${store} store does not answer: ${diagnostic}`)
  }

  const registerAndActivate: IdentityOperations['registerAndActivate'] = input => {
    const loginIdentifier = field(input, 'loginIdentifier')
    const credential = field(input, 'credential')
    if (!isFilledText(loginIdentifier) || !isFilledText(credential))
      return Promise.resolve(NOT_LOGINABLE)
    // The store cannot be read, so nothing is written: this call activated nothing.
    if (storeDown('accounts') !== undefined) return Promise.resolve(NOT_LOGINABLE)
    // Check and insert run with no await between them, so one identifier gets one account.
    if (accounts.has(loginIdentifier)) return Promise.resolve(NOT_LOGINABLE)
    const account = emit(accountCodec, 'acc_')
    const organization = emit(organizationCodec, 'org_')
    const personal = tenant(organization, account)
    const salt = randomBytes(16)
    accounts.set(loginIdentifier, {
      account,
      tenant: personal,
      salt,
      digest: digestOf(salt, credential),
    })
    return Promise.resolve(
      Object.freeze({ kind: 'succeeded', account, organization, tenant: personal }),
    )
  }

  // The steps follow SPEC ID-17 "签发登录"; an earlier step's answer wins.
  const issueLogin: IdentityOperations['issueLogin'] = async input => {
    // 1. The basis comes first, so `basis-unavailable` never tells whether the credential matches.
    const time = await readTime()
    if (time.kind !== 'read') return time
    const lifetimes = await readTerms()
    if ('kind' in lifetimes) return lifetimes
    const maxDeadline = addDuration(time.instant, lifetimes.maxLifetime)
    const idleDeadline = addDuration(time.instant, lifetimes.idlePeriod)
    if (maxDeadline === undefined || idleDeadline === undefined)
      return unavailable('a deadline falls outside years 0000 to 9999')
    // 2. A malformed input.
    const loginIdentifier = field(input, 'loginIdentifier')
    const credential = field(input, 'credential')
    if (!isFilledText(loginIdentifier) || !isFilledText(credential)) return UNIFORM_AUTH_FAILURE
    // 3. The account store does not answer.
    const down = storeDown('accounts')
    if (down !== undefined) return down
    // 4. No account, or a wrong credential.
    const record = accounts.get(loginIdentifier)
    if (record === undefined || !timingSafeEqual(record.digest, digestOf(record.salt, credential)))
      return UNIFORM_AUTH_FAILURE
    // 5. A new, independent login.
    const login = emit(loginStateCodec, 'lgn_')
    const loginProof = randomBytes(32).toString('base64url')
    logins.set(loginProof, {
      login,
      account: record.account,
      tenant: record.tenant,
      maxDeadline,
      idleDeadline,
    })
    return Object.freeze({
      kind: 'succeeded',
      login,
      account: record.account,
      loginIdentifier,
      issuedAt: time.instant,
      maxDeadline,
      idleDeadline,
      tenant: record.tenant,
      loginProof,
    })
  }

  // The steps follow SPEC ID-17 "识别登录"; an earlier step's answer wins.
  const recognizeLogin: IdentityOperations['recognizeLogin'] = async input => {
    const loginProof = field(input, 'loginProof')
    if (!isFilledText(loginProof)) return INVALID
    const down = storeDown('logins')
    if (down !== undefined) return down
    const record = logins.get(loginProof)
    if (record === undefined) return INVALID
    const time = await readTime()
    if (time.kind !== 'read') return time
    // Reaching a deadline ends the login; the first deadline reached wins. The deadlines are frozen
    // and the adopted reading never goes back, so an ended login stays ended.
    if (
      compareInstants(time.instant, record.maxDeadline) >= 0 ||
      compareInstants(time.instant, record.idleDeadline) >= 0
    )
      return INVALID
    // Recognition does not refresh the idle deadline (SPEC ID-17).
    return Object.freeze({
      kind: 'recognized',
      account: record.account,
      login: record.login,
      tenant: record.tenant,
    })
  }

  return Object.freeze({ registerAndActivate, issueLogin, recognizeLogin })
}
