import { productionCatalog } from './catalog.ts'
import type { Catalog, CommandSpec } from './cli-types.ts'

export type ParsedCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | {
      readonly kind: 'command'
      readonly command: CommandSpec
      readonly args: readonly string[]
      readonly homeFlag: string | undefined
    }
  | { readonly kind: 'usage-error'; readonly message: string }

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
  if (homeValueIsMissing(argv)) return { kind: 'usage-error', message: homeRequiresDirectory }
  const { homeFlag, rest } = takeHome(argv)
  const commandName = rest[0]
  if (commandName !== undefined && !commandName.startsWith('-')) {
    const command = catalog.commands.find(item => item.name === commandName)
    if (command) return { kind: 'command', command, args: rest.slice(1), homeFlag }
  }
  if (argv.length === 0) return { kind: 'usage-error', message: missingCommand }
  return { kind: 'usage-error', message: unrecognized }
}

function homeValueIsMissing(argv: readonly string[]): boolean {
  return argv.some((token, index) => {
    const next = argv[index + 1]
    return token === '--home' && (next === undefined || next.startsWith('-'))
  })
}

function takeHome(argv: readonly string[]): { homeFlag: string | undefined; rest: string[] } {
  const rest: string[] = []
  let homeFlag: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? ''
    const next = argv[index + 1]
    if (token === '--home' && next !== undefined && next !== '' && !next.startsWith('-')) {
      homeFlag = next
      index += 1
      continue
    }
    rest.push(token)
  }
  return { homeFlag, rest }
}
