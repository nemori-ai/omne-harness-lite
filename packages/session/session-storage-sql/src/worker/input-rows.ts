import {
  runStartInputs,
  type RoutedInput,
  type SessionCommand,
  type SessionInputScope,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { encodeValue } from '../codec.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

function ownInputs(command: SessionCommand): readonly Ordinary[] {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return [command.input.value]
  if (command.kind === 'create')
    return command.input.creation.initial === null ? [] : [command.input.creation.initial]
  if (command.kind === 'interrupt') return [command.input.urgent]
  return []
}

/** The ordinary inputs a command accepts, then the system inputs its decision accepted beside. */
export function admittedInputs(
  command: SessionCommand,
  decided: readonly Ordinary[] = [],
): readonly Ordinary[] {
  return [...ownInputs(command), ...decided]
}

/** The inputs a command reads: a Run start reads the first waking input. */
export function commandScope(
  command: SessionCommand,
  previous: WorkSnapshot | null,
): SessionInputScope {
  if (command.kind === 'startRun') return { kind: 'selected', inputs: runStartInputs(previous) }
  if (command.kind === 'receive' && command.input.fact.kind === 'input-handover')
    return { kind: 'selected', inputs: [command.input.fact.input] }
  return { kind: 'pending', inputs: previous?.pending ?? [] }
}

/** Keeps the accepted inputs for the hand-over and the Run start that read them. */
export function writeInputs(
  port: ParticipantPort,
  scope: Readonly<{ tenant: string; session: string }>,
  inputs: readonly Ordinary[],
): void {
  for (const value of inputs)
    port.execute(
      'INSERT OR REPLACE INTO sl_input (tenant, session, input, value) VALUES (?, ?, ?, ?)',
      [scope.tenant, scope.session, value.input, JSON.stringify(encodeValue(value))],
    )
}
