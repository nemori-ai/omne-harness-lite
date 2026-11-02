import type { Catalog, CommandSpec, DocumentedOption, FlagSpec } from './cli-types.ts'
import { productionCommands } from './commands.ts'

export type { Catalog, CommandSpec, DocumentedOption, FlagSpec }

export function defineCatalog(catalog: Catalog): Catalog {
  const names = new Set<string>()
  for (const command of catalog.commands) {
    if (command.name === '' || command.name.startsWith('-')) {
      throw new TypeError(`command name must be a word, got ${JSON.stringify(command.name)}`)
    }
    if (names.has(command.name)) throw new TypeError(`duplicate command name ${command.name}`)
    names.add(command.name)
  }
  return catalog
}

export const productionCatalog: Catalog = defineCatalog({
  flags: [
    { token: '--help', usage: 'omne --help', result: 'help' },
    { token: '--version', usage: 'omne --version', result: 'version' },
  ],
  commands: productionCommands,
  options: [
    { usage: '--home <directory>', summary: 'State directory. Overrides OMNE_HOME.' },
    { usage: 'OMNE_HOME', summary: 'State directory when --home is absent.' },
    { usage: '--server <url>', summary: 'Server address. Overrides OMNE_SERVER.' },
    { usage: 'OMNE_SERVER', summary: 'Server address when --server is absent.' },
  ],
  footer:
    'The default state directory is $HOME/.omne.\n--help and --version do not open or create a state directory.\n',
})

export function renderHelp(catalog: Catalog): string {
  const intro =
    catalog.commands.length === 0
      ? 'Show help or version. This build has no other commands.'
      : 'Show help or version, or run a command.'
  const flags = catalog.flags.map(flag => `  ${flag.usage}`).join('\n')
  const commands = renderCommands(catalog.commands)
  const options = renderOptions(catalog.options)
  const optionBreak = options === '' ? '' : `\n${options}`
  return `omne\n\n${intro}\n\n${flags}\n${commands}${optionBreak}\n\n${catalog.footer}`
}

function renderCommands(commands: readonly CommandSpec[]): string {
  if (commands.length === 0) return ''
  const heads = commands.map(commandHead)
  const width = Math.max(...heads.map(head => head.length))
  const lines = commands.map(
    (command, index) => `  ${heads[index]?.padEnd(width) ?? ''}    ${command.summary}`,
  )
  return `\nCommands\n\n${lines.join('\n')}\n`
}

function commandHead(command: CommandSpec): string {
  return command.usage === '' ? `omne ${command.name}` : `omne ${command.name} ${command.usage}`
}

function renderOptions(options: readonly DocumentedOption[]): string {
  if (options.length === 0) return ''
  const width = Math.max(...options.map(option => option.usage.length))
  return options.map(option => `  ${option.usage.padEnd(width)}    ${option.summary}`).join('\n')
}
