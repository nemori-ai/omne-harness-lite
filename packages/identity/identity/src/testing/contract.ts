// The contract suite of the identity operations (SPEC ID-17). It runs each case on a fresh provider
// that the fixture makes over the suite's own clock, terms and record store faults, and reports
// every case by name. It
// needs no test framework, so a durable provider can run the same cases in its own tests. Messages
// never quote a proof or a credential.
import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  tenantEquals,
} from '@omne-harness/legal-identity'
import {
  compareInstants,
  encodeDuration,
  parseDuration,
  type Duration,
  type Instant,
} from '@omne-harness/utc-instant'
import type {
  IdentityOperations,
  IdentityOperationsOptions,
  IssuedLogin,
  LoginCredentialInput,
  LoginTerms,
  RegisterAndActivateOutcome,
} from '../operations.ts'
import {
  adjustableLoginTerms,
  manualIdentityClock,
  recordStoreFaults,
  type AdjustableLoginTerms,
  type ManualIdentityClock,
  type RecordStoreFaultControl,
  type RecordStoreFaults,
} from './controls.ts'
import { addDuration, isPositive, justBefore } from './time.ts'

/** What the suite gives `create`: its clock, its terms and its record store fault switch. */
export type IdentityContractProviderOptions = IdentityOperationsOptions &
  Readonly<{ faults: RecordStoreFaults }>

/**
 * How the suite gets providers. Every call of `create` must give a new, empty provider that stands
 * for a separate deployment: one case presents a proof of another call's provider as foreign.
 */
export interface IdentityContractFixture {
  create(options: IdentityContractProviderOptions): IdentityOperations | Promise<IdentityOperations>
  /**
   * True when the provider consults `faults` before it queries its account store and its login
   * store, so that a store the suite switches off does not answer. Without it the cases that need a
   * silent store are not applicable.
   */
  injectsRecordFaults?: boolean
  /**
   * Optional: leaves a registration with this identifier and credential that is not activated. A
   * provider that activates on registration has none, and the case that needs it is not applicable.
   */
  registerWithoutActivation?(
    operations: IdentityOperations,
    input: LoginCredentialInput,
  ): Promise<void>
}

/** The time the suite starts at and two lifetimes. `short` must be shorter than `long`. */
export type IdentityContractOptions = Readonly<{ start: Instant; short: Duration; long: Duration }>

export type IdentityContractCaseResult = Readonly<{
  id: string
  rule: string
  status: 'passed' | 'failed' | 'not-applicable'
  detail?: string
}>

export type IdentityContractReport = Readonly<{
  /** True when no case failed. */
  passed: boolean
  cases: readonly IdentityContractCaseResult[]
}>

type Context = Readonly<{
  fixture: IdentityContractFixture
  options: IdentityContractOptions
  clock: ManualIdentityClock
  terms: AdjustableLoginTerms
  faults: RecordStoreFaultControl
  operations: IdentityOperations
  /** Another provider over the same clock and terms. */
  another(): Promise<IdentityOperations>
  /** `start` plus the duration. */
  at(duration: Duration): Instant
}>

type ContractCase = Readonly<{
  id: string
  rule: string
  run(context: Context): Promise<'passed' | 'not-applicable'>
}>

class ContractViolation extends Error {}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContractViolation(message)
}

function sameInstant(left: Instant, right: Instant): boolean {
  return compareInstants(left, right) === 0
}

async function registered(
  operations: IdentityOperations,
  loginIdentifier: string,
  credential: string,
): Promise<Extract<RegisterAndActivateOutcome, { kind: 'succeeded' }>> {
  const outcome = await operations.registerAndActivate({ loginIdentifier, credential })
  check(outcome.kind === 'succeeded', `registering ${loginIdentifier} did not succeed`)
  return outcome
}

