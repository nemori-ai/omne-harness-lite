// The two trusted narrow ports of D-AUTH r4 4.1: the suites pass on the memory doubles, each case
// fails under a variant that breaks its rule, and the three trusted services load under their keys
// in a real Context and leave on unload.
import { AssertionError } from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type {
  SessionDelegatedTransactions,
  SessionId,
  SessionPrincipalBindingSource,
  SessionWorkPrincipals,
} from '@omne-harness/session-contract'
import {
  isNotApplicable,
  memoryAccess,
  memoryOtherAccess,
  sessionId,
  type ConformanceCase,
} from '@omne-harness/session-contract/testing'
import {
  SessionDelegatedTransactionsService,
  SessionPrincipalBindingsService,
  SessionWorkPrincipalsService,
  sessionDelegatedTransactionsKey,
  sessionPrincipalBindingsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  createMemorySessionPrincipalBindings,
  createMemorySessionWorkPrincipals,
  sessionPrincipalBindingsConformance,
  sessionWorkPrincipalsConformance,
  type SessionPrincipalBindingsFixture,
  type SessionWorkPrincipalsFixture,
} from '@omne-harness/session-cordis-contract/testing'

const bound = { tenant: memoryAccess('x').tenant, session: sessionId('session-1') }
const otherTenant = memoryOtherAccess('x').tenant

/** The verdict of each case on one fresh fixture: passed, failed by an assertion, or not applicable. */
async function verdicts<F>(cases: readonly ConformanceCase<F>[], fixture: () => F) {
  const failed: string[] = []
  const notApplicable: string[] = []
  for (const item of cases) {
    try {
      await item.run(fixture())
    } catch (error) {
      if (isNotApplicable(error)) notApplicable.push(item.name)
      else if (error instanceof AssertionError) failed.push(item.name)
      else throw new Error(`case "${item.name}" crashed instead of failing`, { cause: error })
    }
  }
  return { failed, notApplicable }
}

describe('sessionPrincipalBindingsConformance', () => {
  const cases = sessionPrincipalBindingsConformance()
  const [established, notBound] = cases.map(item => item.name) as [string, string]
  const fixture = (source?: SessionPrincipalBindingSource): SessionPrincipalBindingsFixture => ({
    source: source ?? createMemorySessionPrincipalBindings([bound]),
    bound,
    otherTenant,
  })

  it('passes on the memory double', async () => {
    expect(await verdicts(cases, () => fixture())).toEqual({ failed: [], notApplicable: [] })
  })

  it('fails when the source ignores the tenant', async () => {
    const real = createMemorySessionPrincipalBindings([bound])
    const variant: SessionPrincipalBindingSource = {
      read: input => real.read({ ...input, tenant: bound.tenant }),
    }
    expect((await verdicts(cases, () => fixture(variant))).failed).toEqual([notBound])
  })

  it('fails when the source answers another session for the established one', async () => {
    const real = createMemorySessionPrincipalBindings([bound])
    const variant: SessionPrincipalBindingSource = {
      read: async input => {
        const read = await real.read(input)
        return 'ok' in read && read.ok.kind === 'bound'
          ? { ok: { ...read.ok, session: `${read.ok.session}-x` as SessionId } }
          : read
      },
    }
    expect((await verdicts(cases, () => fixture(variant))).failed).toEqual([established])
  })

  it('records the requests in call order', async () => {
    const source = createMemorySessionPrincipalBindings()
    await source.read(bound)
    expect(source.controls.asked()).toEqual([bound])
  })
})

