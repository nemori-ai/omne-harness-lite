import type { ToolDeclaration } from '@omne-harness/model-contract'
import { commandCallSchema, commandMenu, returnSummary } from '@omne-harness/tool-contract'
import type { ToolAdoption } from './values.js'
import { digest } from './internal.js'
export type { ToolCommandSelection, ToolRoute, ToolDeclarationSet } from './values.js'
import type { ToolRoute, ToolDeclarationSet } from './values.js'
/**
 * Only resident tools are declarations; availability never changes their original definition.
 * Each tool is one declaration (D-94): a multi-command tool names the command inside its arguments,
 * and its description ends with the command menu.
 */
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
    const declaration: ToolDeclaration =
      def.kind === 'function'
        ? {
            name: def.name,
            description: `${def.description}\n\n${returnSummary(def.returns)}`,
            argumentsSchema: def.parameters.schema,
          }
        : {
            name: def.name,
            description: `${def.description}\n\n${commandMenu(def)}`,
            argumentsSchema: commandCallSchema(def),
          }
    direct.push(declaration)
    if (def.programmable === true) programmatic.push(declaration)
    routes.push({
      declared: declaration.name,
      tool: def.adoption,
      binding: adopted.binding,
      selection:
        def.kind === 'function'
          ? { kind: 'none' }
          : {
              kind: 'argument',
              encoding: def.encoding,
              commands: def.commands.map(command => command.name),
            },
    })
  }
  return { direct, programmatic, routes, digest: digest({ direct, programmatic, routes }) }
}
