import type { ToolCallLabel } from './call-label.ts'
import { needsIntent } from './command-call.ts'
import type { ToolDefinition } from './definitions.ts'

/** A label that admission accepts for a call of this command: an intent only where one is needed. */
export function testingCallLabel(
  definition: ToolDefinition,
  command: string | null,
): ToolCallLabel {
  const needed = definition.kind === 'commands' && needsIntent(definition, command)
  return { intent: needed ? 'testing call' : null, tool: definition.name, command, preview: '' }
}