async function issued(
  operations: IdentityOperations,
  loginIdentifier: string,
  credential: string,
): Promise<IssuedLogin> {
  const outcome = await operations.issueLogin({ loginIdentifier, credential })
  check(outcome.kind === 'succeeded', `logging in as ${loginIdentifier} did not succeed`)
  return outcome
}

async function recognizedAs(
  operations: IdentityOperations,
  login: IssuedLogin,
  when: string,
): Promise<void> {
  const outcome = await operations.recognizeLogin({ loginProof: login.loginProof })
  check(outcome.kind === 'recognized', `a valid login was not recognized ${when}`)
  check(loginStateEquals(outcome.login, login), `recognition named another login ${when}`)
}

async function invalidAt(operations: IdentityOperations, proof: unknown, what: string) {
  const outcome = await operations.recognizeLogin({ loginProof: proof as string })
  check(outcome.kind === 'invalid', `${what} was not invalid (got ${outcome.kind})`)
}

function loginStateEquals(left: IssuedLogin['login'], right: IssuedLogin): boolean {
  const a = loginStateCodec.encode(left)
  const b = loginStateCodec.encode(right.login)
  return a.ok && b.ok && a.value === b.value
}

function terms(maxLifetime: Duration, idlePeriod: Duration): LoginTerms {
  return { maxLifetime, idlePeriod }
}

/** A zero or negative lifetime: the illegal terms that a provider must refuse to issue under. */
function illegal(text: string): Duration {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new RangeError('an illegal suite lifetime did not parse')
  return parsed.value
}

function before(instant: Instant): Instant {
  const earlier = justBefore(instant)
  if (earlier === undefined) throw new RangeError('no instant before the start')
  return earlier
}

