// A profile maintenance as an author writes it against the contract. It checks a definition before
// it keeps it, and it gives the update time itself from a clock that it is given: the change has no
// field for a time, and a time that goes back is refused. An operation that succeeded is answered
// again with its original result when the same change comes with it, and with a conflict when
// another change does. The store is a map, because this file shows the rules and not a storage. A
// production maintainer keeps profiles durably and compares times as instants; `Date.parse` is
// enough for the whole seconds and milliseconds written here.
import { fail, succeed } from '@omne-harness/operation-result'
import {
  compareRevisions,
  decodeRevision,
  type ModelOperationId,
  type ModelProfile,
  type ModelProfileDefinition,
  type ModelProfileMaintenance,
  type ModelFailure,
  type ProfileChange,
  type ProfileIdentity,
  type Revision,
  type TokenLimit,
} from '@omne-harness/model-contract'
import type { ScriptedPrincipal } from '@omne-harness/model-contract/testing'
import { adoption } from './values.ts'

const POSITIVE_INTEGER = /^[1-9][0-9]*$/u
const PERCENT = /^(?:[1-9][0-9]?|100)$/u

/** Whether a provided limit is above a finite upstream value that a supplier is known to have. */
function exceedsKnownUpstream(limit: TokenLimit): boolean {
  return limit.upstream.some(
    entry => entry.limit.kind === 'finite' && BigInt(limit.provided) > BigInt(entry.limit.amount),
  )
}

/** The fields of a definition that break the rules of the contract, in the order the rules list them. */
export function invalidFields(definition: ModelProfileDefinition): string[] {
  const fields: string[] = []
  const { context } = definition
  const limits: readonly (readonly [string, TokenLimit])[] = [
    ['context.window', context.window],
    ...(context.input === null ? [] : ([['context.input', context.input]] as const)),
    ['context.output', context.output],
  ]
  for (const [name, limit] of limits) {
    if (!POSITIVE_INTEGER.test(limit.provided)) fields.push(`${name}.provided`)
  }
  const validWindow = POSITIVE_INTEGER.test(context.window.provided)
  for (const [name, limit] of limits) {
    if (name === 'context.window' || !validWindow || !POSITIVE_INTEGER.test(limit.provided))
      continue
    if (BigInt(limit.provided) > BigInt(context.window.provided)) fields.push(`${name}.provided`)
  }
  for (const [name, limit] of limits) {
    if (POSITIVE_INTEGER.test(limit.provided) && exceedsKnownUpstream(limit))
      fields.push(`${name}.upstream`)
  }
  if (!PERCENT.test(context.compactionTriggerPercent))
    fields.push('context.compactionTriggerPercent')
  const defaultOutput = definition.parameters.find(item => item.kind === 'max-output-tokens')
  if (
    defaultOutput !== undefined &&
    POSITIVE_INTEGER.test(context.output.provided) &&
    POSITIVE_INTEGER.test(defaultOutput.value) &&
    BigInt(defaultOutput.value) > BigInt(context.output.provided)
  )
    fields.push('parameters.max-output-tokens')
  if (!definition.input.includes('text')) fields.push('input')
  if (
    definition.input.includes('image') &&
    !definition.limits.some(item => item.metric === 'image-bytes')
  )
    fields.push('limits.image-bytes')
  // The metrics of this author count bytes, images or milliseconds, so a provided limit is a whole
  // number; each metric is declared once, and none is above what its supplier is known to allow.
  const declared = new Set<string>()
  for (const item of definition.limits) {
    const name = `limits.${item.metric}`
    if (declared.has(item.metric)) fields.push(name)
    declared.add(item.metric)
    if (!POSITIVE_INTEGER.test(item.provided)) fields.push(`${name}.provided`)
    else if (exceedsKnownUpstream(item)) fields.push(`${name}.upstream`)
  }
  return fields
}

/** The text of a change with its keys in one order, so that the same change written twice compares equal. */
function canonical(change: ProfileChange): string {
  return JSON.stringify(change, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : value,
  )
}

export type AuthorProfileMaintenance = ModelProfileMaintenance<ScriptedPrincipal> &
  Readonly<{ current(identity: ProfileIdentity): ModelProfile | undefined }>

const keyOf = (identity: ProfileIdentity): string => JSON.stringify(identity)

