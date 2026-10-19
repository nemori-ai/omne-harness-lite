// Self-proof of the registration suite: it passes on the conforming register service, each
// case fails under a violating variant that breaks the rule of that case, and a fixture without
// control handles reports the cases that need them as not applicable. A variant is a register
// service with one flaw set (flawed-registrations.ts).
import { succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import type { ToolRegistrationService } from '@omne-harness/tool-cordis-contract/testing'
import {
  memoryToolRegistrationFixture,
  registrationAnswers,
  toolRegistrationConformance,
  type ToolRegistrationFixture,
} from '@omne-harness/tool-cordis-contract/testing'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  judge,
  later,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import { flawedFixture, type Flaws } from './flawed-registrations.ts'
import {
  generated,
  oneTenantChecking,
  preChecked,
  preCheckedDouble,
  tenantChecking,
} from './registration-legal.ts'

const NAMES = {
  R1: 'register answers a receipt of the execution and a token',
  R2: 'the same fiber, instance and handle registering again recalls the receipt',
  R3: 'a handle other than the registered one is a conflict',
  R4: 'another qualification of the same identity is a conflict',
  R5: 'a register at another generation never answers the receipt of the first',
  R6: 'another fiber cannot take an unreleased registration',
  R7: 'a successor registers once the original was released',
  R8: 'a late release of the original leaves the successor',
  R9: 'release removes once and a repeat answers removed false',
  R10: 'registering and releasing never touch the original work',
  R11: 'a refused check registers nothing, not even for a moment',
  R12: 'a refusal of the check keeps its kind',
  R13: 'every register is checked against the current qualification',
  R14: 'the last check is made before the entry exists',
  R15: 'a qualification withdrawn while a register is in flight registers nothing',
  R16: 'two fibers racing for one identity: one wins and one conflicts',
  R17: 'a fiber that exited registers nothing',
  R18: 'the end of a fiber removes its registration once',
  R19: 'a publication of another tenant is refused under the authority of a tenant',
  R20: 'the tenants of one call register apart',
} as const

type Fixture = ToolRegistrationFixture<string>

const flaw = (name: string, flaws: Flaws, fails: readonly string[]): Variant<Fixture> => ({
  name,
  fails,
  fixture: () => flawedFixture(flaws),
})

const variants: readonly Variant<Fixture>[] = [
  flaw('the receipt names another execution', { receiptOtherExecution: true }, [NAMES.R1]),
  flaw('the token of the receipt is empty', { emptyToken: true }, [
    NAMES.R1,
    NAMES.R7,
    NAMES.R9,
    NAMES.R14,
    NAMES.R15,
    NAMES.R20,
  ]),
  flaw('a register that recalls takes a new token', { recallFresh: true }, [
    NAMES.R2,
    NAMES.R3,
    NAMES.R4,
    NAMES.R5,
    NAMES.R6,
    NAMES.R8,
    NAMES.R18,
    NAMES.R20,
  ]),
  flaw('another handle takes the identity over', { overwriteOtherHandle: true }, [NAMES.R3]),
  flaw('the fiber is not compared', { shareAcrossFibers: true }, [NAMES.R6, NAMES.R16]),
  flaw('a release removes the entry of the identity', { releaseByIdentity: true }, [
    NAMES.R8,
    NAMES.R18,
  ]),
  flaw('a repeated release removes again', { repeatedReleaseRemoves: true }, [NAMES.R2, NAMES.R9]),
  flaw('a release ends the observation of the work', { releaseTouchesWork: true }, [NAMES.R10]),
  flaw('a refused check is written and taken back', { writeThenRollback: true }, [NAMES.R11]),
  flaw('the entry is written before the check', { writeBeforeCheck: true }, [NAMES.R14]),
  flaw('a register yields between the test and the write', { yieldBeforeWrite: true }, [
    NAMES.R15,
    NAMES.R16,
  ]),
  flaw('registers that meet in flight all conflict, so none registers', { bothLose: true }, [
    NAMES.R15,
    NAMES.R16,
  ]),
  flaw('every refusal of the check is denied', { refusalAsDenied: true }, [NAMES.R12]),
  flaw('a recall does not consult the check', { skipCheckOnRecall: true }, [NAMES.R13]),
  flaw('an exited fiber can still register', { exitedFiberRegisters: true }, [NAMES.R17]),
  flaw('the end of a fiber leaves its registration behind', { fiberEndKeepsEntry: true }, [
    NAMES.R18,
  ]),
  flaw('the key ignores the tenant', { tenantBlind: true }, [NAMES.R20]),
  flaw(
    'a recall that meets another register in flight answers another token',
    { crowdedRecallFresh: true },
    [NAMES.R2],
  ),
  flaw('a recall does not compare the qualification', { ignoreAuthority: true }, [NAMES.R4]),
  flaw('another qualification is refused as unavailable', { otherQualificationUnavailable: true }, [
    NAMES.R4,
  ]),
  flaw(
    'another qualification removes the registration it conflicts with',
    { conflictSpoilsEntry: true },
    [NAMES.R4, NAMES.R5],
  ),
  flaw(
    'a recall at another generation answers the receipt of the first',
    { ignoreGeneration: true },
    [NAMES.R5],
  ),
  flaw('another generation takes the registration over', { generationOverwrites: true }, [
    NAMES.R5,
  ]),
  flaw('after a release the identity is burned for other fibers', { burnedAfterRelease: true }, [
    NAMES.R7,
    NAMES.R8,
    NAMES.R18,
  ]),
  // The rejection reaches only the case that withdraws the qualification while a register is in
  // flight, and it is an assertion failure of that case, not a crash of the suite.
  flaw(
    'a register rejects when the check changes while it is in flight',
    { rejectsWhenCheckChanges: true },
    [NAMES.R15],
  ),
  flaw(
    'a refused check writes the entry after the answer, and keeps it',
    { writeAfterAnswerMs: 0 },
    [NAMES.R11],
  ),
  // The write comes well within the quiet period of 25 ms, but not at once: only a case that
  // waits for the quiet period sees it.
  flaw(
    'a refused check writes the entry 10 ms after the answer, and keeps it',
    { writeAfterAnswerMs: 10 },
    [NAMES.R11],
  ),
  flaw(
    'a refused recall answers conflict instead of the refusal',
    { recallRefusedAsConflict: true },
    [NAMES.R13],
  ),
  flaw('the check is made once and the entry is written after a yield', { checkThenYield: true }, [
    NAMES.R15,
  ]),
  flaw('the release of another tenant removes nothing', { foreignReleaseRemovesNothing: true }, [
    NAMES.R20,
  ]),
  flaw(
    'the check accepts an authority for a publication of any tenant',
    { authorityTenantBlind: true },
    [NAMES.R19],
  ),
  flaw('a recall that comes alone answers another token', { loneRecallFresh: true }, [
    NAMES.R2,
    NAMES.R3,
    NAMES.R4,
    NAMES.R5,
    NAMES.R6,
    NAMES.R8,
    NAMES.R18,
    NAMES.R20,
  ]),
  flaw('a recall after any release answers another token', { recallFreshAfterRelease: true }, [
    NAMES.R8,
    NAMES.R18,
    NAMES.R20,
  ]),
  flaw('another handle is refused as unavailable', { otherHandleUnavailable: true }, [NAMES.R3]),
  flaw('another fiber is refused as unavailable', { otherFiberUnavailable: true }, [
    NAMES.R6,
    NAMES.R16,
  ]),
  flaw('a late release mutes the successor', { lateReleaseMutesSuccessor: true }, [NAMES.R8]),
  flaw(
    'a late release answers removed true and keeps the successor',
    { lateReleaseClaimsRemoval: true },
    [NAMES.R8, NAMES.R18],
  ),
  flaw(
    'the first release removes the entry and answers removed false',
    { firstReleaseAnswersFalse: true },
    [NAMES.R2, NAMES.R7, NAMES.R8, NAMES.R9, NAMES.R20],
  ),
  flaw('the second release answers removed true', { secondReleaseRemoves: true }, [
    NAMES.R2,
    NAMES.R9,
  ]),
  flaw('the third release answers removed true', { thirdReleaseRemoves: true }, [NAMES.R9]),
  flaw('a denied refusal is reported as unavailable', { deniedAsUnavailable: true }, [
    NAMES.R11,
    NAMES.R12,
    NAMES.R13,
  ]),
  flaw(
    'a release rewrites the receipt of the other tenant, and removes by identity',
    { foreignReleaseRewrites: true, releaseByIdentity: true },
    [NAMES.R8, NAMES.R18, NAMES.R20],
  ),
  flaw('a release mutes the registration of the other tenant', { foreignReleaseMutes: true }, [
    NAMES.R20,
  ]),
  {
    // The provider checks twice. The withdrawal in flight reaches the final check, which names
    // another kind than the withdrawal.
    name: 'a withdrawal in flight is answered denied by the final check',
    fails: [NAMES.R15],
    fixture: () => preChecked(flawedFixture({ refusalAsDenied: true })),
  },
  {
    // The entry is written before the check and stays when the check refuses it later.
    name: 'a refusal in flight leaves the entry that was written before the check',
    fails: [NAMES.R14, NAMES.R15, NAMES.R19],
    fixture: () => preChecked(flawedFixture({ writeBeforeCheck: true, keepOnRefusal: true })),
  },
]

/** Providers that the contract allows, built in registration-legal.ts at the service boundary. */
const legal: readonly LegalProvider<Fixture>[] = [
  {
    name: 'generated: the table has no progress kind, so the boundary masks nothing',
    fixture: generated,
  },
  {
    name: 'a preliminary check before the final synchronous check',
    fixture: preCheckedDouble,
  },
  {
    name: 'a tenant-checking authority with two tenants',
    fixture: tenantChecking,
  },
  {
    // The cases that need a second tenant are not applicable.
    name: 'a tenant-checking authority with one tenant: a check that knows the tenant of its authority only',
    fixture: oneTenantChecking,
    notApplicable: { [NAMES.R19]: 'otherTenant', [NAMES.R20]: 'otherTenant' },
  },
]

/**
 * Fixtures that break the completion contract of `endFiber`: it resolves before the automatic
 * disposers of the fiber have removed its entries.
 */
const lateEndFiber: readonly Variant<Fixture>[] = [
  {
    name: 'endFiber resolves 3 turns before the fiber is ended and its entries are removed',
    fails: [NAMES.R17, NAMES.R18],
    fixture: () => {
      const base = memoryToolRegistrationFixture()
      return {
        ...base,
        endFiber: fiber => {
          later(3, () => base.endFiber?.(fiber))
          return Promise.resolve()
        },
      }
    },
  },
]

/** The methods of the service that take a tenant, and the case that checks another tenant on each. */
const CROSS_TENANT: Readonly<Record<keyof ToolRegistrationService<string>, readonly string[]>> = {
  register: [NAMES.R19, NAMES.R20],
}

describe('registration conformance suite', () => {
  const cases = toolRegistrationConformance<string>()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming register service with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolRegistrationFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('passes on the flawed service with no flaw set, so that the variants stay one flaw away', async () => {
    const verdict = await judge(cases, () => flawedFixture())
    expect(verdict.failed).toEqual([])
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('names the missing handle of every case that needs one, and passes the others', async () => {
    const bare = (): Fixture => {
      const { service, tenant, authority } = memoryToolRegistrationFixture()
      return { service, tenant, authority }
    }
    const verdict = await judge(cases, bare)
    expect(verdict.failed).toEqual([])
    expect(verdict.passed).toEqual([NAMES.R1, NAMES.R2, NAMES.R3, NAMES.R5, NAMES.R9, NAMES.R10])
    expect(verdict.notApplicable).toEqual({
      [NAMES.R4]: 'renewedAuthority',
      [NAMES.R6]: 'asFiber',
      [NAMES.R7]: 'asFiber',
      [NAMES.R8]: 'asFiber',
      [NAMES.R11]: 'refuseCheck',
      [NAMES.R12]: 'refuseCheck',
      [NAMES.R13]: 'refuseCheck',
      [NAMES.R14]: 'checkedAgainst',
      [NAMES.R15]: 'refuseCheck',
      [NAMES.R16]: 'asFiber',
      [NAMES.R17]: 'asFiber',
      [NAMES.R18]: 'asFiber',
      [NAMES.R19]: 'otherTenant',
      [NAMES.R20]: 'otherTenant',
    })
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })

  itFailsExactly(cases, variants)

  itPassesLegal(cases, legal)

  itFailsExactly(cases, lateEndFiber)

  it('has a table without progress, and every case that reads a register reads it through the table', () => {
    for (const row of Object.values(registrationAnswers)) {
      expect(row.progress).toEqual([])
      expect('lostReply' in row).toBe(false)
    }
  })

  it('has a cross-tenant case for every method that takes a tenant, and it needs the second tenant', async () => {
    const bare = (): Fixture => {
      const {
        otherTenant: _tenant,
        otherAuthority: _authority,
        ...rest
      } = memoryToolRegistrationFixture()
      return rest
    }
    const verdict = await judge(cases, bare)
    for (const names of Object.values(CROSS_TENANT))
      for (const name of names) {
        expect(
          cases.find(item => item.name === name),
          name,
        ).toBeDefined()
        expect(verdict.notApplicable[name]).toBe('otherTenant')
      }
  })

  it('fails the first case for a receipt whose release is not a function', async () => {
    // Only the first case runs: every other case calls release and would crash on it.
    const first = cases.filter(item => item.name === NAMES.R1)
    const noRelease = (): Fixture => {
      const base = memoryToolRegistrationFixture()
      return {
        ...base,
        service: {
          register: async input => {
            const answer = await base.service.register(input)
            return 'failure' in answer
              ? answer
              : succeed({ ...answer.ok, release: 'release' as never })
          },
        },
      }
    }
    const verdict = await judge(first, noRelease)
    expect(verdict.failed).toEqual([NAMES.R1])
  })

  it('must name another tenant, or the cross-tenant cases fail and say why', async () => {
    const same = (): Fixture => {
      const base = memoryToolRegistrationFixture()
      return { ...base, otherTenant: base.tenant }
    }
    const cross = [NAMES.R19, NAMES.R20]
    const verdict = await judge(cases, same)
    expect([...verdict.failed].sort()).toEqual([...cross].sort())
    for (const name of cross)
      await expect(cases.find(item => item.name === name)!.run(same())).rejects.toThrow(
        /names one tenant twice/u,
      )
  })
})
