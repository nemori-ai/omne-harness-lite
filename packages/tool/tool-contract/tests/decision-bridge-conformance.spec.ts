// Self-proof of the ToolDecisionBridge suite: it passes on the conforming double, each case
// fails under a violating variant that breaks the rule of that case, and a fixture without control
// handles reports the cases that need them as not applicable. The variants of the cases that the
// resource response suite shares are in external-association-variants.ts.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  decisionBridgeAnswers,
  memoryToolDecisionBridgeFixture,
  toolDecisionBridgeConformance,
  type ToolDecisionBridgeFixture,
} from '@omne-harness/tool-contract/testing'
import type { DecisionValue, ToolDecisionBridge } from '@omne-harness/tool-contract'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itNeedsTheHandle,
  itPassesLegal,
  judge,
  later,
  resolvesEarly,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import { generated, makeShared, oneTenant, shortRecords } from './decision-bridge-legal.ts'
import { externalLegal } from './external-association-legal.ts'
import { externalVariants, SHARED } from './external-association-variants.ts'
import { maskKinds, maskedMethods } from './generated-provider.ts'
import { evidence } from './tool-values.ts'

const NAMES = {
  ...SHARED,
  D1: 'ensure recalls the registration of the call and wait for another operation',
  D2: 'inspect shows no decision before the owner decides',
  D3: 'inspect shows the decision that the owner made',
  D4: 'resolve returns the original decision value',
  D5: 'a no-answer and a declined decision are resolved as they were made',
  D6: 'resolve refuses a decision that was never made',
  D7: 'another tenant cannot resolve the decision of a tenant',
  D8: 'resolve refuses the decision of another wait',
} as const

type Fixture = ToolDecisionBridgeFixture<string>
type Bridge = ToolDecisionBridge<string>
type Handles = Partial<Pick<Fixture, 'excludeDeferred' | 'invalidations' | 'decide'>>

/** A fixture whose bridge is the double with `bridge` laid over it and `handles` replaced. */
function bridgeVariant(
  build: (real: Bridge, base: Fixture) => Readonly<{ bridge?: Partial<Bridge>; handles?: Handles }>,
): () => Fixture {
  return () => {
    const base = memoryToolDecisionBridgeFixture()
    const laid = build(base.bridge, base)
    return { ...base, ...laid.handles, bridge: { ...base.bridge, ...laid.bridge } }
  }
}

const APPROVAL: DecisionValue = { kind: 'answer', value: { kind: 'string', value: 'approve' } }

