import type { SessionCommand, WorkSnapshot } from '@omne-harness/session-contract'
import {
  NO_FOCUS,
  readHistory,
  type HistoryBasis,
  type HistoryFocus,
  type SessionHistory,
} from './history-index.ts'
import { commandScope } from './input-rows.ts'
import type { Executor } from './support.ts'

// A result decision reads the execution it names, so a binding its Agent records carry is visible before Session interprets it.
function commandFocus(command: SessionCommand, previous: WorkSnapshot): HistoryFocus {
  const named =
    command.kind === 'preserveResult' || command.kind === 'completeConsumption'
      ? command.input.participation?.execution
      : undefined
  const active =
    (command.kind === 'receive' || command.kind === 'completeExternalConsumption') &&
    previous.run.kind === 'active'
      ? previous.run.execution.execution
      : undefined
  const execution = named ?? active
  return execution === undefined ? NO_FOCUS : { executions: [execution], event: null }
}

export function commandBasis(
  command: SessionCommand,
  previous: WorkSnapshot | null,
): HistoryBasis | null {
  return previous === null
    ? null
    : { scope: commandScope(command, previous), focus: commandFocus(command, previous) }
}

export function commandHistory(
  port: Executor,
  where: Readonly<{ tenant: string; session: string; previous: WorkSnapshot | null }>,
  basis: HistoryBasis | null,
): SessionHistory | 'too-many' | null {
  const { tenant, session, previous } = where
  return previous === null || basis === null
    ? null
    : readHistory(port, tenant, session, previous, basis.scope, { focus: basis.focus })
}
