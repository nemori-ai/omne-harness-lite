export interface CliOutput {
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
}

export type ExitCode = 0 | 1 | 2

export interface FlagSpec {
  readonly token: '--help' | '--version'
  readonly usage: string
  readonly result: 'help' | 'version'
}

export interface CommandSpec {
  readonly name: string
  readonly usage: string
  readonly summary: string
  readonly run: (args: readonly string[], output: CliOutput) => ExitCode
}

export interface DocumentedOption {
  readonly usage: string
  readonly summary: string
}

export interface Catalog {
  readonly flags: readonly FlagSpec[]
  readonly commands: readonly CommandSpec[]
  readonly options: readonly DocumentedOption[]
  readonly footer: string
}

export const productionCatalog: Catalog = {
  flags: [
    { token: '--help', usage: 'omne --help', result: 'help' },
    { token: '--version', usage: 'omne --version', result: 'version' },
  ],
  commands: [],
  options: [
    { usage: '--home <directory>', summary: 'State directory. Overrides OMNE_HOME.' },
    { usage: 'OMNE_HOME', summary: 'State directory when --home is absent.' },
  ],
  footer:
    'The default state directory is $HOME/.omne.\n--help and --version do not open or create a state directory.\n',
}

export function renderHelp(catalog: Catalog): string {
  const intro =
    catalog.commands.length === 0
      ? 'Show help or version. This build has no other commands.'
      : 'Show help or version, or run a command.'
  const flags = catalog.flags.map(flag => `  ${flag.usage}`).join('\n')
  const commands =
    catalog.commands.length === 0
      ? ''
      : `\nCommands\n\n${catalog.commands
          .map(command => `  omne ${command.name} ${command.usage}    ${command.summary}`)
          .join('\n')}\n`
  const width = Math.max(...catalog.options.map(option => option.usage.length))
  const options = catalog.options
    .map(option => `  ${option.usage.padEnd(width)}    ${option.summary}`)
    .join('\n')
  return `omne\n\n${intro}\n\n${flags}\n${commands}\n${options}\n\n${catalog.footer}`
}
