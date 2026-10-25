// Self-proof of the authorization consumption suite of P04: it passes on the conforming double, and
// each case fails under a violating variant. The variants wrap the authority or the authorization
// handles of the double at the port boundary; they live here and are not exported.
import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import {
  createMemoryAuthorizedToolStartAuthority,
  memoryToolStartAuthorizationFixture,
  runConformanceCase,
  toolStartAuthorizationConformance,
  type ToolPermitReading,
  type ToolStartAuthorizationHandles,
} from '@omne-harness/tool-contract/testing'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  StartPermit,
  StartProgress,
  ToolPermitRef,
  ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  judge,
  type Variant,
} from './conformance-harness.ts'
import {
  authorizationWithoutSettle,
  withoutAuthorization,
  type Fixture,
} from './start-authorization-legal.ts'
import { evidence } from './tool-values.ts'

const NAMES = {
  A1: 'consume consumes the bound permit once and a resend recalls it',
  A2: 'another call that presents a consumed permit never starts',
  A3: 'a revocation before the consume refuses the start and spends no permit',
  A4: 'a revocation after the acceptance leaves the start accepted',
  A5: 'a start answered not-started keeps the permit for its call',
} as const

type Handles = ToolStartAuthorizationHandles<string>
type Layer = Partial<{ authority: ToolStartAuthority<string>; authorization: Handles }>

/** The double with `build` laid over its authority and its authorization handles. */
function variant(
  build: (real: { authority: ToolStartAuthority<string>; authorization: Handles }) => Layer,
): () => Fixture {
  return () => {
    const base = memoryToolStartAuthorizationFixture()
    const authorization = base.authorization as Handles
    const layer = build({ authority: base.authority, authorization })
    return {
      ...base,
      authority: layer.authority ?? base.authority,
      authorization: layer.authorization ?? authorization,
    }
  }
}

const key = (permit: ToolPermitRef): string => JSON.stringify(permit)
const consumedBy = (permit: ToolPermitRef, mark: string): ToolPermitReading => ({
  kind: 'consumed',
  fact: {
    permit,
    consumer: { owner: 'variant', work: mark, position: mark },
    evidence: evidence(mark),
  },
})

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'consume ignores the bound permit',
    fails: [NAMES.A1, NAMES.A2, NAMES.A5],
    fixture: variant(({ authorization }) => ({
      authorization: {
        ...authorization,
        // The binding never reaches the authority: a fresh permit of another ledger, always open.
        bind: input =>
          Promise.resolve({ tenant: input.access.tenant, permit: `unbound-${String(input.call)}` }),
        read: permit =>
          permit.permit.startsWith('unbound-')
            ? Promise.resolve<ToolPermitReading>({ kind: 'open' })
            : authorization.read(permit),
      },
    })),
  },
  {
    name: 'consume ignores the revocation',
    fails: [NAMES.A3],
    fixture: variant(({ authorization }) => ({
      authorization: { ...authorization, revoke: () => Promise.resolve() },
    })),
  },
  {
    name: 'a refused start spends the permit before the recheck refuses it',
    fails: [NAMES.A2, NAMES.A3],
    fixture: variant(({ authority, authorization }) => {
      const bound = new Map<string, ToolPermitRef>()
      const spent = new Set<string>()
      return {
        authorization: {
          ...authorization,
          bind: async input => {
            const permit = await authorization.bind(input)
            bound.set(String(input.call), permit)
            return permit
          },
          read: permit =>
            spent.has(key(permit))
              ? Promise.resolve(consumedBy(permit, 'spent'))
              : authorization.read(permit),
        },
        authority: {
          ...authority,
          consume: async input => {
            const answer = await authority.consume(input)
            const permit = bound.get(String(input.call))
            if ('ok' in answer && answer.ok.kind === 'rejected' && permit !== undefined)
              spent.add(key(permit))
            return answer
          },
        },
      }
    }),
  },
  {
    name: 'a revocation reaches back to an accepted start',
    fails: [NAMES.A4],
    fixture: variant(({ authority, authorization }) => {
      let revoked = false
      return {
        authorization: {
          ...authorization,
          revoke: input => {
            revoked = true
            return authorization.revoke(input)
          },
        },
        authority: {
          ...authority,
          inspect: async input => {
            const answer = await authority.inspect(input)
            if (!revoked || 'failure' in answer || answer.ok.kind !== 'started') return answer
            return succeed<StartProgress>({
              kind: 'rejected',
              reason: 'revoked',
              exclusion: evidence('revoked'),
            })
          },
        },
      }
    }),
  },
  {
    name: 'every consume records a new consumption',
    fails: [NAMES.A1, NAMES.A2],
    fixture: variant(({ authority, authorization }) => {
      let consumes = 0
      return {
        authority: {
          ...authority,
          consume: input => {
            consumes += 1
            return authority.consume(input)
          },
        },
        authorization: {
          ...authorization,
          read: async permit => {
            const reading = await authorization.read(permit)
            return reading.kind === 'consumed' ? consumedBy(permit, `consume-${consumes}`) : reading
          },
        },
      }
    }),
  },
  {
    name: 'a start answered not-started spends the permit',
    fails: [NAMES.A5],
    fixture: variant(({ authority, authorization }) => {
      const bound = new Map<string, ToolPermitRef>()
      const spent = new Set<string>()
      return {
        authorization: {
          ...authorization,
          bind: async input => {
            const permit = await authorization.bind(input)
            bound.set(String(input.call), permit)
            return permit
          },
          read: permit =>
            spent.has(key(permit))
              ? Promise.resolve(consumedBy(permit, 'spent'))
              : authorization.read(permit),
        },
        authority: {
          ...authority,
          inspect: async input => {
            const answer = await authority.inspect(input)
            const permit = bound.get(String(input.call))
            if ('ok' in answer && answer.ok.kind === 'not-started' && permit !== undefined)
              spent.add(key(permit))
            return answer
          },
        },
      }
    }),
  },
]

