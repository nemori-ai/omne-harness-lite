import { isTextGram } from './extract.ts'
import { foldText } from './fold.ts'

/** A boolean formula over trigrams of folded text. `any`: the index has nothing to narrow with. */
export type GramPlan =
  | Readonly<{ kind: 'any' }>
  | Readonly<{ kind: 'gram'; gram: string }>
  | Readonly<{ kind: 'short'; prefix: string }>
  | Readonly<{ kind: 'and'; of: readonly GramPlan[] }>
  | Readonly<{ kind: 'or'; of: readonly GramPlan[] }>

export const ANY: GramPlan = Object.freeze({ kind: 'any' })

export type PlanLimits = Readonly<{
  maxGramsPerLiteral: number
  maxAlternatives: number
}>

/** Every text that contains the literal satisfies the plan: a superset, never a subset. */
export function planLiteral(literal: string, limits: PlanLimits): GramPlan {
  const points = Array.from(foldText(literal))
  if (points.length < 2) return ANY
  if (points.length === 2) {
    const prefix = points.join('')
    return isTextGram(prefix) ? { kind: 'short', prefix } : ANY
  }
  const grams = new Set<string>()
  for (let at = 0; at + 3 <= points.length; at += 1) {
    const gram = points.slice(at, at + 3).join('')
    if (isTextGram(gram)) grams.add(gram)
  }
  // Spread what is kept over the literal: its ends are as selective as its start.
  const all = [...grams]
  const step = Math.max(1, all.length / limits.maxGramsPerLiteral)
  const kept = new Set<string>()
  for (let at = 0; at < all.length && kept.size < limits.maxGramsPerLiteral; at += step)
    kept.add(all[Math.floor(at)]!)
  return and([...kept].map(gram => ({ kind: 'gram', gram })))
}

export function and(of: readonly GramPlan[]): GramPlan {
  const flat = of.flatMap(plan => (plan.kind === 'and' ? plan.of : [plan]))
  const narrowing = flat.filter(plan => plan.kind !== 'any')
  if (narrowing.length === 0) return ANY
  return narrowing.length === 1 ? narrowing[0]! : { kind: 'and', of: unique(narrowing) }
}

export function or(of: readonly GramPlan[], limits: PlanLimits): GramPlan {
  const flat = of.flatMap(plan => (plan.kind === 'or' ? plan.of : [plan]))
  if (flat.length === 0 || flat.some(plan => plan.kind === 'any')) return ANY
  const distinct = unique(flat)
  if (distinct.length > limits.maxAlternatives) return ANY
  return distinct.length === 1 ? distinct[0]! : { kind: 'or', of: distinct }
}

function unique(plans: readonly GramPlan[]): readonly GramPlan[] {
  const seen = new Map<string, GramPlan>()
  for (const plan of plans) seen.set(JSON.stringify(plan), plan)
  return [...seen.values()]
}

/** True when an indexed text satisfies the plan: the reference the index is checked against. */
export function planAdmits(plan: GramPlan, text: string): boolean {
  switch (plan.kind) {
    case 'any':
      return true
    case 'gram':
      return text.includes(plan.gram)
    case 'short':
      return text.includes(plan.prefix)
    case 'and':
      return plan.of.every(part => planAdmits(part, text))
    case 'or':
      return plan.of.some(part => planAdmits(part, text))
  }
}
