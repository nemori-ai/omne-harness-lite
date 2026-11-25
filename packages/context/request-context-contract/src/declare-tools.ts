import type { ToolDeclaration } from '@omne-harness/model-contract'
import {
  commandCallSchema,
  commandMenu,
  isProgramExecutor,
  programCatalogue,
  returnSummary,
} from '@omne-harness/tool-contract'
import type { ToolAdoption } from './values.js'
import { digest } from './internal.js'
export type { ToolCommandSelection, ToolRoute, ToolDeclarationSet } from './values.js'
import type { ToolRoute, ToolDeclarationSet } from './values.js'
export function declareTools(tools: readonly ToolAdoption[]): ToolDeclarationSet {
  const direct: ToolDeclaration[] = []
  const programmatic: ToolDeclaration[] = []
  const routes: ToolRoute[] = []
  const resident = tools
    .filter(x => x.resident)
    .sort((a, b) =>
      a.availability.definition.name.localeCompare(b.availability.definition.name, 'en'),
    )
  // A program executor declares the functions of the resident tools a program can call, fixed here with the rest.
  const catalogue = programCatalogue(resident.map(adopted => adopted.availability.definition))
  const callable = (text: string, executor: boolean) =>
    executor && catalogue !== '' ? `${text}\n\n${catalogue}` : text
  for (const adopted of resident) {
    const def = adopted.availability.definition
    const declaration: ToolDeclaration =
      def.kind === 'function'
        ? {
            name: def.name,
            description: callable(
              `${def.description}\n\n${returnSummary(def.returns)}`,
              isProgramExecutor(def),
            ),
            argumentsSchema: def.parameters.schema,
          }
        : {
            name: def.name,
            description: callable(
              `${def.description}\n\n${commandMenu(def)}`,
              isProgramExecutor(def),
            ),
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