describe('authorization consumption conformance suite', () => {
  const cases = toolStartAuthorizationConformance<string>()

  it('lists the cases in the order of the violation map, each naming P04', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolStartAuthorizationFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })

  itFailsExactly(cases, variants)

  itPassesLegal(cases, [
    {
      name: 'no authorization permit is bound',
      fixture: withoutAuthorization,
      notApplicable: Object.fromEntries(Object.values(NAMES).map(name => [name, 'authorization'])),
    },
    { name: 'no settle', fixture: authorizationWithoutSettle },
  ])
})

describe('the acceptance record of the authorized double', () => {
  it('freezes the guard revisions of the permit and carries the consumed permit reference', async () => {
    const double = createMemoryAuthorizedToolStartAuthority<string>()
    const seen: { acceptance: DurableEvidence; permit: StartPermit }[] = []
    const fixture: Fixture = {
      ...memoryToolStartAuthorizationFixture(),
      authorization: double.authorization,
      authority: {
        ...double,
        consume: async input => {
          const answer = await double.consume(input)
          if ('ok' in answer && answer.ok.kind === 'started')
            seen.push({ acceptance: answer.ok.acceptance, permit: input.permit })
          return answer
        },
      },
    }
    const [first] = toolStartAuthorizationConformance<string>()
    expect(await runConformanceCase(first as NonNullable<typeof first>, fixture)).toEqual({
      kind: 'passed',
    })
    const [accepted] = seen
    const record = double.acceptanceOf((accepted as NonNullable<typeof accepted>).acceptance)
    expect(record?.guards).toEqual(accepted?.permit.guards)
    expect(record?.permit).toEqual(accepted?.permit.request)
    expect(record?.start).toEqual(accepted?.permit.start)
    expect(record?.authorizations).toHaveLength(1)
    expect(record?.authorizations[0]?.permit.tenant).toEqual(fixture.access.tenant)
    expect(record?.authorizations[0]?.consumer.work).toBe(record?.call)
  })

  it('has no record for an evidence it did not mint', () => {
    expect(
      createMemoryAuthorizedToolStartAuthority<string>().acceptanceOf(evidence('x')),
    ).toBeNull()
  })
})
