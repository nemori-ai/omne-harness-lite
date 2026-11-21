import type { InputId } from './identity.ts'
import type { SessionCommand } from './ports.ts'
import type { RoutedInput } from './values.ts'

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

export function withInputs(
  kept: ReadonlyMap<InputId, Ordinary> | undefined,
  added: readonly Ordinary[],
): Map<InputId, Ordinary> {
  return new Map([...(kept ?? []), ...added.map(value => [value.input, value] as const)])
}
