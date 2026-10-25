// Self-proof of the ToolStartFence suite: it passes on the conforming double, and each case fails
// under a violating variant. The variants wrap the fence or the authority of the double at the port
// boundary; they live here and are not exported.
import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import {
  createMemoryToolStartAuthority,
  memoryToolStartFenceFixture,
  toolStartFenceConformance,
} from '@omne-harness/tool-contract/testing'
import type { StartProgress, ToolStartAuthority } from '@omne-harness/tool-contract/provider'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  judge,
  type Variant,
} from './conformance-harness.ts'
import { fenceWithoutSettle, oneTenantFence, type Fixture } from './start-fence-legal.ts'
import { evidence } from './tool-values.ts'

const NAMES = {
  F1: 'a fence confirmed before the consume refuses a permit prepared before it',
  F2: 'a start accepted before the fence stays accepted and is not stopped by it',
  F3: 'a permit prepared after the fence starts on its own merit',
  F4: 'a resent fence returns the first evidence and moves the guard once',
  F5: 'a fence operation reused for another guard input is a conflict that changes nothing',
  F6: 'the fence of another tenant does not refuse the starts of a tenant',
} as const

/** The double with `build` laid over its fence and its authority. */
function variant(
  build: (fixture: Fixture) => Partial<Pick<Fixture, 'fence' | 'authority'>>,
): () => Fixture {
  return () => {
    const base = memoryToolStartFenceFixture()
    return { ...base, ...build(base) }
  }
}

/** An authority whose consume refuses every start once `fenced()` is true. */
function refusingAfter(
  real: ToolStartAuthority<string>,
  fenced: () => boolean,
): ToolStartAuthority<string> {
  return {
    ...real,
    consume: async input => {
      const answer = await real.consume(input)
      if (!fenced() || 'failure' in answer || answer.ok.kind !== 'started') return answer
      return succeed<StartProgress>({
        kind: 'rejected',
        reason: 'fenced',
        exclusion: evidence('fenced'),
      })
    },
  }
}

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'the fence confirms without invalidating',
    fails: [NAMES.F1, NAMES.F5],
    fixture: variant(() => ({
      fence: { invalidate: () => Promise.resolve(succeed(evidence('fake-fence'))) },
    })),
  },
  {
    name: 'the fence and the authority are two ordering domains',
    fails: [NAMES.F1],
    fixture: variant(() => {
      const elsewhere = createMemoryToolStartAuthority<string>()
      return { fence: { invalidate: elsewhere.invalidate } }
    }),
  },
  {
    name: 'the fence reaches back to a start that was already accepted',
    fails: [NAMES.F2],
    fixture: variant(base => {
      let fenced = false
      return {
        fence: {
          invalidate: input => {
            fenced = true
            return base.fence.invalidate(input)
          },
        },
        authority: {
          ...base.authority,
          inspect: async input => {
            const answer = await base.authority.inspect(input)
            if (!fenced || 'failure' in answer || answer.ok.kind !== 'started') return answer
            return succeed<StartProgress>({
              kind: 'rejected',
              reason: 'fenced',
              exclusion: evidence('fenced'),
            })
          },
        },
      }
    }),
  },
  {
    name: 'a fence refuses every later start',
    fails: [NAMES.F2, NAMES.F3, NAMES.F4, NAMES.F5, NAMES.F6],
    fixture: variant(base => {
      let fenced = false
      return {
        fence: {
          invalidate: input => {
            fenced = true
            return base.fence.invalidate(input)
          },
        },
        authority: refusingAfter(base.authority, () => fenced),
      }
    }),
  },
  {
    name: 'a resent fence is taken as a new operation',
    fails: [NAMES.F4, NAMES.F5],
    fixture: variant(base => {
      let sent = 0
      return {
        fence: {
          invalidate: input => {
            sent += 1
            return base.fence.invalidate({
              ...input,
              operation: `${input.operation}-${sent}` as typeof input.operation,
            })
          },
        },
      }
    }),
  },
  {
    name: 'a fence of one tenant moves the guard of every tenant',
    fails: [NAMES.F6],
    fixture: variant(base => ({
      fence: { invalidate: input => base.fence.invalidate({ ...input, ...base.access }) },
    })),
  },
]

describe('ToolStartFence conformance suite', () => {
  const cases = toolStartFenceConformance<string>()

  it('lists the cases in the order of the violation map, each naming P04', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolStartFenceFixture)
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
      name: 'one tenant only',
      fixture: oneTenantFence,
      notApplicable: { [NAMES.F6]: 'otherAccess' },
    },
    { name: 'no settle', fixture: fenceWithoutSettle },
  ])

  it('gives the outer caller only invalidate', () => {
    expect(Object.keys(memoryToolStartFenceFixture().fence)).toEqual(['invalidate'])
  })
})
