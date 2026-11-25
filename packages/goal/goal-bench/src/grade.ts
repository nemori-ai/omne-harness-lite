import { probabilityOf, UNATTAINABLE } from '@omne-harness/goal-contract'
import { DEAD_END, succeeded } from './mutate.ts'
import type { Outcome } from './replay.ts'
import { sidesWithChange, type EntryKind, type Graded, type Pair } from './score.ts'

const kindOf = (id: string): EntryKind =>
  id.startsWith('A')
    ? 'criterion'
    : id.startsWith('N')
      ? 'rule'
      : id === DEAD_END
        ? 'dead-end'
        : 'exit'

/** What the findings say of one entry, in the words its truth is written in. */
function saidOf(outcome: Outcome, id: string): string {
  const { findings } = outcome
  switch (kindOf(id)) {
    case 'criterion':
      return findings.criteria[id as keyof typeof findings.criteria] ?? 'cannot-tell'
    case 'rule':
      return findings.rules[id as keyof typeof findings.rules] ?? 'unclear'
    case 'exit':
      return findings.exits.some(exit => exit === id) ? 'yes' : 'no'
    case 'dead-end':
      return findings.unattainable ? 'yes' : 'no'
  }
}

/** The probability the first vote gave `holds` for a criterion, when it chose `holds`. */
function probabilityIn(outcome: Outcome, id: string): number | null {
  for (const reply of outcome.replies[0] ?? []) {
    const answer = reply?.answers[id]
    if (answer !== undefined) return answer.choice === 'holds' ? probabilityOf(answer) : null
  }
  return null
}

export function graded(outcome: Outcome): readonly Graded[] {
  const { expected, material } = outcome.case
  return Object.entries(expected.entries).map(([id, entry]) => {
    const asked = outcome.asked.includes(id === DEAD_END ? UNATTAINABLE.blocked : id)
    const exit = material.body.exits.find(candidate => candidate.id === id)
    return {
      case: outcome.case.id,
      family: outcome.case.family,
      id,
      kind: kindOf(id),
      truth: entry.truth,
      safe: entry.safe,
      said: saidOf(outcome, id),
      asked,
      probability: probabilityIn(outcome, id),
      endsInSuccess: exit?.counts === 'success',
    }
  })
}

/** Each child with its parent: how the entry the mutation changed was read in both. */
export function pairs(outcomes: readonly Outcome[]): readonly Pair[] {
  const clean = new Map(
    outcomes
      .filter(outcome => outcome.case.family === 'clean')
      .map(outcome => [outcome.case.parent, outcome]),
  )
  return outcomes.flatMap((outcome): Pair[] => {
    const { target } = outcome.case.expected
    const parent = clean.get(outcome.case.parent)
    if (target === null || parent === undefined || outcome.case.family === 'clean') return []
    const kind = kindOf(target)
    return [
      {
        family: outcome.case.family,
        parent: sidesWithChange(kind, saidOf(parent, target)),
        child: sidesWithChange(kind, saidOf(outcome, target)),
      },
    ]
  })
}

export const settled = (outcome: Outcome) => ({
  expected: outcome.case.expected.success,
  got: succeeded(outcome.verdict),
})
