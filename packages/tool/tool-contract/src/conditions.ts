import type { ToolCallConditions, ToolDefinition } from './definitions.ts'

type Conditioned = Readonly<{ conditions?: ToolCallConditions }>

const unmet = (declared: Conditioned | undefined, held: ReadonlySet<string>): readonly string[] =>
  (declared?.conditions ?? []).filter(name => !held.has(name))

/** The declared conditions that are not among the names the consumer says hold where the call is made. */
export function unmetConditions(
  definition: ToolDefinition,
  command: string | null,
  held: ReadonlySet<string>,
): readonly string[] {
  if (definition.kind === 'function') return unmet(definition, held)
  return unmet(
    definition.commands.find(entry => entry.name === command),
    held,
  )
}

/** The definition as it is offered where these conditions hold: null when none of it is. */
export function offeredDefinition(
  definition: ToolDefinition,
  held: ReadonlySet<string>,
): ToolDefinition | null {
  if (definition.kind === 'function')
    return unmet(definition, held).length === 0 ? definition : null
  const commands = definition.commands.filter(entry => unmet(entry, held).length === 0)
  if (commands.length === definition.commands.length) return definition
  return commands.length === 0 ? null : { ...definition, commands }
}
