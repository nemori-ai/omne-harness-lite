// The providers of the start authority suite that the contract allows, and the builders that the
// violating variants of the spec share with them. Each is built at the port boundary: it wraps
// the methods of the authority of a double and the handles that it defines itself, and it never
// calls a control of a double to make the double behave.
import { fail, succeed } from '@omne-harness/operation-result'
import type { StartPermit, StartProgress, ToolStartAuthority } from '@omne-harness/tool-contract'
import {
  createMemoryToolStartAuthority,
  memoryToolStartAuthorityFixture,
  startAuthorityAnswers,
  type ToolStartAuthorityFixture,
} from '@omne-harness/tool-contract/testing'
import { turns } from './conformance-harness.ts'
import { createMask, maskedPort, progressOf } from './generated-provider.ts'
import { evidence } from './tool-values.ts'

export type Fixture = ToolStartAuthorityFixture<string>

/** A fixture whose authority is the double with `build(real)` laid over it. */
export function variant(
  build: (real: ToolStartAuthority<string>) => Partial<ToolStartAuthority<string>>,
): () => Fixture {
  return () => {
    const real = createMemoryToolStartAuthority<string>()
    const base = memoryToolStartAuthorityFixture()
    return { ...base, authority: { ...real, ...build(real) } }
  }
}

/**
 * A provider that has no guard resource: it issues a permit with no guard and takes the permit
 * back as the one it issued. `build` lays a violation over it.
 */
export function guardless(
  build: (real: ToolStartAuthority<string>) => Partial<ToolStartAuthority<string>> = () => ({}),
): () => Fixture {
  return variant(real => {
    const issued = new Map<string, StartPermit>()
    const bare: ToolStartAuthority<string> = {
      ...real,
      prepare: async input => {
        const answer = await real.prepare(input)
        if ('failure' in answer) return answer
        issued.set(input.start.operation, answer.ok)
        return succeed({ ...answer.ok, guards: [] })
      },
      consume: input =>
        real.consume({
          ...input,
          permit: issued.get(input.permit.start.operation) ?? input.permit,
        }),
    }
    return { ...bare, ...build(bare) }
  })
}

export const without = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const { [key]: _removed, ...rest } = value
  return rest
}

export const startKey = (input: {
  tenant: unknown
  call: string
  start?: { operation: string }
  permit?: { start: { operation: string } }
}): string =>
  JSON.stringify(['s', input.tenant, input.call, (input.start ?? input.permit?.start)?.operation])

/**
 * The generated provider of the table: the first answer of `consume` and of `inspect`, for a new
 * start, is `unknown`, and every read says so until `settle` resolves (`lagTurns` after, for a
 * fixture that breaks the completion contract).
 */
export function generated(
  kind: string,
  options: Readonly<{ settle?: boolean; lagTurns?: number }> = {},
): () => Fixture {
  return () => {
    const base = memoryToolStartAuthorityFixture()
    const mask = createMask()
    const authority = maskedPort(
      base.authority,
      startAuthorityAnswers,
      {
        consume: {
          key: startKey,
          creates: true,
          answer: kindOf => progressOf(kindOf, 'the authority cannot tell yet'),
        },
        inspect: {
          key: startKey,
          creates: true,
          answer: kindOf => progressOf(kindOf, 'the authority cannot tell yet'),
        },
      },
      mask,
      kind,
    )
    const settle = async (): Promise<void> => {
      if (options.lagTurns === undefined) mask.lift()
      else turns(options.lagTurns, () => mask.lift())
      await Promise.resolve()
    }
    return options.settle === false
      ? { ...without(base, 'settle'), authority }
      : { ...base, authority, settle }
  }
}

/** A permit with no guard; the authority takes back the permit it issued. */
export const guardlessAuthority = (): Fixture => guardless()()

/** A permit with no guard, and one tenant only. */
export const guardlessOneTenant = (): Fixture => without(guardless()(), 'otherAccess')

/** The double with one tenant only: the cross-tenant cases have no second access. */
export const oneTenant = (): Fixture => without(memoryToolStartAuthorityFixture(), 'otherAccess')

/**
 * A provider that refuses a stale consume as `not-started` instead of `rejected` (P04 lets it: the
 * start may be asked again). `inspect` then says the same, or rejects the start for good with
 * evidence of its own, or, in the violating variant, says `started`.
 */
export function refusesAsNotStarted(
  inspectSays: 'not-started' | 'rejected' | 'started',
): () => Fixture {
  return variant(real => ({
    consume: async input => {
      const answer = await real.consume(input)
      return 'ok' in answer && answer.ok.kind === 'rejected'
        ? succeed<StartProgress>({ kind: 'not-started', exclusion: answer.ok.exclusion })
        : answer
    },
    inspect: async input => {
      const answer = await real.inspect(input)
      if ('failure' in answer || answer.ok.kind !== 'rejected') return answer
      if (inspectSays === 'rejected')
        return succeed<StartProgress>({ ...answer.ok, exclusion: evidence('inspected-rejection') })
      return succeed<StartProgress>(
        inspectSays === 'started'
          ? { kind: 'started', acceptance: evidence('assumed') }
          : { kind: 'not-started', exclusion: answer.ok.exclusion },
      )
    },
  }))
}

/**
 * A provider that refuses outright where P04 lets it: a consume of a permit that it withdrew or
 * excluded fails instead of answering `not-started`, and it issues no permit for a call that it
 * excluded or for a tenant other than the one it serves. A second permit of a start that it
 * accepted is not issued (`secondPermit: 'not-issued'`), or is issued and its consume refused
 * (`'not-consumed'`).
 */
export function refusesOutright(secondPermit: 'not-issued' | 'not-consumed'): () => Fixture {
  return () => refusingAuthority(secondPermit)
}

function refusingAuthority(secondPermit: 'not-issued' | 'not-consumed'): Fixture {
  const base = memoryToolStartAuthorityFixture()
  const real = base.authority
  const tenant = JSON.stringify(base.access.tenant)
  /** The permit that each accepted call was started with, by the record of its request. */
  const accepted = new Map<string, string>()
  const excluded = new Set<string>()
  const callOf = (input: { tenant: unknown; call: string }) =>
    JSON.stringify([input.tenant, input.call])
  const authority: ToolStartAuthority<string> = {
    ...real,
    prepare: async input => {
      const call = callOf(input)
      const again = secondPermit === 'not-issued' && accepted.has(call)
      if (JSON.stringify(input.tenant) !== tenant || again || excluded.has(call))
        return fail({ kind: 'denied', action: 'prepare' })
      return real.prepare(input)
    },
    consume: async input => {
      const started = accepted.get(callOf(input))
      if (
        secondPermit === 'not-consumed' &&
        (started ?? input.permit.request.record) !== input.permit.request.record
      )
        return fail({ kind: 'denied', action: 'consume' })
      const answer = await real.consume(input)
      if ('failure' in answer) return answer
      if (answer.ok.kind === 'started') accepted.set(callOf(input), input.permit.request.record)
      return answer.ok.kind === 'not-started'
        ? fail({ kind: 'invalid', field: 'permit', reason: 'the permit was withdrawn' })
        : answer
    },
    exclude: async input => {
      const answer = await real.exclude(input)
      if ('ok' in answer) excluded.add(callOf(input))
      return answer
    },
  }
  return { ...base, authority }
}
