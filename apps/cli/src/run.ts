import {
  productionCatalog,
  renderHelp,
  type Catalog,
  type CliOutput,
  type ExitCode,
} from './catalog.ts'
import { parseArgv } from './argv.ts'
import { readBuildIdentity } from './identity.ts'

export type { CliOutput, ExitCode }

export function run(
  argv: readonly string[],
  output: CliOutput,
  catalog: Catalog = productionCatalog,
): ExitCode {
  const command = parseArgv(argv, catalog)
  switch (command.kind) {
    case 'help':
      output.stdout(renderHelp(catalog))
      return 0
    case 'version': {
      const identity = readBuildIdentity()
      if (identity.kind === 'error') {
        output.stderr(identity.message)
        return 1
      }
      output.stdout(`${identity.version}\n`)
      return 0
    }
    case 'command':
      return command.command.run(command.args, output)
    case 'usage-error':
      output.stderr(command.message)
      return 2
  }
}