describe('sessionWorkPrincipalsConformance', () => {
  const cases = sessionWorkPrincipalsConformance<string>()
  const names = cases.map(item => item.name)
  const [issues, denied, quarantined, passesOn, issueFails] = names as [
    string,
    string,
    string,
    string,
    string,
  ]
  type Fixture = SessionWorkPrincipalsFixture<string>
  const memory = (
    wrap: (real: SessionWorkPrincipals<string>) => SessionWorkPrincipals<string> = real => real,
  ): Fixture => {
    const bindings = createMemorySessionPrincipalBindings([bound])
    const principals = createMemorySessionWorkPrincipals<string>({
      bindings,
      issue: request => `${request.actor}@${request.session}`,
    })
    return {
      principals: wrap(principals),
      bound,
      otherTenant,
      answerNextRead: bindings.controls.answerNext,
      failNextIssue: principals.controls.failNextIssue,
    }
  }

  it('passes on the memory double', async () => {
    expect(await verdicts(cases, () => memory())).toEqual({ failed: [], notApplicable: [] })
  })

  it('is not applicable without the binding and issue handles', async () => {
    const { answerNextRead: _a, failNextIssue: _f, ...rest } = memory()
    expect(await verdicts(cases, () => rest)).toEqual({
      failed: [],
      notApplicable: [quarantined, passesOn, issueFails],
    })
  })

  const variants: readonly (readonly [string, readonly string[], () => Fixture])[] = [
    [
      'issues nothing for the maintainer',
      [issues],
      () =>
        memory(real => ({
          forSession: async input =>
            input.actor === 'maintainer'
              ? { failure: { kind: 'denied', action: 'forSession' } }
              : real.forSession(input),
        })),
    ],
    [
      'answers unavailable for another tenant',
      [denied],
      () =>
        memory(real => ({
          forSession: async input => {
            const answer = await real.forSession(input)
            return input.tenant === otherTenant
              ? { failure: { kind: 'unavailable', owner: 'x', diagnostic: 'x' } }
              : answer
          },
        })),
    ],
    [
      'maps every refusal to denied',
      [quarantined, passesOn, issueFails],
      () =>
        memory(real => ({
          forSession: async input => {
            const answer = await real.forSession(input)
            return 'failure' in answer
              ? { failure: { kind: 'denied', action: 'forSession' } }
              : answer
          },
        })),
    ],
    [
      'turns a quarantined read into unavailable',
      [passesOn],
      () =>
        memory(real => ({
          forSession: async input => {
            const answer = await real.forSession(input)
            return 'failure' in answer &&
              answer.failure.kind === 'quarantined' &&
              answer.failure.diagnostic === 'record damaged'
              ? { failure: { kind: 'unavailable', owner: 'x', diagnostic: 'x' } }
              : answer
          },
        })),
    ],
    [
      'names another owner for a failed issue',
      [issueFails],
      () =>
        memory(real => ({
          forSession: async input => {
            const answer = await real.forSession(input)
            return 'failure' in answer &&
              answer.failure.kind === 'unavailable' &&
              answer.failure.owner === 'identity'
              ? { failure: { ...answer.failure, owner: 'session' } }
              : answer
          },
        })),
    ],
  ]
  for (const [name, fails, fixture] of variants)
    it(`fails exactly the listed cases when the port ${name}`, async () => {
      expect((await verdicts(cases, fixture)).failed.sort()).toEqual([...fails].sort())
    })

  it('has a variant for every case', () => {
    expect(names.filter(name => !variants.some(([, fails]) => fails.includes(name)))).toEqual([])
  })

  it('reads the binding before it issues, and records the requests', async () => {
    const bindings = createMemorySessionPrincipalBindings()
    const principals = createMemorySessionWorkPrincipals<string>({
      bindings,
      issue: () => {
        throw new Error('issued without a binding')
      },
    })
    const request = { actor: 'coordinator', ...bound } as const
    expect(await principals.forSession(request)).toEqual({
      failure: { kind: 'denied', action: 'forSession' },
    })
    expect(principals.controls.asked()).toEqual([request])
    expect(bindings.controls.asked()).toEqual([bound])
  })
})

describe('the three trusted services', () => {
  it('load under their keys in a real Context and leave on unload', async () => {
    class Delegated extends SessionDelegatedTransactionsService<string> {
      readonly bind: SessionDelegatedTransactions<string>['bind'] = () => {
        throw new Error('not called')
      }
    }
    class Work extends SessionWorkPrincipalsService<string> {
      readonly forSession: SessionWorkPrincipals<string>['forSession'] = async () => ({
        failure: { kind: 'denied', action: 'forSession' },
      })
    }
    class Bindings extends SessionPrincipalBindingsService {
      readonly read: SessionPrincipalBindingSource['read'] = async () => ({
        ok: { kind: 'not-bound' },
      })
    }
    const ctx = new Context()
    for (const [Probe, key] of [
      [Delegated, sessionDelegatedTransactionsKey],
      [Work, sessionWorkPrincipalsKey],
      [Bindings, sessionPrincipalBindingsKey],
    ] as const) {
      const fiber = await ctx.plugin(Probe)
      expect(ctx.get(key)).toBeInstanceOf(Probe)
      await fiber.dispose()
      expect(ctx.get(key)).toBeUndefined()
    }
  })
})
