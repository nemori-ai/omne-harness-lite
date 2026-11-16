import { createHash } from 'node:crypto'
import type { DurableEvidence } from '@omne-harness/exchange-refs'

export type { DurableEvidence } from '@omne-harness/exchange-refs'

export type DecisionEvidence = DurableEvidence & Readonly<{ owner: 'authorization' }>

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value !== 'object' || value === null) return value
  const members = new Map(Object.entries(value))
  // The default sort compares strings by UTF-16 code units, which is the canonical member order.
  const names = [...members.keys()].sort()
  return Object.fromEntries(names.map(name => [name, canonicalValue(members.get(name))]))
}

export function canonicalText(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalText(value)).digest('hex')
}

export type EffectiveArguments = Readonly<{ digest: string }>

export function effectiveArgumentsOf(value: unknown): EffectiveArguments {
  return Object.freeze({ digest: digestOf(value) })
}

export function noArguments(): EffectiveArguments {
  return effectiveArgumentsOf(null)
}

export function decisionEvidence(
  record: string,
  revision: string,
  content: unknown,
): DecisionEvidence {
  return Object.freeze({ owner: 'authorization', record, revision, digest: digestOf(content) })
}
