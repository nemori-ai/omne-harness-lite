import type { ToolDeclaration } from '@omne-harness/model-contract'
import type { ToolAdoption } from './values.js'
import { digest } from './internal.js'
export type { ToolRoute, ToolDeclarationSet } from './values.js'
import type { ToolRoute, ToolDeclarationSet } from './values.js'
/** Only resident tools are declarations; availability never changes their original definition. */
export function declareTools(tools: readonly ToolAdoption[]): ToolDeclarationSet {
  const direct: ToolDeclaration[] = []
  const programmatic: ToolDeclaration[] = []
  const routes: ToolRoute[] = []
  for (const adopted of tools
    .filter(x => x.resident)
    .sort((a, b) =>
      a.availability.definition.name.localeCompare(b.availability.definition.name, 'en'),
    )) {
    const def = adopted.availability.definition
    const declarations =
      def.kind === 'function'
        ? [
            {
              name: def.name,
              description: def.description,
              argumentsSchema: def.parameters.schema,
              command: null,
            },
          ]
        : def.commands.map(command => ({
            name: `${def.name}.${command.name}`,
            description: command.summary,
            argumentsSchema:
              command.parameters.kind === 'declared'
                ? command.parameters.value.schema
                : {
                    kind: 'object' as const,
                    entries: [{ key: 'type', value: { kind: 'string' as const, value: 'object' } }],
                  },
            command: command.name,
          }))
    for (const { command, ...declaration } of declarations) {
      direct.push(declaration)
      if (def.programmable === true) programmatic.push(declaration)
      routes.push({
        declared: declaration.name,
        tool: def.adoption,
        binding: adopted.binding,
        command,
      })
    }
  }
  return { direct, programmatic, routes, digest: digest({ direct, programmatic, routes }) }
}
