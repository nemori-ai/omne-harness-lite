import type { ProgramCallFailure } from '@omne-harness/tool-contract'
import type { ProgramPosition, ProgramTable } from '@omne-harness/tool-contract/provider'

/** A failure the host answered a call of the program with, and where that call was. */
export type AnsweredFailure = Readonly<{ entry: string; failure: ProgramCallFailure }>

type Line = Readonly<{ ordinal: number; entry: string; outcome: string; detail: string }>

const entryOf = ({ target }: ProgramPosition) =>
  target.command === null ? target.name : `${target.name}.${target.command}`

/** What became of one position, read from the table: the table is the record, the answer only the words. */
function outcomeOf(position: ProgramPosition): string {
  if (position.state === 'retained') return position.terminal.kind
  if (position.state === 'excluded') return position.exclusion.kind
  return 'unsettled'
}

function lineOf(position: ProgramPosition, answered: AnsweredFailure | undefined): Line | null {
  const { ordinal } = position
  const entry = entryOf(position)
  if (answered !== undefined) {
    const { kind, effect, message } = answered.failure
    return { ordinal, entry, outcome: kind, detail: `effect ${effect}: ${message}` }
  }
  const outcome = outcomeOf(position)
  if (outcome === 'completed') return null
  if (position.state === 'retained')
    return { ordinal, entry, outcome, detail: `effect ${position.effect.kind}` }
  if (position.state === 'excluded')
    return { ordinal, entry, outcome, detail: `not made: ${position.exclusion.reason}` }
  const where = position.state === 'handed' && position.background ? 'in the background' : 'running'
  const asked = position.state === 'handed' ? position.stop : undefined
  const detail =
    asked === undefined
      ? `still ${where}; its result is not in this program`
      : `asked to stop (${asked}); its result is not in this program`
  return { ordinal, entry, outcome, detail }
}

/** TL-73: made from the position table; a failure the program caught and hid is still a line here. */
export function callsSummary(
  table: ProgramTable,
  answered: ReadonlyMap<number, AnsweredFailure>,
): string {
  const lines: Line[] = []
  let completed = 0
  for (const position of table.positions) {
    const line = lineOf(position, answered.get(position.ordinal))
    if (line === null) completed += 1
    else lines.push(line)
  }
  const placed = new Set(table.positions.map(position => position.ordinal))
  for (const [ordinal, { entry, failure }] of answered)
    if (!placed.has(ordinal))
      lines.push({ ordinal, entry, outcome: failure.kind, detail: `not made: ${failure.message}` })
  if (lines.length === 0)
    return completed === 0 ? 'calls: none' : `calls: ${String(completed)} completed`
  lines.sort((left, right) => left.ordinal - right.ordinal)
  const counts = new Map<string, number>()
  for (const { outcome } of lines) counts.set(outcome, (counts.get(outcome) ?? 0) + 1)
  const others = [...counts].map(([outcome, count]) => `${String(count)} ${outcome}`)
  const head = `calls: ${[`${String(completed)} completed`, ...others].join(', ')}`
  const rows = lines.map(
    line => `- #${String(line.ordinal)} ${line.entry} ${line.outcome}, ${line.detail}`,
  )
  return [head, ...rows].join('\n')
}
