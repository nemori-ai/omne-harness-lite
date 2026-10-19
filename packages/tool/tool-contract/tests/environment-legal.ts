// The providers of the environment suite that the contract allows, and the fixtures that
// break the completion contract of `settle`. Each is built at the port boundary: it wraps the
// methods of the port of the double and the handles that it defines itself, and it never calls a
// control of the double to make the double behave (`hold`, `excludeDeferred`). The handles of the
// double that it leaves as they are (`allocations`, `rejectNext`, `otherAccess`) do not shape the
// answers of the provider.
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  PreparationProgress,
  PreparationRecord,
  ReleaseProgress,
  ToolEnvironment,
} from '@omne-harness/tool-contract'
import {
  environmentAnswers,
  memoryToolEnvironmentFixture,
  type MemoryEnvironment,
  type ToolEnvironmentFixture,
} from '@omne-harness/tool-contract/testing'
import { keep } from './conformance-harness.ts'
import { createMask, maskedPort, progressOf } from './generated-provider.ts'
import { evidence } from './tool-values.ts'

export type Fixture = ToolEnvironmentFixture<string, MemoryEnvironment>
type Environment = ToolEnvironment<string, MemoryEnvironment>

export const preparationKey = (input: {
  tenant: unknown
  preparation: { call: string; operation: string }
}): string =>
  JSON.stringify(['p', input.tenant, input.preparation.call, input.preparation.operation])
export const releaseKey = (input: {
  tenant: unknown
  release: { call: string; operation: string }
}): string => JSON.stringify(['r', input.tenant, input.release.call, input.release.operation])

export const without = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const { [key]: _removed, ...rest } = value
  return rest
}

/** The double with one tenant only: the cross-tenant cases have no second access. */
export const oneTenant = (): Fixture => without(memoryToolEnvironmentFixture(), 'otherAccess')

/**
 * The generated provider of the table: the first answer of every method, for a new operation,
 * is progress of `kind` (a rejection and an exclusion too), and every read says so until `settle`
 * resolves. The effect of the operation has happened at once; only its answer is masked, and the
 * mask is lifted inside `settle`, which is after the work landed.
 */
export function generated(
  kind: string,
  options: Readonly<{ settle?: boolean }> = {},
): () => Fixture {
  return () => {
    const base = memoryToolEnvironmentFixture()
    const mask = createMask()
    const environment = maskedPort(
      base.environment,
      environmentAnswers,
      {
        prepare: {
          key: preparationKey,
          creates: true,
          answer: kindOf => progressOf(kindOf, 'preparing'),
        },
        inspectPreparation: {
          key: preparationKey,
          creates: false,
          answer: kindOf => progressOf(kindOf, 'preparing'),
        },
        release: {
          key: releaseKey,
          creates: true,
          answer: kindOf => progressOf(kindOf, 'releasing'),
        },
        inspectRelease: {
          key: releaseKey,
          creates: false,
          answer: kindOf => progressOf(kindOf, 'releasing'),
        },
      },
      mask,
      kind,
    )
    const settle = async (): Promise<void> => {
      await base.settle?.()
      mask.lift()
    }
    return options.settle === false
      ? { ...without(base, 'settle'), environment }
      : { ...base, environment, settle }
  }
}

/**
 * Every new preparation answers `pending` first, a rejection included. The mask is lifted on the
 * next tick and `settle` is not involved, or, for a fixture that keeps the completion contract, by
 * `settle`.
 */
export function pendingFirstIncludingRejection(liftBy: 'tick' | 'settle'): () => Fixture {
  return () => {
    const base = memoryToolEnvironmentFixture()
    const env = base.environment
    const masked = new Set<string>()
    const answerPending = succeed<PreparationProgress<MemoryEnvironment>>({
      kind: 'pending',
      diagnostic: 'preparing',
    })
    return {
      ...base,
      ...(liftBy === 'settle'
        ? {
            settle: async () => {
              await base.settle?.()
              masked.clear()
            },
          }
        : {}),
      environment: {
        ...env,
        prepare: async input => {
          const key = preparationKey(input)
          const seen = await env.inspectPreparation(input)
          const isNew = 'ok' in seen && seen.ok.kind === 'unknown'
          const answer = await env.prepare(input)
          if (
            isNew &&
            'ok' in answer &&
            (answer.ok.kind === 'prepared' || answer.ok.kind === 'rejected')
          ) {
            masked.add(key)
            if (liftBy === 'tick') setTimeout(() => masked.delete(key), 0)
            return answerPending
          }
          return masked.has(key) ? answerPending : answer
        },
        inspectPreparation: async input =>
          masked.has(preparationKey(input)) ? answerPending : env.inspectPreparation(input),
      },
    }
  }
}

