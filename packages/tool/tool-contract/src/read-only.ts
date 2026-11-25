import type { ToolDefinition, ToolImplementationShape } from './definitions.ts'

/** Whether the call named here is declared read-only. Anything not declared so has effects. */
export function isReadOnlyCall(
  definition: Pick<ToolDefinition, 'kind'> & ToolImplementationShape,
  command: string | null,
): boolean {
  if (definition.kind !== 'commands') return command === null && definition.readOnly === true
  return definition.commands.find(entry => entry.name === command)?.readOnly === true
}
