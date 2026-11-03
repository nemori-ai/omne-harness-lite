// The in-process reference double of the identity operations (SPEC ID-17). It implements one
// provisioning scheme only: the account is active as soon as it registers. Accounts and logins live
// in memory; a credential is kept as a salted digest. It is not durable and holds in one process.
// The governance double (`inProcessIdentity`) works over the same records, so a revoked login is
// `invalid` here and a switched selection is the `tenant` of a recognition (SPEC ID-18).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  tenant,
} from '@omne-harness/legal-identity'
import { compareInstants } from '@omne-harness/utc-instant'
import type {
  IdentityOperations,
  IdentityOperationsOptions,
  IssueLoginOutcome,
  LoginRecognition,
  LoginTerms,
  LoginTermsSource,
  RegisterAndActivateOutcome,
} from '../operations.ts'
import { DEFAULT_TEAM_ROLES } from '../qualification.ts'
import type { RecordStoreFaults } from './controls.ts'
import {
  emit,
  field,
  isFilledText,
  memberKey,
  newRecords,
  readTime,
  storeDown,
  unavailable,
  type IdentityRecords,
  type Instance,
  type LoginRecord,
  type Unavailable,
} from './records.ts'
import { addDuration, isPositive } from './time.ts'

/** The injected clock and terms, and an optional fault switch for the record stores. */
export type InProcessIdentityOptions = IdentityOperationsOptions &
  Readonly<{ faults?: RecordStoreFaults }>

type TermsBasis = Readonly<{ kind: 'read'; terms: LoginTerms }> | Unavailable

const NOT_LOGINABLE: RegisterAndActivateOutcome = Object.freeze({ kind: 'not-loginable' })
const UNIFORM_AUTH_FAILURE: IssueLoginOutcome = Object.freeze({ kind: 'uniform-auth-failure' })
const INVALID: LoginRecognition = Object.freeze({ kind: 'invalid' })

export const NO_FAULTS: RecordStoreFaults = Object.freeze({ unavailable: () => undefined })

function digestOf(salt: Uint8Array, credential: string): Uint8Array {
  return createHash('sha256').update(salt).update(credential, 'utf8').digest()
}

async function readTerms(terms: LoginTermsSource): Promise<TermsBasis> {
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
  return Object.freeze({ kind: 'read', terms: reading.terms })
}

