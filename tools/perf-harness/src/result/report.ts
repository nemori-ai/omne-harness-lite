import { isUnknown, type Field } from '../environment/field.ts'
import type { CountComparison } from './baseline.ts'
import { judged, outcomeOf, type Result } from './result.ts'

const shown = (field: Field<string | number | boolean>): string =>
  isUnknown(field) ? `unknown (${field.unknown})` : String(field)

const row = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`

const table = (head: readonly string[], rows: readonly (readonly string[])[]): string[] =>
  rows.length === 0 ? ['None.'] : [row(head), row(head.map(() => '---')), ...rows.map(row)]

function comparison(compared: CountComparison): string[] {
  switch (compared.state) {
    case 'blocked':
      return [`Blocked: ${compared.reason}.`]
    case 'refused':
      return [
        `Refused: ${compared.reason}. The counts of the two sides do not answer the same question.`,
      ]
    case 'equal':
      return [
        `Comparable. All ${String(compared.compared)} counts equal those of \`${compared.against}\`.`,
      ]
    case 'different':
      return [
        `Comparable. ${String(compared.differences.length)} counts differ from those of \`${compared.against}\`:`,
        '',
        ...table(
          ['count', 'baseline', 'now'],
          compared.differences.map(item => [
            item.name,
            String(item.base ?? 'absent'),
            String(item.now ?? 'absent'),
          ]),
        ),
      ]
  }
}

function environment(result: Result): string[] {
  const { machine, subject, state } = result.environment
  return [
    `- Commit \`${shown(subject.commit)}\`, working tree dirty: ${shown(subject.dirty)}, release build: ${String(subject.release)}`,
    `- Workload \`${result.ids.workload}\`, assembly \`${result.ids.assembly}\`, machine \`${result.ids.config}\``,
    `- Processor: ${shown(machine.cpu.model)}, ${String(machine.cpu.usable)} usable; memory ${shown(machine.memory.totalGiB)} GiB; ${shown(machine.virtualization.kind)} ${shown(machine.virtualization.product)}`,
    `- Data on ${shown(machine.storage.filesystem)} over ${shown(machine.storage.deviceClass)}; Node ${machine.runtime.node}, SQLite ${shown(machine.runtime.sqlite)}`,
    `- Load before ${state.loadBefore.join(' ')}; taken by the host ${shown(state.stolenShare)}; used by others ${shown(state.othersShare)}; disk in use ${shown(state.diskUsedShare)}`,
  ]
}

function times(result: Result): string[] {
  const { fitness } = result
  const lines = [
    `Times of this result: ${fitness.times}. As a baseline: ${fitness.baseline}. State qualified: ${String(fitness.stateQualified)}.`,
    'Times kept in the repository gate nothing: a time verdict only comes from a paired comparison within one run.',
  ]
  return fitness.reasons.length === 0
    ? lines
    : [...lines, ...fitness.reasons.map(reason => `- ${reason}`)]
}

const accepted = (count: number): string =>
  count === 0
    ? ''
    : `, with ${String(count)} known ${count === 1 ? 'failure' : 'failures'} accepted`

export function reportOf(result: Result, compared: CountComparison): string {
  const gates = judged(result)
  return [
    `# ${result.suite} (${result.tier}): ${outcomeOf(result)}${accepted(gates.filter(item => item.gate.known !== undefined && item.outcome === 'pass').length)}`,
    '',
    '## Gates',
    '',
    ...table(
      ['gate', 'verdict', 'held against', 'detail'],
      gates.map(item => [item.gate.name, item.outcome, item.gate.from, item.note]),
    ),
    '',
    '## Samples every gate has to judge one way',
    '',
    ...table(
      ['gate', 'expected', 'came out', 'detail'],
      result.controls.map(control => [
        control.gate,
        control.expected,
        control.state,
        control.detail,
      ]),
    ),
    '',
    '## Can it be compared',
    '',
    ...comparison(compared),
    '',
    ...times(result),
    '',
    '## Readings',
    '',
    ...table(
      ['reading', 'kind', 'value', 'unit'],
      result.readings.map(reading => [
        reading.name,
        reading.kind,
        String(reading.value),
        reading.unit,
      ]),
    ),
    '',
    '## Where it ran',
    '',
    ...environment(result),
    '',
    '## What these readings do not cover',
    '',
    ...(result.limits.length === 0
      ? ['Nothing was declared.']
      : result.limits.map(limit => `- ${limit}`)),
    '',
  ].join('\n')
}