/**
 * A release answers pending and is carried out on the next tick. The queue is keyed by tenant, call
 * and operation, and the input is checked as P01 wants.
 */
export function asynchronousRelease(): Fixture {
  const base = memoryToolEnvironmentFixture()
  const env = base.environment
  const queued = new Map<string, string>()
  const landing: Promise<void>[] = []
  return {
    ...base,
    settle: async () => {
      await Promise.all(landing)
      await base.settle?.()
    },
    environment: {
      ...env,
      release: async input => {
        const key = releaseKey(input)
        // The input is checked as P01 wants: the same identity with another input goes to the double.
        if (queued.has(key) && queued.get(key) !== input.release.inputDigest)
          return env.release(input)
        if (!queued.has(key)) {
          queued.set(key, input.release.inputDigest)
          const landed = new Promise<void>(resolve => setTimeout(resolve, 0))
            .then(() => env.release(input))
            .then(() => undefined)
          keep(landed)
          landing.push(landed)
          return succeed<ReleaseProgress>({ kind: 'pending', diagnostic: 'release task queued' })
        }
        return env.inspectRelease(input)
      },
    },
  }
}

type PrepareInput = Parameters<Environment['prepare']>[0]

/** What a deferred preparation does. */
export type Deferral = Readonly<{
  /** The progress that the provider answers while the allocation has not landed. */
  first: 'pending' | 'unknown'
  /** When the allocation lands: on the next tick of the event loop, or when `settle` starts it. */
  landsAt: 'tick' | 'settle'
  /**
   * A fixture that breaks the completion contract: `settle` starts the landing through this
   * delay and resolves at once, so it resolves before the allocation landed.
   */
  lateSettle?: (then: () => void) => void
}>

/**
 * A provider whose allocation really is deferred: it answers progress for every new preparation,
 * and asks the double for the allocation only when it lands. It defines its own `hold` (every
 * preparation is deferred already, so holding the next one changes nothing) and its own
 * `excludeDeferred` (an excluded preparation never reaches the double and is answered `excluded`).
 * The double is touched through its port only.
 */
export function deferredPreparation(options: Deferral): () => Fixture {
  return () => {
    const base = memoryToolEnvironmentFixture()
    const env = base.environment
    type Entry = {
      readonly input: PrepareInput
      readonly digest: string
      excluded: boolean
      landed: boolean
      landing: Promise<void> | null
    }
    const entries = new Map<string, Entry>()
    const digestOf = (input: PrepareInput): string =>
      JSON.stringify([
        input.preparation.adoption,
        input.preparation.inputDigest,
        input.preparation.purpose,
      ])
    const progress = (): Awaited<ReturnType<Environment['prepare']>> =>
      succeed<PreparationProgress<MemoryEnvironment>>({
        kind: options.first,
        diagnostic: 'the allocation is under way',
      })
    const excluded = (key: string): Awaited<ReturnType<Environment['prepare']>> =>
      succeed<PreparationProgress<MemoryEnvironment>>({
        kind: 'excluded',
        exclusion: evidence(`exclusion/${key}`),
      })
    /** Lands the allocation once: the double is asked for it, and the entry is visible after. */
    const land = (entry: Entry): Promise<void> => {
      entry.landing ??= (
        entry.excluded ? Promise.resolve() : env.prepare(entry.input).then(() => undefined)
      ).then(() => {
        entry.landed = true
      })
      return entry.landing
    }
    const environment: Environment = {
      ...env,
      prepare: async input => {
        const key = preparationKey(input)
        const known = entries.get(key)
        if (known === undefined) {
          const entry: Entry = {
            input,
            digest: digestOf(input),
            excluded: false,
            landed: false,
            landing: null,
          }
          entries.set(key, entry)
          if (options.landsAt === 'tick')
            keep(new Promise<void>(resolve => setTimeout(resolve, 0)).then(() => land(entry)))
          return progress()
        }
        if (known.excluded) return excluded(key)
        if (known.landed) return env.prepare(input)
        if (known.digest !== digestOf(input))
          return fail({ kind: 'conflict', operation: input.preparation.operation })
        return progress()
      },
      inspectPreparation: async input => {
        const key = preparationKey(input)
        const known = entries.get(key)
        if (known?.excluded === true) return excluded(key)
        if (known !== undefined && !known.landed) return progress()
        return env.inspectPreparation(input)
      },
    }
    const settle = async (): Promise<void> => {
      const all = [...entries.values()]
      if (options.landsAt === 'tick' || options.lateSettle === undefined) {
        await Promise.all(all.map(land))
        return
      }
      for (const entry of all) options.lateSettle(() => keep(land(entry)))
    }
    const excludeDeferred = (preparation: PreparationRecord): Promise<void> => {
      const entry = entries.get(preparationKey({ tenant: base.access.tenant, preparation }))
      if (entry !== undefined && entry.landing === null) entry.excluded = true
      return Promise.resolve()
    }
    return { ...base, hold: () => undefined, settle, excludeDeferred, environment }
  }
}