/** The three operations of one provider instance over the given records. */
export function operationsOver(
  records: IdentityRecords,
  instance: Instance,
  terms: LoginTermsSource,
): IdentityOperations {
  const registerAndActivate: IdentityOperations['registerAndActivate'] = input => {
    const loginIdentifier = field(input, 'loginIdentifier')
    const credential = field(input, 'credential')
    if (!isFilledText(loginIdentifier) || !isFilledText(credential))
      return Promise.resolve(NOT_LOGINABLE)
    // The store cannot be read, so nothing is written: this call activated nothing.
    if (storeDown(instance, 'accounts') !== undefined) return Promise.resolve(NOT_LOGINABLE)
    // Check and insert run with no await between them, so one identifier gets one account.
    if (records.accountsByIdentifier.has(loginIdentifier)) return Promise.resolve(NOT_LOGINABLE)
    const account = emit(accountCodec, 'acc_')
    const organization = emit(organizationCodec, 'org_')
    const personal = tenant(organization, account)
    const salt = randomBytes(16)
    const record = Object.freeze({
      account,
      loginIdentifier,
      personal: organization,
      tenant: personal,
      salt,
      digest: digestOf(salt, credential),
    })
    // The account, its personal organization and its personal tenant are written together. The
    // owner is the one member and the super administrator (ID-05; IS:59 keeps the default model).
    records.accountsByIdentifier.set(loginIdentifier, record)
    records.accountsById.set(account.text, record)
    records.organizations.set(organization.text, Object.freeze({ organization, kind: 'personal' }))
    records.memberships.set(memberKey(organization, account), {
      organization,
      account,
      tenant: personal,
      state: 'active',
      role: DEFAULT_TEAM_ROLES.superAdmin,
    })
    return Promise.resolve(
      Object.freeze({ kind: 'succeeded', account, organization, tenant: personal }),
    )
  }

  // The steps follow SPEC ID-17 "签发登录"; an earlier step's answer wins.
  const issueLogin: IdentityOperations['issueLogin'] = async input => {
    // 1. The basis comes first, so `basis-unavailable` never tells whether the credential matches.
    const time = await readTime(instance)
    if (time.kind !== 'read') return time
    const lifetimes = await readTerms(terms)
    if (lifetimes.kind !== 'read') return lifetimes
    const maxDeadline = addDuration(time.instant, lifetimes.terms.maxLifetime)
    const idleDeadline = addDuration(time.instant, lifetimes.terms.idlePeriod)
    if (maxDeadline === undefined || idleDeadline === undefined)
      return unavailable('a deadline falls outside years 0000 to 9999')
    // 2. A malformed input.
    const loginIdentifier = field(input, 'loginIdentifier')
    const credential = field(input, 'credential')
    if (!isFilledText(loginIdentifier) || !isFilledText(credential)) return UNIFORM_AUTH_FAILURE
    // 3. The account store does not answer, or the login store cannot record a login. Both are
    // known before the credential is compared, so the answer does not tell whether it matches.
    const down = storeDown(instance, 'accounts') ?? storeDown(instance, 'logins')
    if (down !== undefined) return down
    // 4. No account, or a wrong credential.
    const record = records.accountsByIdentifier.get(loginIdentifier)
    if (record === undefined || !timingSafeEqual(record.digest, digestOf(record.salt, credential)))
      return UNIFORM_AUTH_FAILURE
    // 5. A new, independent login.
    const login = emit(loginStateCodec, 'lgn_')
    const loginProof = randomBytes(32).toString('base64url')
    const stored: LoginRecord = {
      login,
      account: record.account,
      issuedAt: time.instant,
      maxDeadline,
      idlePeriod: lifetimes.terms.idlePeriod,
      idleDeadline,
      selection: record.tenant,
      revoked: false,
    }
    records.loginsByProof.set(loginProof, stored)
    records.loginsById.set(login.text, stored)
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

  // The steps follow SPEC ID-17 "识别登录"; an earlier step's answer wins. A revoked login is an
  // ended login: it is `invalid` before the clock is read (SPEC ID-18).
  const recognizeLogin: IdentityOperations['recognizeLogin'] = async input => {
    const loginProof = field(input, 'loginProof')
    if (!isFilledText(loginProof)) return INVALID
    const down = storeDown(instance, 'logins')
    if (down !== undefined) return down
    const record = records.loginsByProof.get(loginProof)
    if (record === undefined) return INVALID
    if (record.revoked && !instance.off.has('revocation-ends-recognition')) return INVALID
    const time = await readTime(instance)
    if (time.kind !== 'read') return time
    // Reaching a deadline ends the login; the first deadline reached wins. The deadlines only move
    // later through a report of a live login, and the adopted reading never goes back, so an ended
    // login stays ended.
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
      tenant: record.selection,
    })
  }

  return Object.freeze({ registerAndActivate, issueLogin, recognizeLogin })
}

/**
 * Creates the double over an injected clock and injected login terms. There is no default for
 * either. Each call makes a separate deployment: a proof from one is `invalid` in another. A read
 * failure comes only from `faults`, so it never depends on whether an account exists.
 */
export function inProcessIdentityOperations(options: InProcessIdentityOptions): IdentityOperations {
  const { clock, terms, faults = NO_FAULTS } = options
  const instance: Instance = { clock, faults, off: new Set(), latest: undefined }
  return operationsOver(newRecords(), instance, terms)
}
