import type { RoutedInput, SessionCommand } from '@omne-harness/session-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { encodeValue } from '../codec.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

/** The ordinary inputs a command accepts; an entries commit carries its own in the decision. */
export function admittedInputs(command: SessionCommand): readonly Ordinary[] {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return [command.input.value]
  if (command.kind === 'create')
    return command.input.creation.initial === null ? [] : [command.input.creation.initial]
  if (command.kind === 'interrupt') return [command.input.urgent]
  return []
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
