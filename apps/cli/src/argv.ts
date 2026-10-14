import { productionCatalog, renderHelp, type Catalog, type CommandSpec } from './catalog.ts'

export type ParsedCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'command'; readonly command: CommandSpec; readonly args: readonly string[] }
  | { readonly kind: 'usage-error'; readonly message: string }

export const helpText = renderHelp(productionCatalog)

const missingCommand = 'omne: missing command\nRun omne --help for usage.\n'
const homeRequiresDirectory = 'omne: --home requires a directory\n'
const unrecognized = 'omne: unrecognized arguments\nRun omne --help for usage.\n'

export function parseArgv(
  argv: readonly string[],
  catalog: Catalog = productionCatalog,
): ParsedCommand {
  if (argv.length === 1) {
    const flag = catalog.flags.find(item => item.token === argv[0])
    if (flag?.result === 'help') return { kind: 'help' }
    if (flag?.result === 'version') return { kind: 'version' }
  }
  const commandName = argv[0]
  if (commandName !== undefined && !commandName.startsWith('-')) {
    const command = catalog.commands.find(item => item.name === commandName)
    if (command) return { kind: 'command', command, args: argv.slice(1) }
  }
  if (argv.length === 0) return { kind: 'usage-error', message: missingCommand }
  const homeWithoutDirectory = argv.some((token, index) => {
    const next = argv[index + 1]
    return token === '--home' && (next === undefined || next.startsWith('-'))
  })
  if (homeWithoutDirectory) return { kind: 'usage-error', message: homeRequiresDirectory }
  return { kind: 'usage-error', message: unrecognized }
}