const CASES: readonly ContractCase[] = [
  {
    id: 'register-complete',
    rule: 'ID-02: success gives the account, the personal organization and the personal tenant together',
    async run({ operations }) {
      const first = await registered(operations, 'contract-ada', 'credential-ada')
      check(accountCodec.encode(first.account).ok, 'the account cannot be encoded')
      check(organizationCodec.encode(first.organization).ok, 'the organization cannot be encoded')
      check(tenantCodec.encode(first.tenant).ok, 'the tenant cannot be encoded')
      check(
        tenantEquals(first.tenant, tenant(first.organization, first.account)),
        'the tenant is not the personal organization with the account',
      )
      const second = await registered(operations, 'contract-bob', 'credential-bob')
      check(!tenantEquals(first.tenant, second.tenant), 'two accounts share a tenant')
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      check(tenantEquals(login.tenant, first.tenant), 'the registered account logs in elsewhere')
      return 'passed'
    },
  },
  {
    id: 'register-unique',
    rule: 'ID-01, ID-02: a login identifier is unique, a repeat registration changes nothing',
    async run({ operations }) {
      const first = await registered(operations, 'contract-ada', 'credential-ada')
      for (const credential of ['credential-ada', 'credential-other']) {
        const repeat = await operations.registerAndActivate({
          loginIdentifier: 'contract-ada',
          credential,
        })
        check(repeat.kind === 'not-loginable', 'a taken identifier registered again')
        check(Object.keys(repeat).length === 1, 'not-loginable carries a detail')
      }
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      check(tenantEquals(login.tenant, first.tenant), 'a repeat registration replaced the account')
      const other = await operations.issueLogin({
        loginIdentifier: 'contract-ada',
        credential: 'credential-other',
      })
      check(other.kind === 'uniform-auth-failure', 'a repeat registration claimed the account')
      return 'passed'
    },
  },
  {
    id: 'register-concurrent',
    rule: 'ID-02: of concurrent registrations of one identifier, at most one succeeds',
    async run({ operations }) {
      const credentials = ['credential-1', 'credential-2', 'credential-3', 'credential-4']
      const outcomes = await Promise.all(
        credentials.map(credential =>
          operations.registerAndActivate({ loginIdentifier: 'contract-race', credential }),
        ),
      )
      const winners = credentials.filter((_, index) => outcomes[index]?.kind === 'succeeded')
      check(winners.length <= 1, `${winners.length} concurrent registrations succeeded`)
      for (const credential of credentials) {
        const login = await operations.issueLogin({ loginIdentifier: 'contract-race', credential })
        check(
          (login.kind === 'succeeded') === winners.includes(credential),
          'a losing registration can log in, or the winning one cannot',
        )
      }
      return 'passed'
    },
  },
  {
    id: 'register-empty-input',
    rule: 'ID-02: an empty or non-text identifier or credential does not open an account',
    async run({ operations }) {
      const inputs: readonly unknown[] = [
        { loginIdentifier: '', credential: 'credential-ada' },
        { loginIdentifier: 'contract-ada', credential: '' },
        { loginIdentifier: 7, credential: 'credential-ada' },
        { loginIdentifier: 'contract-ada' },
        null,
      ]
      for (const input of inputs) {
        const outcome = await operations.registerAndActivate(input as LoginCredentialInput)
        check(outcome.kind === 'not-loginable', 'a malformed registration did not fail')
      }
      const login = await operations.issueLogin({
        loginIdentifier: 'contract-ada',
        credential: 'credential-ada',
      })
      check(login.kind === 'uniform-auth-failure', 'a malformed registration opened an account')
      return 'passed'
    },
  },
  {
    id: 'login-issue',
    rule: 'ID-03: a login keeps its issue time, frozen deadlines and the personal tenant',
    async run({ operations, options, at }) {
      const account = await registered(operations, 'contract-ada', 'credential-ada')
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      check(sameInstant(login.issuedAt, options.start), 'the issue time is not the clock reading')
      check(sameInstant(login.maxDeadline, at(options.long)), 'the maximum deadline is wrong')
      check(sameInstant(login.idleDeadline, at(options.short)), 'the idle deadline is wrong')
      check(tenantEquals(login.tenant, account.tenant), 'the first selection is not personal')
      check(login.loginIdentifier === 'contract-ada', 'the login identifier changed')
      check(loginStateCodec.encode(login.login).ok, 'the login cannot be encoded')
      const text = loginStateCodec.encode(login.login)
      check(typeof login.loginProof === 'string' && login.loginProof.length > 0, 'no proof')
      check(text.ok && text.value !== login.loginProof, 'the proof is the login identity text')
      return 'passed'
    },
  },
  {
    id: 'login-uniform-failure',
    rule: 'ID-03: an unknown account and a wrong credential fail the same way',
    async run({ operations }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      const inputs: readonly unknown[] = [
        { loginIdentifier: 'contract-nobody', credential: 'credential-ada' },
        { loginIdentifier: 'contract-ada', credential: 'credential-wrong' },
        { loginIdentifier: 'contract-ada', credential: '' },
        { loginIdentifier: '', credential: 'credential-ada' },
        undefined,
      ]
      for (const input of inputs) {
        const outcome = await operations.issueLogin(input as LoginCredentialInput)
        check(outcome.kind === 'uniform-auth-failure', 'a failed login was not uniform')
        check(Object.keys(outcome).length === 1, 'uniform-auth-failure carries a detail')
      }
      return 'passed'
    },
  },
  {
    id: 'login-inactive-uniform',
    rule: 'ID-03: an account that is not activated fails like an unknown account',
    async run({ fixture, operations }) {
      if (fixture.registerWithoutActivation === undefined) return 'not-applicable'
      await fixture.registerWithoutActivation(operations, {
        loginIdentifier: 'contract-pending',
        credential: 'credential-pending',
      })
      const outcome = await operations.issueLogin({
        loginIdentifier: 'contract-pending',
        credential: 'credential-pending',
      })
      check(outcome.kind === 'uniform-auth-failure', 'an inactive account was told apart')
      check(Object.keys(outcome).length === 1, 'uniform-auth-failure carries a detail')
      return 'passed'
    },
  },
  {
    id: 'login-independent',
    rule: 'ID-03: every successful login is a separate login state with its own proof',
    async run({ operations }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      const first = await issued(operations, 'contract-ada', 'credential-ada')
      const second = await issued(operations, 'contract-ada', 'credential-ada')
      check(!loginStateEquals(first.login, second), 'two logins share a login state')
      check(first.loginProof !== second.loginProof, 'two logins share a proof')
      await recognizedAs(operations, first, 'for the first login')
      await recognizedAs(operations, second, 'for the second login')
      return 'passed'
    },
  },
  {
    id: 'login-basis-unavailable',
    rule: 'ID-03, ID-10: no login without a clock or legal terms, decided before the credential',
    async run({ operations, clock, terms: source, options }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      const attempts = [
        { loginIdentifier: 'contract-ada', credential: 'credential-ada' },
        { loginIdentifier: 'contract-ada', credential: 'credential-wrong' },
        { loginIdentifier: 'contract-nobody', credential: 'credential-ada' },
      ]
      const expectUnavailable = async (why: string) => {
        for (const attempt of attempts) {
          const outcome = await operations.issueLogin(attempt)
          check(outcome.kind === 'basis-unavailable', `${why}: got ${outcome.kind}`)
          check(typeof outcome.diagnostic === 'string', `${why}: no diagnostic`)
        }
      }
      clock.makeUnavailable('suite: clock down')
      await expectUnavailable('the clock is unavailable')
      clock.restore()
      source.makeUnavailable('suite: terms down')
      await expectUnavailable('the terms are unavailable')
      source.restore()
      source.set(terms(options.long, illegal(`-${encodeDuration(options.short)}`)))
      await expectUnavailable('the idle period is negative')
      source.set(terms(illegal('PT0S'), options.long))
      await expectUnavailable('the maximum lifetime is zero')
      source.set(terms(options.long, options.short))
      await issued(operations, 'contract-ada', 'credential-ada')
      clock.setTo(before(options.start))
      await expectUnavailable('the clock reads earlier than the latest reading adopted')
      return 'passed'
    },
  },
  {
    id: 'account-store-unavailable',
    rule: 'ID-03, ID-17: a silent account store gives basis-unavailable to every login and opens no account',
    async run({ fixture, operations, faults }) {
      if (fixture.injectsRecordFaults !== true) return 'not-applicable'
      await registered(operations, 'contract-ada', 'credential-ada')
      faults.makeUnavailable('accounts', 'suite: account store down')
      for (const loginIdentifier of ['contract-ada', 'contract-nobody']) {
        const outcome = await operations.issueLogin({
          loginIdentifier,
          credential: 'credential-ada',
        })
        check(outcome.kind === 'basis-unavailable', `a silent account store gave ${outcome.kind}`)
      }
      const malformed = await operations.issueLogin({ loginIdentifier: '', credential: 'x' })
      check(malformed.kind === 'uniform-auth-failure', 'a malformed login read the account store')
      const opened = await operations.registerAndActivate({
        loginIdentifier: 'contract-bob',
        credential: 'credential-bob',
      })
      check(opened.kind === 'not-loginable', 'a silent account store opened an account')
      faults.restore()
      const bob = await operations.issueLogin({
        loginIdentifier: 'contract-bob',
        credential: 'credential-bob',
      })
      check(bob.kind === 'uniform-auth-failure', 'a refused registration left an account')
      await issued(operations, 'contract-ada', 'credential-ada')
      return 'passed'
    },
  },
  {
    id: 'login-terms-frozen',
    rule: 'ID-03, ID-13: a terms change applies to later logins only, an ended login stays ended',
    async run({ operations, clock, terms: source, options, at }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      source.set(terms(options.long, options.long))
      const longer = await issued(operations, 'contract-ada', 'credential-ada')
      source.set(terms(options.short, options.short))
      const shorter = await issued(operations, 'contract-ada', 'credential-ada')
      clock.setTo(at(options.short))
      await invalidAt(operations, shorter.loginProof, 'a login past its deadline')
      await recognizedAs(operations, longer, 'under the terms it was issued with')
      source.set(terms(options.long, options.long))
      await invalidAt(operations, shorter.loginProof, 'an ended login after a longer terms change')
      return 'passed'
    },
  },
  {
    id: 'recognize-valid',
    rule: 'ID-03: a valid proof gives the account, the login and the current selection',
    async run({ operations }) {
      const account = await registered(operations, 'contract-ada', 'credential-ada')
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      const outcome = await operations.recognizeLogin({ loginProof: login.loginProof })
      check(outcome.kind === 'recognized', 'a valid proof was not recognized')
      const accountText = accountCodec.encode(outcome.account)
      const expected = accountCodec.encode(account.account)
      check(accountText.ok && expected.ok && accountText.value === expected.value, 'wrong account')
      check(loginStateEquals(outcome.login, login), 'wrong login')
      check(
        tenantEquals(outcome.tenant, account.tenant),
        'the selection is not the personal tenant',
      )
      return 'passed'
    },
  },
  {
    id: 'recognize-invalid-proof',
    rule: 'ID-03: an empty or forged proof, a proof of another deployment and the login identity text are invalid, without the clock',
    async run({ operations, another, clock }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      const foreignProvider = await another()
      await registered(foreignProvider, 'contract-ada', 'credential-ada')
      const foreign = await issued(foreignProvider, 'contract-ada', 'credential-ada')
      const identityText = loginStateCodec.encode(login.login)
      check(identityText.ok, 'the login cannot be encoded')
      clock.makeUnavailable('suite: clock down')
      await invalidAt(operations, '', 'an empty proof')
      await invalidAt(operations, 42, 'a proof that is not text')
      await invalidAt(operations, `${login.loginProof}x`, 'a forged proof')
      await invalidAt(operations, foreign.loginProof, 'a proof of another deployment')
      await invalidAt(operations, identityText.value, 'the login identity text')
      return 'passed'
    },
  },
  {
    id: 'recognize-max-first',
    rule: 'ID-03: the maximum lifetime ends the login when it comes first',
    async run({ operations, clock, terms: source, options, at }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      source.set(terms(options.short, options.long))
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      clock.setTo(before(at(options.short)))
      await recognizedAs(operations, login, 'just before the maximum deadline')
      clock.setTo(at(options.short))
      await invalidAt(operations, login.loginProof, 'a login at its maximum deadline')
      return 'passed'
    },
  },
  {
    id: 'recognize-idle-first',
    rule: 'ID-03: the idle period ends the login when it comes first, recognition does not refresh it',
    async run({ operations, clock, terms: source, options, at }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      source.set(terms(options.long, options.short))
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      clock.setTo(before(before(at(options.short))))
      await recognizedAs(operations, login, 'early in the idle period')
      clock.setTo(before(at(options.short)))
      await recognizedAs(operations, login, 'just before the idle deadline')
      clock.setTo(at(options.short))
      await invalidAt(
        operations,
        login.loginProof,
        'a login at its idle deadline after recognition',
      )
      return 'passed'
    },
  },
  {
    id: 'recognize-basis-unavailable',
    rule: 'ID-03: an unavailable or backward clock gives basis-unavailable, not a verdict',
    async run({ operations, clock, options }) {
      await registered(operations, 'contract-ada', 'credential-ada')
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      clock.makeUnavailable('suite: clock down')
      const down = await operations.recognizeLogin({ loginProof: login.loginProof })
      check(down.kind === 'basis-unavailable', `an unavailable clock gave ${down.kind}`)
      clock.restore()
      await recognizedAs(operations, login, 'after the clock returns')
      clock.setTo(before(options.start))
      const back = await operations.recognizeLogin({ loginProof: login.loginProof })
      check(back.kind === 'basis-unavailable', `a backward clock gave ${back.kind}`)
      clock.setTo(options.start)
      await recognizedAs(operations, login, 'after the clock catches up')
      return 'passed'
    },
  },
  {
    id: 'recognize-record-unavailable',
    rule: 'ID-03, ID-17: a silent login store gives basis-unavailable after the text check, before the record check',
    async run({ fixture, operations, faults, clock }) {
      if (fixture.injectsRecordFaults !== true) return 'not-applicable'
      await registered(operations, 'contract-ada', 'credential-ada')
      const login = await issued(operations, 'contract-ada', 'credential-ada')
      faults.makeUnavailable('logins', 'suite: login store down')
      await invalidAt(operations, '', 'an empty proof with a silent login store')
      for (const [proof, what] of [
        [login.loginProof, 'an issued proof'],
        [`${login.loginProof}x`, 'an unissued proof'],
      ] as const) {
        const outcome = await operations.recognizeLogin({ loginProof: proof })
        check(
          outcome.kind === 'basis-unavailable',
          `${what} with a silent store gave ${outcome.kind}`,
        )
      }
      clock.makeUnavailable('suite: clock down')
      faults.restore()
      await invalidAt(operations, `${login.loginProof}x`, 'an unissued proof before the clock')
      clock.restore()
      await recognizedAs(operations, login, 'after the login store returns')
      return 'passed'
    },
  },
]