function nextRevision(previous: Revision | null): Revision {
  const next = previous === null ? '1' : String(BigInt(previous) + 1n)
  const decoded = decodeRevision(next)
  if (!('ok' in decoded)) throw new Error('the next revision is not a revision')
  return decoded.ok
}

export function createProfileMaintenance(now: () => string): AuthorProfileMaintenance {
  const profiles = new Map<string, ModelProfile>()
  /** Each operation that succeeded, with the change it carried, to answer the same operation again. */
  const committed = new Map<ModelOperationId, Readonly<{ change: string; profile: ModelProfile }>>()

  function stored(identity: ProfileIdentity): ModelProfile | undefined {
    return profiles.get(keyOf(identity))
  }

  function build(
    previous: ModelProfile | undefined,
    identity: ProfileIdentity,
    definition: ModelProfileDefinition,
    availability: ModelProfile['availability'],
    updatedAt: string,
  ): ModelProfile {
    const revision = nextRevision(previous?.revision ?? null)
    return {
      identity,
      adoption: adoption(`${identity.route}-${revision}`),
      revision,
      updatedAt,
      availability,
      definition,
    }
  }

  return {
    current: stored,
    async change(input) {
      const { change, operation } = input
      // The same operation again: the same change is answered with the result it had, and nothing
      // is read or written; another change under it is a conflict with the revision it committed.
      const earlier = committed.get(operation)
      if (earlier !== undefined) {
        if (earlier.change === canonical(change)) return succeed(earlier.profile)
        return fail({ kind: 'conflict', operation, revision: earlier.profile.revision })
      }
      const previous = stored(change.identity)
      const refusal = refuse(change, previous, operation)
      if (refusal !== null) return fail(refusal)
      const updatedAt = now()
      const clockRefusal = refuseClock(updatedAt, previous)
      if (clockRefusal !== null) return fail(clockRefusal)
      const definition =
        change.kind === 'create' || change.kind === 'revise'
          ? change.definition
          : previous?.definition
      if (definition === undefined)
        return fail({ kind: 'invalid', field: 'identity', reason: 'no such profile' })
      const availability = change.kind === 'withdraw' ? 'withdrawn' : 'active'
      const next = build(previous, change.identity, definition, availability, updatedAt)
      profiles.set(keyOf(change.identity), next)
      committed.set(operation, { change: canonical(change), profile: next })
      return succeed(next)
    },
    async inspect(input) {
      const found = committed.get(input.operation)
      return succeed(
        found === undefined
          ? { kind: 'not-committed' }
          : { kind: 'committed', value: found.profile },
      )
    },
  }
}

/**
 * The failure for a clock reading that is not a time, or that is before the last change. A reading
 * that cannot be parsed compares as neither earlier nor later, so it is refused before comparing.
 */
function refuseClock(updatedAt: string, previous: ModelProfile | undefined): ModelFailure | null {
  const reading = Date.parse(updatedAt)
  if (Number.isNaN(reading))
    return {
      kind: 'unavailable',
      dependency: 'clock',
      diagnostic: `the clock reads "${updatedAt}", which is not a time`,
    }
  if (previous === undefined) return null
  const last = Date.parse(previous.updatedAt)
  if (Number.isNaN(last))
    return {
      kind: 'unavailable',
      dependency: 'clock',
      diagnostic: `the last change at "${previous.updatedAt}" is not a time`,
    }
  if (reading < last)
    return {
      kind: 'unavailable',
      dependency: 'clock',
      diagnostic: `the clock reads ${updatedAt}, before the last change at ${previous.updatedAt}`,
    }
  return null
}

/** The failure that stops a change before the clock is read, or null when the change may go on. */
function refuse(
  change: ProfileChange,
  previous: ModelProfile | undefined,
  operation: ModelOperationId,
): ModelFailure | null {
  if (change.kind === 'create') {
    if (previous !== undefined) return { kind: 'conflict', operation, revision: previous.revision }
  } else {
    if (previous === undefined)
      return { kind: 'invalid', field: 'identity', reason: 'no such profile' }
    if (compareRevisions(change.expected, previous.revision) !== 0)
      return { kind: 'conflict', operation, revision: previous.revision }
  }
  if (change.kind === 'create' || change.kind === 'revise') {
    const fields = invalidFields(change.definition)
    if (fields.length > 0)
      return {
        kind: 'invalid',
        field: fields.join(', '),
        reason: 'the definition breaks the rules of the contract',
      }
  }
  return null
}
