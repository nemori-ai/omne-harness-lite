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
import { addDuration, isPositive } from './time.ts'

// The lexicon of an atomic identity body: 26 characters, no i, l, o or u.
const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

type AccountRecord = Readonly<{
  account: AccountId
  tenant: TenantId
  salt: Buffer
  digest: Buffer
}>

type LoginRecord = {
  readonly login: LoginStateId
  readonly account: AccountId
  readonly tenant: TenantId
  readonly maxDeadline: Instant
  readonly idleDeadline: Instant
  ended: boolean
}

type TimeBasis =
  | Readonly<{ kind: 'read'; instant: Instant }>
  | Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

const NOT_LOGINABLE: RegisterAndActivateOutcome = Object.freeze({ kind: 'not-loginable' })
const UNIFORM_AUTH_FAILURE: IssueLoginOutcome = Object.freeze({ kind: 'uniform-auth-failure' })
const INVALID: LoginRecognition = Object.freeze({ kind: 'invalid' })

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

function unavailable(diagnostic: string): TimeBasis {
  return { kind: 'basis-unavailable', diagnostic }
}

/**
 * Creates the double over an injected clock and injected login terms. There is no default for
 * either. Each call makes a separate deployment: a proof from one is `invalid` in another.
 */
export function inProcessIdentityOperations(
  options: IdentityOperationsOptions,
): IdentityOperations {
  const { clock, terms } = options
  const accounts = new Map<string, AccountRecord>()
  const logins = new Map<string, LoginRecord>()
  // The latest instant this provider used. A reading earlier than it is not trusted (SPEC ID-03).
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
      return unavailable('the clock reads earlier than an instant already used')
    latest = reading.instant
    return { kind: 'read', instant: reading.instant }
  }

  const readTerms = async (): Promise<LoginTerms | string> => {
    let reading
    try {
      reading = await terms.read()
    } catch {
      return 'the login terms source failed'
    }
    if (reading.kind !== 'read') return `the login terms are unavailable: ${reading.diagnostic}`
    if (!isPositive(reading.terms.maxLifetime) || !isPositive(reading.terms.idlePeriod))
      return 'the login terms are not legal: a lifetime is not longer than zero'
    return reading.terms
  }

  const registerAndActivate: IdentityOperations['registerAndActivate'] = input => {
    const loginIdentifier = field(input, 'loginIdentifier')
    const credential = field(input, 'credential')
    if (!isFilledText(loginIdentifier) || !isFilledText(credential))
      return Promise.resolve(NOT_LOGINABLE)
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

  const issueLogin: IdentityOperations['issueLogin'] = async input => {
    // The basis comes first, so `basis-unavailable` never tells whether the credential matches.
    const time = await readTime()
    if (time.kind !== 'read') return time
    const lifetimes = await readTerms()
    if (typeof lifetimes === 'string') return { kind: 'basis-unavailable', diagnostic: lifetimes }
    const maxDeadline = addDuration(time.instant, lifetimes.maxLifetime)
    const idleDeadline = addDuration(time.instant, lifetimes.idlePeriod)
    if (maxDeadline === undefined || idleDeadline === undefined)
      return {
        kind: 'basis-unavailable',
        diagnostic: 'a deadline falls outside years 0000 to 9999',
      }

    const loginIdentifier = field(input, 'loginIdentifier')
    const credential = field(input, 'credential')
    if (!isFilledText(loginIdentifier) || !isFilledText(credential)) return UNIFORM_AUTH_FAILURE
    const record = accounts.get(loginIdentifier)
    if (record === undefined || !timingSafeEqual(record.digest, digestOf(record.salt, credential)))
      return UNIFORM_AUTH_FAILURE

    const login = emit(loginStateCodec, 'lgn_')
    const loginProof = randomBytes(32).toString('base64url')
    logins.set(loginProof, {
      login,
      account: record.account,
      tenant: record.tenant,
      maxDeadline,
      idleDeadline,
      ended: false,
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

  const recognizeLogin: IdentityOperations['recognizeLogin'] = async input => {
    const loginProof = field(input, 'loginProof')
    if (!isFilledText(loginProof)) return INVALID
    const record = logins.get(loginProof)
    if (record === undefined || record.ended) return INVALID
    const time = await readTime()
    if (time.kind !== 'read') return time
    // Reaching a deadline ends the login; the first deadline reached wins.
    if (
      compareInstants(time.instant, record.maxDeadline) >= 0 ||
      compareInstants(time.instant, record.idleDeadline) >= 0
    ) {
      record.ended = true
      return INVALID
    }
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
