export type ParsedCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'usage-error'; readonly message: string }

export const helpText = `omne

Show help or version. This build has no other commands.

  omne --help
  omne --version

  --home <directory>    State directory. Overrides OMNE_HOME.
  OMNE_HOME             State directory when --home is absent.

The default state directory is $HOME/.omne.
--help and --version do not open or create a state directory.
`

const unrecognized = 'omne: unrecognized arguments\nRun omne --help for usage.\n'

export function parseArgv(argv: readonly string[]): ParsedCommand {
  if (argv.length === 1 && argv[0] === '--help') return { kind: 'help' }
  if (argv.length === 1 && argv[0] === '--version') return { kind: 'version' }
  return { kind: 'usage-error', message: unrecognized }
}
