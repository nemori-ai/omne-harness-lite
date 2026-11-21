import type { Answer } from './answer.ts'
import { ask } from './catalog.ts'
import {
  byScope,
  sameInstance,
  standing,
  type Instance,
  type Placed,
  type Registry,
  type Scope,
} from './registry.ts'

export type Reference = Readonly<{ point: string; anyOf: readonly string[]; optional?: boolean }>

export type Binding = Readonly<{
  point: string
  key: string
  id: string
  scope: Scope
  digest: string
  instance: Instance
}>

export type Missing = Readonly<{
  slot: string
  reference: Reference
  answer: 'none' | 'conflict' | 'unavailable'
  detail: string
}>

export type Adoption =
  | Readonly<{ kind: 'adopted'; bindings: Readonly<Record<string, Binding | null>> }>
  | Readonly<{ kind: 'unavailable'; missing: readonly Missing[] }>

export type Bound =
  | Readonly<{ kind: 'present'; entry: Placed; standing: 'serving' | 'retiring' }>
  | Readonly<{ kind: 'absent' }>

/** Only "none" moves on to the next key; a conflict or an unavailable point is the answer. */
export function resolve<I = unknown>(
  registry: Registry,
  reference: Reference,
  asker: Scope,
): Answer<I> {
  for (const key of reference.anyOf) {
    const answer = ask<I>(registry, reference.point, key, asker)
    if (answer.kind !== 'none') return answer
  }
  return { kind: 'none', filtered: [] }
}

function missingOf(slot: string, reference: Reference, answer: Answer): Missing {
  if (answer.kind === 'conflict') {
    const fibers = [...new Set(answer.entries.map(entry => entry.instance.fiber))]
    return { slot, reference, answer: 'conflict', detail: fibers.join(', ') }
  }
  if (answer.kind === 'unavailable')
    return { slot, reference, answer: 'unavailable', detail: `${answer.reason}: ${answer.detail}` }
  return { slot, reference, answer: 'none', detail: '' }
}

/** Every reference of a definition resolves to exactly one entry, or the whole adoption is unavailable. */
export function adopt(
  registry: Registry,
  requires: Readonly<Record<string, Reference>>,
  asker: Scope,
): Adoption {
  const bindings: Record<string, Binding | null> = {}
  const missing: Missing[] = []
  for (const slot of Object.keys(requires).sort()) {
    const reference = requires[slot] as Reference
    const answer = resolve(registry, reference, asker)
    if (answer.kind === 'one') {
      const { point, key, id, scope, digest, instance } = answer.entry
      bindings[slot] = { point, key, id, scope, digest, instance }
    } else if (answer.kind === 'none' && reference.optional === true) bindings[slot] = null
    else missing.push(missingOf(slot, reference, answer))
  }
  return missing.length > 0 ? { kind: 'unavailable', missing } : { kind: 'adopted', bindings }
}

export function bound(registry: Registry, binding: Binding): Bound {
  const entry = registry.placed.find(
    placed =>
      placed.point === binding.point &&
      placed.key === binding.key &&
      placed.id === binding.id &&
      placed.digest === binding.digest &&
      byScope(placed.scope, binding.scope) === 0 &&
      sameInstance(placed.instance, binding.instance),
  )
  if (entry === undefined) return { kind: 'absent' }
  const held = standing(registry, entry.instance) === 'retiring' ? 'retiring' : 'serving'
  return { kind: 'present', entry, standing: held }
}

export function refersTo(adoption: Adoption, instance: Instance): readonly string[] {
  if (adoption.kind !== 'adopted') return []
  return Object.entries(adoption.bindings)
    .filter(([, binding]) => binding !== null && sameInstance(binding.instance, instance))
    .map(([slot]) => slot)
}
