import type { InputId, RoutedInput, SessionCommand } from '@omne-harness/session-contract'

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

export function withInputs(
  kept: ReadonlyMap<InputId, Ordinary> | undefined,
  added: readonly Ordinary[],
): Map<InputId, Ordinary> {
  return new Map([...(kept ?? []), ...added.map(value => [value.input, value] as const)])
}
