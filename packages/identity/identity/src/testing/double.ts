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
    if (storeDown(instance, 'accounts') !== undefined) return Promise.resolve(NOT_LOGINABLE)
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
    const loginIdentifier = field(input, 'loginIdentifier')
    const credential = field(input, 'credential')
    if (!isFilledText(loginIdentifier) || !isFilledText(credential)) return UNIFORM_AUTH_FAILURE
    const down = storeDown(instance, 'accounts') ?? storeDown(instance, 'logins')
    if (down !== undefined) return down
    const record = records.accountsByIdentifier.get(loginIdentifier)
    if (record === undefined || !timingSafeEqual(record.digest, digestOf(record.salt, credential)))
      return UNIFORM_AUTH_FAILURE
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
    if (
      compareInstants(time.instant, record.maxDeadline) >= 0 ||
      compareInstants(time.instant, record.idleDeadline) >= 0
    )
      return INVALID
    return Object.freeze({
      kind: 'recognized',
      account: record.account,
      login: record.login,
      tenant: record.selection,
    })
  }

  return Object.freeze({ registerAndActivate, issueLogin, recognizeLogin })
}

export function inProcessIdentityOperations(options: InProcessIdentityOptions): IdentityOperations {
  const { clock, terms, faults = NO_FAULTS } = options
  const instance: Instance = { clock, faults, off: new Set(), latest: undefined }
  return operationsOver(newRecords(), instance, terms)
}
