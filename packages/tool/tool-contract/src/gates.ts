import type { ToolDefinition, ToolGate, ToolImplementationShape } from './definitions.ts'

export const IMPLICIT_TOOL_GATE: ToolGate = Object.freeze({
  id: 'invoke',
  title: '调用',
  default: 'ask',
})

export type ToolActionGate =
  | Readonly<{ kind: 'gate'; gate: ToolGate }>
  | Readonly<{ kind: 'ungated' }>

export function toolGatesOf(shape: ToolImplementationShape): readonly [ToolGate, ...ToolGate[]] {
  const declared = shape.kind === 'commands' ? shape.gates : undefined
  return declared === undefined || declared.length === 0
    ? [IMPLICIT_TOOL_GATE]
    : (declared as readonly [ToolGate, ...ToolGate[]])
}

export function commandGateOf(
  definition: Pick<ToolDefinition, 'kind'> & ToolImplementationShape,
  command: string | null,
  named: readonly string[],
): ToolActionGate {
  const gates = toolGatesOf(definition)
  const first = { kind: 'gate', gate: gates[0] } as const
  if (definition.kind !== 'commands' || command === null) return first
  const release = definition.commands.find(entry => entry.name === command)?.release
  if (release === undefined) return first
  if (release.gate === null) return named.includes(command) ? { kind: 'ungated' } : first
  // A judged definition names only gates it declares.
  return { kind: 'gate', gate: gates.find(entry => entry.id === release.gate)! }
}