const variants: readonly Variant<Fixture>[] = [
  ...externalVariants(makeShared, {
    'inspect answers another registration': [NAMES.D1, NAMES.D2, NAMES.D3],
    // Every case that registers a wait first reads the ensure that answered a lost reply.
    'a resend of an ensure during its lost reply answers another registration than the one that lands':
      [NAMES.D1, NAMES.D2, NAMES.D3, NAMES.D4, NAMES.D5, NAMES.D6, NAMES.D7, NAMES.D8],
  }),
  {
    // The registration is keyed by the operation too, so another operation registers again.
    name: 'ensure registers again for another operation of the same wait',
    fails: [NAMES.D1],
    fixture: bridgeVariant(real => {
      const first = new Map<string, string>()
      return {
        bridge: {
          ensure: async input => {
            const answer = await real.ensure(input)
            if ('failure' in answer) return answer
            const original = first.get(input.wait) ?? input.operation
            first.set(input.wait, original)
            return original === input.operation
              ? answer
              : succeed({ ...answer.ok, digest: `sha256:other-${input.operation}` })
          },
        },
      }
    }),
  },
  {
    name: 'inspect shows a decision before the owner decided',
    fails: [NAMES.D2],
    fixture: bridgeVariant(real => ({
      bridge: {
        inspect: async input => {
          const answer = await real.inspect(input)
          return 'failure' in answer || answer.ok.decision !== null
            ? answer
            : succeed({ ...answer.ok, decision: evidence('premature') })
        },
      },
    })),
  },
  {
    name: 'inspect forgets the decision',
    fails: [NAMES.D3],
    fixture: bridgeVariant(real => ({
      bridge: {
        inspect: async input => {
          const answer = await real.inspect(input)
          return 'failure' in answer ? answer : succeed({ ...answer.ok, decision: null })
        },
      },
    })),
  },
  {
    name: 'resolve answers another value than the decision',
    fails: [NAMES.D4, NAMES.D5, NAMES.D7],
    fixture: bridgeVariant(real => ({
      bridge: {
        resolve: async input => {
          const answer = await real.resolve(input)
          return 'failure' in answer
            ? answer
            : succeed<DecisionValue>({ kind: 'answer', value: { kind: 'string', value: 'other' } })
        },
      },
    })),
  },
  {
    // The owner declined or gave no answer, and the bridge reads it as consent.
    name: 'resolve turns a no-answer and a declined decision into an answer',
    fails: [NAMES.D5],
    fixture: bridgeVariant(real => ({
      bridge: {
        resolve: async input => {
          const answer = await real.resolve(input)
          return 'failure' in answer || answer.ok.kind === 'answer'
            ? answer
            : succeed<DecisionValue>(APPROVAL)
        },
      },
    })),
  },
  {
    // Evidence that is no decision is answered with a default decision.
    name: 'resolve answers a default for evidence that is no decision',
    fails: [NAMES.D6, NAMES.D7, NAMES.D8],
    fixture: bridgeVariant(real => ({
      bridge: {
        resolve: async input => {
          const answer = await real.resolve(input)
          return 'ok' in answer ? answer : succeed<DecisionValue>(APPROVAL)
        },
      },
    })),
  },
  {
    // The resolve of another tenant finds the decision of the first one.
    name: 'resolve ignores the tenant',
    fails: [NAMES.D7],
    fixture: bridgeVariant((real, base) => ({
      bridge: {
        resolve: input => real.resolve({ ...input, tenant: base.access.tenant }),
      },
    })),
  },
  {
    // The failure for a decision of another tenant is `denied`: it tells that the decision exists.
    name: 'a foreign resolve is denied when the decision exists',
    fails: [NAMES.D7],
    fixture: bridgeVariant((real, base) => ({
      bridge: {
        resolve: async input => {
          const answer = await real.resolve(input)
          if (JSON.stringify(input.tenant) === JSON.stringify(base.access.tenant) || 'ok' in answer)
            return answer
          const own = await real.resolve({ ...input, tenant: base.access.tenant })
          return 'ok' in own ? fail({ kind: 'denied', action: 'read' }) : answer
        },
      },
    })),
  },
  {
    name: 'a foreign resolve makes the decision of the tenant forgotten',
    fails: [NAMES.D7],
    fixture: bridgeVariant((real, base) => {
      let forgotten = false
      return {
        bridge: {
          resolve: input => {
            const foreign = JSON.stringify(input.tenant) !== JSON.stringify(base.access.tenant)
            if (foreign) forgotten = true
            return forgotten && !foreign
              ? Promise.resolve(fail({ kind: 'invalid', field: 'decision', reason: 'forgotten' }))
              : real.resolve(input)
          },
        },
      }
    }),
  },
  {
    // A decision is found by its evidence alone, whichever wait asks.
    name: 'resolve ignores the wait that asks',
    fails: [NAMES.D8],
    fixture: bridgeVariant((real, base) => {
      const waitOf = new Map<string, Parameters<Bridge['resolve']>[0]['wait']>()
      return {
        handles: {
          decide: async input => {
            const decision = await base.decide?.(input)
            if (decision === undefined) throw new Error('the double offers decide')
            waitOf.set(decision.digest, input.wait)
            return decision
          },
        },
        bridge: {
          resolve: input =>
            real.resolve({ ...input, wait: waitOf.get(input.decision.digest) ?? input.wait }),
        },
      }
    }),
  },
]

const spySettle = (fixture: Fixture, used: () => void): Fixture => ({
  ...fixture,
  settle: async () => {
    used()
    await fixture.settle?.()
  },
})

