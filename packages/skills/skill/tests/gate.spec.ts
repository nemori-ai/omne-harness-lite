// Steps 1 to 3 of a read, through `gate` directly: the basis identity, the read check, the
// resolution, and the abort checkpoints around the two port calls. Each branch has one case
// named by its step.
import { describe, expect, it } from 'vitest'
import { isSafeReason, isSkillName } from '@omne-harness/skill-contract'
import type {
  ReadVerdict,
  Resolution,
  SkillReadCheck,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'
import { gate } from '../src/access/gate.ts'
import {
  alice,
  checkedOnly,
  createWorld,
  currentBasis,
  currentDigest,
  earlierBasis,
  earlierDigest,
  failureOf,
  granted,
  mallory,
  missing,
  noPackage,
  okOf,
  retired,
  review,
  scope,
  tool,
  type Principal,
  type Scope,
} from './access-world.ts'

describe('step 1: the basis names the target', () => {
  it('step-01-bad-basis answers not-available-to-you without calling a port', async () => {
    const { ports, controls } = createWorld()
    const basis = { ...currentBasis, capability: missing }
    expect(failureOf(await gate(ports, alice, scope, review, basis))).toStrictEqual({
      kind: 'not-available-to-you',
    })
    expect(controls.calls()).toStrictEqual({ check: 0, resolve: 0, snapshot: 0, open: 0 })
  })

  it('step-01-bad-basis also for the same name in another category', async () => {
    const { ports } = createWorld()
    const basis = { ...currentBasis, capability: tool('review') }
    expect(failureOf(await gate(ports, alice, scope, review, basis))).toStrictEqual({
      kind: 'not-available-to-you',
    })
  })

  it('step-01-same-basis passes a basis that names the target', async () => {
    const { ports } = createWorld()
    const gated = okOf(await gate(ports, alice, scope, review, currentBasis))
    expect(gated.basis).toStrictEqual(currentBasis)
    expect(gated.ref.digest).toBe(currentDigest)
  })
})

describe('step 2: the read check', () => {
  it('step-02-granted goes on to the resolution', async () => {
    const { ports } = createWorld()
    const gated = okOf(await gate(ports, alice, scope, review))
    expect(gated.layer).toBe('tenant')
    expect(gated.declared.name).toBe('review')
  })

  it('step-02-refused answers not-available-to-you without calling the resolution', async () => {
    const { ports, controls } = createWorld()
    expect(failureOf(await gate(ports, mallory, scope, review))).toStrictEqual({
      kind: 'not-available-to-you',
    })
    expect(controls.calls().resolve).toBe(0)
  })

  it('step-02-unknown answers unknown', async () => {
    const { ports } = createWorld()
    const undecided = { ...ports, readCheck: { check: async () => ({ kind: 'unknown' }) as const } }
    expect(failureOf(await gate(undecided, alice, scope, review))).toStrictEqual({
      kind: 'unknown',
    })
  })

  it.each([
    ['a kind outside the set', { kind: 'denied' }],
    ['an object without a kind', {}],
    ['no object at all', undefined],
    ['null', null],
  ])('step-02-outside-the-set: %s answers unknown and does not resolve', async (_case, verdict) => {
    const { ports, controls } = createWorld()
    const check: SkillReadCheck<Principal, Scope>['check'] = async () =>
      verdict as unknown as ReadVerdict
    expect(
      failureOf(await gate({ ...ports, readCheck: { check } }, alice, scope, review)),
    ).toStrictEqual({ kind: 'unknown' })
    expect(controls.calls().resolve).toBe(0)
  })
})

describe('step 3: the resolution', () => {
  it('step-03-adopted gives the reference and the declared projection', async () => {
    const { ports } = createWorld()
    const gated = okOf(await gate(ports, alice, scope, review))
    expect(gated.ref.locator).toStrictEqual({ kind: 'directory', root: '/skills/review' })
    expect(gated.declared.tools.map(item => item.name)).toStrictEqual(['read-file'])
    expect(gated).not.toHaveProperty('basis')
  })

  it('step-03-passes the basis to the resolution only when there is one', async () => {
    const { ports } = createWorld()
    const received: unknown[] = []
    const recording: SkillResolution<Principal, Scope> = {
      ...ports.resolution,
      resolve: (who, at, item, options) => {
        received.push(options)
        return ports.resolution.resolve(who, at, item, options)
      },
    }
    const recorded = { ...ports, resolution: recording }
    okOf(await gate(recorded, alice, scope, review))
    okOf(await gate(recorded, alice, scope, review, currentBasis))
    expect(received).toStrictEqual([undefined, { basis: currentBasis }])
  })

  it('step-03-adopted-by-basis gives the material that the basis names', async () => {
    const { ports } = createWorld()
    const gated = okOf(await gate(ports, alice, scope, review, earlierBasis))
    expect(gated.ref.digest).toBe(earlierDigest)
    expect(gated.ref.assetVersion).toBe('v1')
  })

  it('step-03-known-unavailable answers the stand-in from the last lawful facts', async () => {
    const { ports } = createWorld()
    expect(failureOf(await gate(ports, alice, scope, retired))).toStrictEqual({
      kind: 'unavailable-stand-in',
      standIn: {
        capability: retired,
        name: 'retired',
        description: 'Was disabled.',
        reason: 'Disabled by the organization.',
      },
    })
  })

  it('step-03-known-unavailable leaves out an absent description', async () => {
    const { ports } = createWorld()
    const terse: SkillResolution<Principal, Scope> = {
      ...ports.resolution,
      resolve: async () => ({
        kind: 'known-unavailable',
        capability: retired,
        name: granted(isSkillName, 'retired'),
        reason: granted(isSafeReason, 'Gone.'),
      }),
    }
    const failure = failureOf(await gate({ ...ports, resolution: terse }, alice, scope, retired))
    expect(failure).toStrictEqual({
      kind: 'unavailable-stand-in',
      standIn: { capability: retired, name: 'retired', reason: 'Gone.' },
    })
  })

  it('step-03-basis-not-lawful answers basis-unavailable', async () => {
    const { ports } = createWorld()
    const unlawful = { ...earlierBasis, layer: 'workspace' as const }
    expect(failureOf(await gate(ports, alice, scope, review, unlawful))).toStrictEqual({
      kind: 'basis-unavailable',
    })
  })

  it('step-03-none answers not-available-to-you', async () => {
    const { ports } = createWorld()
    expect(failureOf(await gate(ports, alice, scope, checkedOnly))).toStrictEqual({
      kind: 'not-available-to-you',
    })
  })

  it('step-03-unknown answers unknown', async () => {
    const { ports } = createWorld()
    const undecided: SkillResolution<Principal, Scope> = {
      ...ports.resolution,
      resolve: async () => ({ kind: 'unknown' }),
    }
    expect(
      failureOf(await gate({ ...ports, resolution: undecided }, alice, scope, review)),
    ).toStrictEqual({ kind: 'unknown' })
  })

  it('step-03-outside-the-set: an answer with a kind outside the set is unknown', async () => {
    const { ports } = createWorld()
    const odd: SkillResolution<Principal, Scope> = {
      ...ports.resolution,
      resolve: async () => ({ kind: 'granted' }) as unknown as Resolution,
    }
    expect(
      failureOf(await gate({ ...ports, resolution: odd }, alice, scope, review)),
    ).toStrictEqual({ kind: 'unknown' })
  })

  it('step-03-no-digest passes a reference without a digest on', async () => {
    const { ports } = createWorld()
    const gated = okOf(await gate(ports, alice, scope, noPackage))
    expect(gated.ref.digest).toBeUndefined()
  })
})

describe('the abort checkpoints around the two port calls', () => {
  it('answers aborted before the read check when the signal is already aborted', async () => {
    const { ports, controls } = createWorld()
    const answer = await gate(ports, alice, scope, review, undefined, AbortSignal.abort())
    expect(answer).toStrictEqual({ failure: { kind: 'aborted' } })
    expect(controls.calls()).toStrictEqual({ check: 0, resolve: 0, snapshot: 0, open: 0 })
  })

  it('answers aborted after the read check when the signal was aborted meanwhile', async () => {
    const { ports, controls } = createWorld()
    const signal = controls.abortAfterCheck()
    expect(await gate(ports, alice, scope, review, undefined, signal)).toStrictEqual({
      failure: { kind: 'aborted' },
    })
    expect(controls.calls()).toStrictEqual({ check: 1, resolve: 0, snapshot: 0, open: 0 })
  })

  it('answers aborted after the resolution when the signal was aborted meanwhile', async () => {
    const { ports } = createWorld()
    const aborter = new AbortController()
    const aborting: SkillResolution<Principal, Scope> = {
      ...ports.resolution,
      resolve: async (who, at, item, options) => {
        const answer = await ports.resolution.resolve(who, at, item, options)
        aborter.abort()
        return answer
      },
    }
    const answer = await gate(
      { ...ports, resolution: aborting },
      alice,
      scope,
      review,
      undefined,
      aborter.signal,
    )
    expect(answer).toStrictEqual({ failure: { kind: 'aborted' } })
  })

  it('does not look at the signal when none is given', async () => {
    const { ports } = createWorld()
    expect(await gate(ports, alice, scope, review)).toHaveProperty('ok')
  })
})
