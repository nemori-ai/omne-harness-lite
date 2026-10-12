import { expect, it } from 'vitest'
import {
  nextStep,
  createAttemptOwner,
  driveStep,
  releaseAttempt,
  type LoopFacts,
  type CurrentInputs,
  type RunnableDecision,
} from '@omne-harness-lite/agent-loop'
import { checkSourceToken } from '@omne-harness-lite/session-log'
import type { AttemptPermit } from '@omne-harness-lite/session-runtime'
const checked = checkSourceToken({
  tenant: { organization: 'org-a', account: 'account-a' },
  session: 'session-a',
  journalGeneration: 'journal-a',
  tail: 2,
})
if ('failure' in checked) throw new Error('fixture source')
const source = checked.ok
const facts: LoopFacts = {
  source,
  run: {
    id: 'run-a',
    attempt: 1,
    terminal: null,
    continuation: {
      kind: 'invokeModel',
      originalPosition: 'call-a',
      preparation: { candidate: 'prepared-a' },
    },
  },
}
const currentInputs: CurrentInputs = {
  source,
  authorized: true,
  assembly: 'a1',
  contextGeneration: 'c1',
  reconciled: true,
}
function decision(): RunnableDecision {
  const value = nextStep({ facts, currentInputs })
  if (!('run' in value)) throw new Error('not runnable')
  return value
}
const permit = Object.freeze({}) as AttemptPermit
it('deterministically selects a fixed continuation without effects', () => {
  expect(nextStep({ facts, currentInputs })).toEqual(nextStep({ facts, currentInputs }))
  expect(decision()).toEqual({
    ...facts.run!.continuation,
    expectedSourceToken: source,
    run: 'run-a',
    attempt: 1,
  })
  expect(nextStep({ facts: { source, run: null }, currentInputs })).toEqual({
    kind: 'idle',
    reason: 'noRunnableAttempt',
    expectedSourceToken: source,
  })
})
it('missing observations and malformed facts are distinct from normal idle', () => {
  expect(nextStep({ facts, currentInputs: { ...currentInputs, contextGeneration: null } })).toEqual(
    { unavailable: true, reason: 'requiredSource' },
  )
  expect(
    nextStep({ facts: { source, run: { ...facts.run!, attempt: null } }, currentInputs }),
  ).toEqual({ invalidInput: true })
  expect(nextStep({ facts, currentInputs: { ...currentInputs, reconciled: false } })).toEqual({
    kind: 'blocked',
    reason: 'reconcile',
    expectedSourceToken: source,
  })
  let reads = 0
  expect(
    nextStep({
      get facts(): LoopFacts {
        reads++
        throw Error('getter')
      },
      currentInputs,
    }),
  ).toEqual({ invalidInput: true })
  expect(reads).toBe(0)
})
it('a missing capability is blocked and current denial never executes an effect', async () => {
  let effects = 0
  const unavailable = createAttemptOwner(permit, {
    authorize: async () => 'authorized',
    handBack: async () => ({ kind: 'handedBack' }),
  })
  expect(await driveStep({ decision: decision(), permit, ports: unavailable.ports })).toEqual({
    kind: 'blocked',
    reason: 'unsupported',
    obligation: 'call-a',
  })
  const denied = createAttemptOwner(permit, {
    authorize: async () => 'denied',
    invokeModel: async () => {
      effects++
      return { kind: 'retryFromFacts' }
    },
    handBack: async () => ({ kind: 'handedBack' }),
  })
  expect(await driveStep({ decision: decision(), permit, ports: denied.ports })).toEqual({
    kind: 'blocked',
    reason: 'denied',
    obligation: 'call-a',
  })
  expect(effects).toBe(0)
  expect(
    await driveStep({
      decision: decision(),
      permit: Object.freeze({}) as AttemptPermit,
      ports: denied.ports,
    }),
  ).toEqual({ invalidInput: true })
})
it('release stops local admission and awaiting, hands back original execution, and is idempotent', async () => {
  const entered = Promise.withResolvers<void>(),
    returned: string[][] = []
  let completed = false
  const assembly = createAttemptOwner(permit, {
    authorize: async () => 'authorized',
    invokeModel: async (_decision, _permit, signal) => {
      entered.resolve()
      await new Promise<void>(resolve => {
        signal.addEventListener('abort', () => resolve(), { once: true })
        if (signal.aborted) resolve()
      })
      completed = true
      return { kind: 'waiting', originalPosition: 'call-a', originalCalls: ['call-a'] }
    },
    handBack: async calls => {
      expect(completed).toBe(true)
      returned.push([...calls])
      return { kind: 'handedBack' }
    },
  })
  const work = driveStep({ decision: decision(), permit, ports: assembly.ports })
  await entered.promise
  expect(await releaseAttempt(assembly.owner)).toEqual({ kind: 'released' })
  expect(await work).toEqual({
    kind: 'waiting',
    originalPosition: 'call-a',
    originalCalls: ['call-a'],
  })
  expect(returned).toEqual([['call-a']])
  expect(await releaseAttempt(assembly.owner)).toEqual({ kind: 'released' })
  expect(await driveStep({ decision: decision(), permit, ports: assembly.ports })).toEqual({
    kind: 'blocked',
    reason: 'released',
    obligation: 'call-a',
  })
})
it('a failed transfer retains its original responsibility for a later release', async () => {
  let transfer = false
  const assembly = createAttemptOwner(permit, {
    authorize: async () => 'authorized',
    invokeModel: async () => {
      throw Error('unknown original execution')
    },
    handBack: async () => ({ kind: transfer ? 'handedBack' : 'pending' }),
  })
  await expect(driveStep({ decision: decision(), permit, ports: assembly.ports })).rejects.toThrow(
    'unknown original execution',
  )
  expect(await releaseAttempt(assembly.owner)).toEqual({
    kind: 'pending',
    originalCalls: ['call-a'],
  })
  transfer = true
  expect(await releaseAttempt(assembly.owner)).toEqual({ kind: 'released' })
})
it('captures capability closures and prevents concurrent drive admission', async () => {
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let original = 0,
    replacement = 0
  const capabilities = {
    authorize: async () => 'authorized' as const,
    invokeModel: async () => {
      original++
      entered.resolve()
      await proceed.promise
      return { kind: 'committed' as const, source }
    },
    handBack: async () => ({ kind: 'handedBack' as const }),
  }
  const assembly = createAttemptOwner(permit, capabilities)
  capabilities.invokeModel = async () => {
    replacement++
    return { kind: 'committed', source }
  }
  const first = driveStep({ decision: decision(), permit, ports: assembly.ports })
  await entered.promise
  expect(await driveStep({ decision: decision(), permit, ports: assembly.ports })).toEqual({
    kind: 'blocked',
    obligation: 'call-a',
    reason: 'unavailable',
  })
  proceed.resolve()
  expect(await first).toEqual({ kind: 'committed', source })
  expect([original, replacement]).toEqual([1, 0])
  expect(await releaseAttempt(assembly.owner)).toEqual({ kind: 'released' })
})
it('rejects result accessors and foreign committed sources without losing the original obligation', async () => {
  for (const received of [
    { kind: 'committed', source: { ...source, journalGeneration: 'foreign' } },
    { kind: 'waiting', originalPosition: 'other-position', originalCalls: ['call-a'] },
  ]) {
    const assembly = createAttemptOwner(permit, {
      authorize: async () => 'authorized',
      invokeModel: async () => received as never,
      handBack: async () => ({ kind: 'pending' }),
    })
    await expect(
      driveStep({ decision: decision(), permit, ports: assembly.ports }),
    ).rejects.toThrow('invalid drive result')
    expect(await releaseAttempt(assembly.owner)).toEqual({
      kind: 'pending',
      originalCalls: ['call-a'],
    })
  }
  let reads = 0
  const assembly = createAttemptOwner(permit, {
    authorize: async () => 'authorized',
    invokeModel: async () =>
      ({
        get kind() {
          reads++
          return 'committed'
        },
        source,
      }) as never,
    handBack: async () => ({ kind: 'pending' }),
  })
  await expect(driveStep({ decision: decision(), permit, ports: assembly.ports })).rejects.toThrow(
    'invalid drive result',
  )
  expect(reads).toBe(0)
  expect(await releaseAttempt(assembly.owner)).toEqual({
    kind: 'pending',
    originalCalls: ['call-a'],
  })
})
it('a malformed hand-back result never proves resource release', async () => {
  let reads = 0,
    valid = false
  const assembly = createAttemptOwner(permit, {
    authorize: async () => 'authorized',
    handBack: async () =>
      valid
        ? { kind: 'handedBack' }
        : ({
            get kind() {
              reads++
              return 'handedBack'
            },
          } as never),
  })
  await expect(releaseAttempt(assembly.owner)).rejects.toThrow('invalid hand-back result')
  expect(reads).toBe(0)
  valid = true
  expect(await releaseAttempt(assembly.owner)).toEqual({ kind: 'released' })
})