/**
 * A provider that hands out a fresh reconnect capability with every answer of a preparation (P03:
 * `prepared` returns a capability to reconnect to the original resource); the evidence and the
 * preparation stay the ones of the original allocation.
 */
export function freshReconnect(): Fixture {
  const base = memoryToolEnvironmentFixture()
  const env = base.environment
  let handedOut = 0
  const fresh = (
    answer: Awaited<ReturnType<Environment['prepare']>>,
  ): Awaited<ReturnType<Environment['prepare']>> => {
    if ('failure' in answer || answer.ok.kind !== 'prepared') return answer
    handedOut += 1
    const { environment } = answer.ok
    return succeed<PreparationProgress<MemoryEnvironment>>({
      kind: 'prepared',
      environment: { ...environment, value: { resource: `reconnect-${handedOut}` } },
    })
  }
  return {
    ...base,
    environment: {
      ...env,
      prepare: async input => fresh(await env.prepare(input)),
      inspectPreparation: async input => fresh(await env.inspectPreparation(input)),
    },
  }
}

/**
 * The two legal shapes above at once: the first answer of every new preparation is `pending`
 * (the allocation has happened, only its answer is held back), the resend finds it landed and
 * answers `prepared`, and every `prepared` answer hands out a fresh reconnect capability. A read
 * of a preparation that is still held back answers `pending` too. The provider needs no handle
 * to land: the resend lifts the mask.
 */
export function pendingFirstWithFreshReconnect(): Fixture {
  const base = memoryToolEnvironmentFixture()
  const env = base.environment
  const asked = new Set<string>()
  const masked = new Set<string>()
  let handedOut = 0
  const pending = succeed<PreparationProgress<MemoryEnvironment>>({
    kind: 'pending',
    diagnostic: 'preparing',
  })
  const fresh = (
    answer: Awaited<ReturnType<Environment['prepare']>>,
  ): Awaited<ReturnType<Environment['prepare']>> => {
    if ('failure' in answer || answer.ok.kind !== 'prepared') return answer
    handedOut += 1
    return succeed<PreparationProgress<MemoryEnvironment>>({
      kind: 'prepared',
      environment: { ...answer.ok.environment, value: { resource: `reconnect-${handedOut}` } },
    })
  }
  return {
    ...base,
    environment: {
      ...env,
      prepare: async input => {
        const key = preparationKey(input)
        const answer = await env.prepare(input)
        if (!asked.has(key) && 'ok' in answer && answer.ok.kind === 'prepared') {
          asked.add(key)
          masked.add(key)
          return pending
        }
        // The resend finds the allocation landed: the mask is lifted.
        masked.delete(key)
        return fresh(answer)
      },
      inspectPreparation: async input =>
        masked.has(preparationKey(input)) ? pending : fresh(await env.inspectPreparation(input)),
    },
  }
}

/**
 * A provider that refuses a read of a preparation or a release that was never asked for, instead
 * of answering `unknown`, and rejects the preparation of a tenant that it does not serve.
 */
export function refusesUnseenReads(): Fixture {
  const base = memoryToolEnvironmentFixture()
  const env = base.environment
  const served = JSON.stringify(base.access.tenant)
  const refused = (field: string) =>
    fail({ kind: 'invalid' as const, field, reason: 'nothing of this operation was asked for' })
  return {
    ...base,
    environment: {
      ...env,
      prepare: async input =>
        JSON.stringify(input.tenant) === served
          ? env.prepare(input)
          : succeed<PreparationProgress<MemoryEnvironment>>({
              kind: 'rejected',
              reason: 'no environment is kept for this tenant',
              evidence: evidence('foreign-rejection'),
            }),
      inspectPreparation: async input => {
        const answer = await env.inspectPreparation(input)
        return 'ok' in answer && answer.ok.kind === 'unknown' ? refused('preparation') : answer
      },
      inspectRelease: async input => {
        const answer = await env.inspectRelease(input)
        return 'ok' in answer && answer.ok.kind === 'unknown' ? refused('release') : answer
      },
    },
  }
}
