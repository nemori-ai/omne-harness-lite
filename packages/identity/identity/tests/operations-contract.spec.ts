import { describe, expect, it } from 'vitest'
import {
  compareInstants,
  parseDuration,
  parseInstant,
  type Duration,
  type Instant,
} from '@omne-harness/utc-instant'
import type {
  IdentityOperations,
  IdentityOperationsOptions,
  IssuedLogin,
} from '@omne-harness/identity'
import {
  IDENTITY_CONTRACT_CASES,
  checkIdentityOperationsContract,
  inProcessIdentityOperations,
  type IdentityContractFixture,
  type IdentityContractOptions,
} from '@omne-harness/identity/testing'

function instant(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`fixture instant ${text}`)
  return parsed.value
}

function duration(text: string): Duration {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text}`)
  return parsed.value
}

const doubleFixture: IdentityContractFixture = {
  create: inProcessIdentityOperations,
  injectsRecordFaults: true,
}

// Two configurations far apart: whole seconds across a day boundary, and fractions near a year end.
const CONFIGURATIONS: readonly (readonly [string, IdentityContractOptions])[] = [
  [
    'one minute and one day',
    {
      start: instant('2026-10-25T23:59:30Z'),
      short: duration('PT60S'),
      long: duration('PT86400S'),
    },
  ],
  [
    'fractional lifetimes',
    {
      start: instant('2026-12-31T23:59:59.25Z'),
      short: duration('PT0.5S'),
      long: duration('PT2.125S'),
    },
  ],
]

describe('the contract suite on the reference double', () => {
  it.each(CONFIGURATIONS)('passes every applicable case with %s', async (_name, options) => {
    const report = await checkIdentityOperationsContract(doubleFixture, options)
    const failed = report.cases.filter(result => result.status === 'failed')
    expect(failed).toEqual([])
    expect(report.passed).toBe(true)
    expect(report.cases.map(result => result.id)).toEqual(IDENTITY_CONTRACT_CASES.map(c => c.id))
    // The double activates on registration, so it has no inactive account to offer.
    expect(
      report.cases.filter(result => result.status === 'not-applicable').map(result => result.id),
    ).toEqual(['login-inactive-uniform'])
  })

  it('refuses options whose short lifetime is not shorter than the long one', async () => {
    const [, options] = CONFIGURATIONS[0]!
    await expect(
      checkIdentityOperationsContract(doubleFixture, { ...options, short: options.long }),
    ).rejects.toThrow(RangeError)
    await expect(
      checkIdentityOperationsContract(doubleFixture, { ...options, short: duration('PT0S') }),
    ).rejects.toThrow(RangeError)
  })

  it('refuses a window that spans a listed leap second, and accepts one that ends before it', async () => {
    const short = duration('PT30S')
    await expect(
      checkIdentityOperationsContract(doubleFixture, {
        start: instant('2016-12-31T23:59:00Z'),
        short,
        long: duration('PT120S'),
      }),
    ).rejects.toThrow('leap second')
    const report = await checkIdentityOperationsContract(doubleFixture, {
      start: instant('2016-12-31T23:58:00Z'),
      short,
      long: duration('PT59S'),
    })
    expect(report.passed).toBe(true)
  })
})

// Each broken provider wraps the double and breaks one rule; the suite must name that rule.
type Breakage = (real: IdentityOperations, options: IdentityOperationsOptions) => IdentityOperations

const BREAKAGES: readonly (readonly [string, string, Breakage])[] = [
  [
    'adopts clock readings only when it issues, so a backward clock revives an ended login',
    'recognize-max-first',
    (real, { clock }) => {
      const issued = new Map<string, IssuedLogin>()
      return {
        ...real,
        async issueLogin(input) {
          const outcome = await real.issueLogin(input)
          if (outcome.kind === 'succeeded') issued.set(outcome.loginProof, outcome)
          return outcome
        },
        async recognizeLogin(input) {
          const outcome = await real.recognizeLogin(input)
          const login = issued.get(input.loginProof)
          const reading = await clock.now()
          if (
            outcome.kind !== 'basis-unavailable' ||
            login === undefined ||
            reading.kind !== 'read'
          )
            return outcome
          // Judges the earlier reading against the deadlines alone, as if it had never moved on.
          const live =
            compareInstants(reading.instant, login.maxDeadline) < 0 &&
            compareInstants(reading.instant, login.idleDeadline) < 0
          return live
            ? {
                kind: 'recognized',
                account: login.account,
                login: login.login,
                tenant: login.tenant,
              }
            : outcome
        },
      }
    },
  ],
  [
    'quotes the login identifier in a diagnostic',
    'login-basis-unavailable',
    real => ({
      ...real,
      async issueLogin(input) {
        const outcome = await real.issueLogin(input)
        return outcome.kind === 'basis-unavailable'
          ? {
              ...outcome,
              diagnostic: `${outcome.diagnostic} for ${String(input?.loginIdentifier)}`,
            }
          : outcome
      },
    }),
  ],
  [
    'reserves an identifier for a rejected registration',
    'account-store-unavailable',
    real => {
      const reserved = new Set<string>()
      return {
        ...real,
        async registerAndActivate(input) {
          if (reserved.has(input.loginIdentifier)) return { kind: 'not-loginable' }
          const outcome = await real.registerAndActivate(input)
          if (outcome.kind === 'not-loginable' && typeof input?.loginIdentifier === 'string')
            reserved.add(input.loginIdentifier)
          return outcome
        },
      }
    },
  ],
  [
    'tells a wrong credential apart',
    'login-uniform-failure',
    real => ({
      ...real,
      async issueLogin(input) {
        const outcome = await real.issueLogin(input)
        return outcome.kind === 'uniform-auth-failure' && input?.loginIdentifier === 'contract-ada'
          ? ({ kind: 'uniform-auth-failure', reason: 'credential' } as never)
          : outcome
      },
    }),
  ],
  [
    'checks the credential before the clock',
    'login-basis-unavailable',
    real => ({
      ...real,
      async issueLogin(input) {
        const outcome = await real.issueLogin(input)
        return outcome.kind === 'basis-unavailable' && input?.loginIdentifier === 'contract-nobody'
          ? { kind: 'uniform-auth-failure' }
          : outcome
      },
    }),
  ],
  [
    'lets a login live past its maximum deadline',
    'recognize-max-first',
    real => ({
      ...real,
      async recognizeLogin(input) {
        const outcome = await real.recognizeLogin(input)
        return outcome.kind === 'invalid' && input.loginProof.length > 10
          ? ({ kind: 'recognized' } as never)
          : outcome
      },
    }),
  ],
  [
    'answers invalid when the clock is down',
    'recognize-basis-unavailable',
    real => ({
      ...real,
      async recognizeLogin(input) {
        const outcome = await real.recognizeLogin(input)
        return outcome.kind === 'basis-unavailable' ? { kind: 'invalid' } : outcome
      },
    }),
  ],
  [
    'lets a second registration of one identifier succeed',
    'register-unique',
    real => {
      const seen = new Set<string>()
      return {
        ...real,
        async registerAndActivate(input) {
          const outcome = await real.registerAndActivate(input)
          if (outcome.kind === 'succeeded') seen.add(input.loginIdentifier)
          if (outcome.kind === 'not-loginable' && seen.has(input?.loginIdentifier))
            return real.registerAndActivate({
              ...input,
              loginIdentifier: `${input.loginIdentifier}+`,
            })
          return outcome
        },
      }
    },
  ],
]

describe('the contract suite on broken providers', () => {
  it.each(BREAKAGES)('fails a provider that %s, in case %s', async (_name, id, breakage) => {
    const fixture: IdentityContractFixture = {
      injectsRecordFaults: true,
      create: options => breakage(inProcessIdentityOperations(options), options),
    }
    const report = await checkIdentityOperationsContract(fixture, CONFIGURATIONS[0]![1])
    expect(report.passed).toBe(false)
    expect(report.cases.find(result => result.id === id)?.status).toBe('failed')
  })

  it('reports a provider that throws as a failed case with only the error name', async () => {
    const fixture: IdentityContractFixture = {
      create: options => ({
        ...inProcessIdentityOperations(options),
        recognizeLogin: () => Promise.reject(new TypeError('secret-proof-text')),
      }),
    }
    const report = await checkIdentityOperationsContract(fixture, CONFIGURATIONS[0]![1])
    const result = report.cases.find(entry => entry.id === 'recognize-valid')
    expect(result).toMatchObject({ status: 'failed', detail: 'the case threw TypeError' })
    expect(JSON.stringify(report)).not.toContain('secret-proof-text')
  })

  it('reports the record store cases not applicable when the fixture does not wire the faults', async () => {
    const report = await checkIdentityOperationsContract(
      { create: inProcessIdentityOperations },
      CONFIGURATIONS[0]![1],
    )
    expect(report.passed).toBe(true)
    expect(
      report.cases.filter(result => result.status === 'not-applicable').map(result => result.id),
    ).toEqual([
      'login-inactive-uniform',
      'account-store-unavailable',
      'login-store-unavailable-on-issue',
      'recognize-record-unavailable',
    ])
  })

  it('fails a provider that ignores the login store fault and answers from a stale copy', async () => {
    const fixture: IdentityContractFixture = {
      injectsRecordFaults: true,
      // The provider is built without the suite's faults, so its stores always answer.
      create: ({ clock, terms }) => inProcessIdentityOperations({ clock, terms }),
    }
    const report = await checkIdentityOperationsContract(fixture, CONFIGURATIONS[0]![1])
    expect(report.cases.find(result => result.id === 'recognize-record-unavailable')?.status).toBe(
      'failed',
    )
    expect(report.cases.find(result => result.id === 'account-store-unavailable')?.status).toBe(
      'failed',
    )
  })

  it('runs the inactive-account case when the fixture can leave a registration inactive', async () => {
    const fixture: IdentityContractFixture = {
      create: inProcessIdentityOperations,
      // Stands in for a provider with a separate activation step: nothing is registered.
      registerWithoutActivation: async () => undefined,
    }
    const report = await checkIdentityOperationsContract(fixture, CONFIGURATIONS[0]![1])
    expect(report.cases.find(result => result.id === 'login-inactive-uniform')?.status).toBe(
      'passed',
    )
  })
})
