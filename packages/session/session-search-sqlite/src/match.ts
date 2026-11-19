import type { GramPlan } from '@omne-harness/session-search'

/** Nothing narrows: the caller walks the documents instead of asking the index. */
export const ALL = Symbol('all')

export type Vocabulary = Readonly<{
  expand(prefix: string): readonly string[]
  limit: number
}>

/** The marker of a session in its rows: one trigram that no text contains. */
export function sessionMarker(ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= 0x1000000)
    throw new RangeError('more sessions than a marker can number')
  return `\u0004${String.fromCharCode(0xe000 + (ordinal >> 12), 0xe000 + (ordinal & 0xfff))}`
}

const term = (gram: string): string => `"${gram.replaceAll('"', '""')}"`

type Expr = string | typeof ALL | null

function all(parts: readonly Expr[]): Expr {
  if (parts.includes(null)) return null
  const narrowing = parts.filter(part => part !== ALL) as string[]
  if (narrowing.length === 0) return ALL
  return narrowing.length === 1 ? narrowing[0]! : `(${narrowing.join(' AND ')})`
}

function one(parts: readonly Expr[]): Expr {
  if (parts.includes(ALL)) return ALL
  const possible = parts.filter(part => part !== null) as string[]
  if (possible.length === 0) return null
  return possible.length === 1 ? possible[0]! : `(${possible.join(' OR ')})`
}

function exprOf(plan: GramPlan, vocabulary: Vocabulary): Expr {
  switch (plan.kind) {
    case 'any':
      return ALL
    case 'gram':
      return term(plan.gram)
    case 'short': {
      const terms = vocabulary.expand(plan.prefix)
      if (terms.length > vocabulary.limit) return ALL
      return one(terms.map(term))
    }
    case 'and':
      return all(plan.of.map(part => exprOf(part, vocabulary)))
    case 'or':
      return one(plan.of.map(part => exprOf(part, vocabulary)))
  }
}

/** The MATCH expression of a plan within some sessions. Null: nothing can match, unasked. */
export function matchOf(
  plan: GramPlan,
  scope: readonly number[] | null,
  vocabulary: Vocabulary,
): string | typeof ALL | null {
  const within = scope === null ? ALL : one(scope.map(ordinal => term(sessionMarker(ordinal))))
  return all([exprOf(plan, vocabulary), within])
}