/** The case names and rules, in run order. */
export const IDENTITY_CONTRACT_CASES: readonly Readonly<{ id: string; rule: string }>[] =
  Object.freeze(CASES.map(({ id, rule }) => Object.freeze({ id, rule })))

function checkOptions(options: IdentityContractOptions): void {
  if (!isPositive(options.short) || !isPositive(options.long))
    throw new RangeError('both suite lifetimes must be longer than zero')
  const short = addDuration(options.start, options.short)
  const long = addDuration(options.start, options.long)
  if (short === undefined || long === undefined || compareInstants(short, long) >= 0)
    throw new RangeError('the short lifetime must be shorter than the long one')
}

/**
 * Runs every case on a fresh provider. Each case gets a clock at `options.start` and terms with
 * `long` as the maximum lifetime and `short` as the idle period, unless the case sets its own.
 * Throws RangeError for unusable options; a provider failure is a failed case, not a throw.
 */
export async function checkIdentityOperationsContract(
  fixture: IdentityContractFixture,
  options: IdentityContractOptions,
): Promise<IdentityContractReport> {
  checkOptions(options)
  const results: IdentityContractCaseResult[] = []
  for (const contractCase of CASES) {
    const clock = manualIdentityClock(options.start)
    const source = adjustableLoginTerms(terms(options.long, options.short))
    const faults = recordStoreFaults()
    const injected = { clock: clock.clock, terms: source.source, faults: faults.faults }
    const base = { id: contractCase.id, rule: contractCase.rule }
    try {
      const operations = await fixture.create(injected)
      const status = await contractCase.run({
        fixture,
        options,
        clock,
        terms: source,
        faults,
        operations,
        another: async () => fixture.create(injected),
        at: duration => {
          const instant = addDuration(options.start, duration)
          if (instant === undefined)
            throw new RangeError('a suite deadline leaves years 0000 to 9999')
          return instant
        },
      })
      results.push(Object.freeze({ ...base, status }))
    } catch (error) {
      const detail =
        error instanceof ContractViolation
          ? error.message
          : `the case threw ${error instanceof Error ? error.name : typeof error}`
      results.push(Object.freeze({ ...base, status: 'failed', detail }))
    }
  }
  return Object.freeze({
    passed: results.every(result => result.status !== 'failed'),
    cases: Object.freeze(results),
  })
}
