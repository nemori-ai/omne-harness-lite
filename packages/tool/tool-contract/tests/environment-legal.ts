import { fail, succeed } from '@omne-harness/operation-result'
import type {
  PreparationProgress,
  PreparationRecord,
  ReleaseProgress,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
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

export const oneTenant = (): Fixture => without(memoryToolEnvironmentFixture(), 'otherAccess')

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

export type Deferral = Readonly<{
  first: 'pending' | 'unknown'
  landsAt: 'tick' | 'settle'
  lateSettle?: (then: () => void) => void
}>

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
        masked.delete(key)
        return fresh(answer)
      },
      inspectPreparation: async input =>
        masked.has(preparationKey(input)) ? pending : fresh(await env.inspectPreparation(input)),
    },
  }
}

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
