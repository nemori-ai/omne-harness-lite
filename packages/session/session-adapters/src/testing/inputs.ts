import {
  runStartInputs,
  type InputId,
  type RoutedInput,
  type SessionCommand,
  type SessionInputScope,
  type WorkSnapshot,
} from '@omne-harness/session-contract'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

/** The ordinary inputs a command accepts; an entries commit carries its own in the decision. */
function ownInputs(command: SessionCommand): readonly Ordinary[] {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return [command.input.value]
  if (command.kind === 'create')
    return command.input.creation.initial === null ? [] : [command.input.creation.initial]
  if (command.kind === 'interrupt') return [command.input.urgent]
  return []
}

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

/** The inputs whose history a command reads: the batch of a Run start, the input of a hand-over, or what waits. */
export function inputScope(
  command: SessionCommand,
  snapshot: WorkSnapshot | undefined,
): SessionInputScope {
  if (command.kind === 'startRun') return { kind: 'selected', inputs: runStartInputs(snapshot) }
  if (command.kind === 'receive' && command.input.fact.kind === 'input-handover')
    return { kind: 'selected', inputs: [command.input.fact.input] }
  return { kind: 'pending', inputs: snapshot?.pending ?? [] }
}