const legal: readonly LegalProvider<Fixture>[] = [
  ...maskKinds(decisionBridgeAnswers).map((kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer is ${kind} until settle`,
    fixture: generated(kind),
  })),
  ...externalLegal(makeShared).map((provider): LegalProvider<Fixture> => ({
    name: provider.name,
    fixture: provider.fixture,
  })),
  {
    // A short record name such as "1" occurs in ordinary text (an operation of the other tenant,
    // a revision, a digest): it identifies the record only as a whole text.
    name: 'the records are named by a sequence number: "1", "2", ...',
    fixture: shortRecords,
  },
  {
    name: 'one tenant: only the cross-tenant cases are not applicable',
    fixture: oneTenant,
    notApplicable: {
      [NAMES.S5]: 'otherAccess',
      [NAMES.S6]: 'otherAccess',
      [NAMES.S7]: 'otherAccess',
      [NAMES.S8]: 'otherAccess',
      [NAMES.D7]: 'otherAccess',
    },
  },
]

/** Fixtures that break the completion contract of a handle: it resolves before the work landed. */
const lateHandles: readonly Variant<Fixture>[] = [
  {
    name: 'excludeDeferred resolves 3 turns before the exclusion holds',
    fails: [NAMES.S12],
    fixture: resolvesEarly(memoryToolDecisionBridgeFixture, 'excludeDeferred'),
  },
  {
    name: 'settle resolves 3 turns before the deferred operations land',
    fails: [NAMES.S11, NAMES.S16, NAMES.S17],
    fixture: () => {
      const base = memoryToolDecisionBridgeFixture()
      return {
        ...base,
        settle: () => {
          later(3, () => base.settle?.())
          return Promise.resolve()
        },
      }
    },
  },
]

/** The methods of the port that take an access, and the case that checks another tenant on each. */
const CROSS_TENANT: Readonly<Record<keyof ToolDecisionBridge<string>, string>> = {
  ensure: NAMES.S5,
  inspect: NAMES.S6,
  inspectOperation: NAMES.S7,
  invalidate: NAMES.S8,
  resolve: NAMES.D7,
}

describe('ToolDecisionBridge conformance suite', () => {
  const cases = toolDecisionBridgeConformance<string>()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolDecisionBridgeFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('names the missing handle of every case that needs one, and passes the others', async () => {
    const bare = (): Fixture => {
      const { bridge, access } = memoryToolDecisionBridgeFixture()
      return { bridge, access }
    }
    const verdict = await judge(cases, bare)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({
      [NAMES.S5]: 'otherAccess',
      [NAMES.S6]: 'otherAccess',
      [NAMES.S7]: 'otherAccess',
      [NAMES.S8]: 'otherAccess',
      [NAMES.S11]: 'hold',
      [NAMES.S12]: 'hold',
      [NAMES.S14]: 'invalidations',
      [NAMES.S15]: 'invalidations',
      [NAMES.S16]: 'hold',
      [NAMES.S17]: 'hold',
      [NAMES.S19]: 'invalidations',
      [NAMES.S21]: 'invalidations',
      [NAMES.D3]: 'decide',
      [NAMES.D4]: 'decide',
      [NAMES.D5]: 'decide',
      [NAMES.D7]: 'decide',
      [NAMES.D8]: 'decide',
    })
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })

  itFailsExactly(cases, variants)

  itPassesLegal(cases, legal)

  for (const kind of maskKinds(decisionBridgeAnswers))
    itNeedsTheHandle(cases, {
      name: `generated: every first answer is ${kind}`,
      handleName: 'settle',
      withHandle: generated(kind),
      without: generated(kind, false),
      spy: spySettle,
    })

  itFailsExactly(cases, lateHandles)

  it('masks every method of the table that has progress or a lost reply, and each rule names a row', () => {
    expect(maskedMethods(decisionBridgeAnswers).sort()).toEqual(
      ['ensure', 'inspectOperation', 'invalidate'].sort(),
    )
  })

  it('has a cross-tenant case for every method that takes an access, and it needs the second tenant', async () => {
    for (const name of Object.values(CROSS_TENANT))
      expect(
        cases.find(item => item.name === name),
        name,
      ).toBeDefined()
    expect(new Set(Object.values(CROSS_TENANT)).size).toBe(Object.keys(CROSS_TENANT).length)
    const bare = (): Fixture => {
      const { otherAccess: _other, ...rest } = memoryToolDecisionBridgeFixture()
      return rest
    }
    const verdict = await judge(cases, bare)
    for (const name of Object.values(CROSS_TENANT))
      expect(verdict.notApplicable[name]).toBe('otherAccess')
  })

  it('fails the cross-tenant cases of a fixture that names one tenant twice', async () => {
    const same = (): Fixture => {
      const base = memoryToolDecisionBridgeFixture()
      return { ...base, otherAccess: base.access }
    }
    const verdict = await judge(cases, same)
    expect([...verdict.failed].sort()).toEqual(
      [NAMES.S5, NAMES.S6, NAMES.S7, NAMES.S8, NAMES.D7].sort(),
    )
  })
})
