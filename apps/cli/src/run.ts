import { renderHelp } from './catalog.ts'
import type { CliOutput, CliRuntime, ExitCode } from './cli-types.ts'
import { parseArgv } from './argv.ts'

export type { CliOutput, ExitCode }

export async function run(
  argv: readonly string[],
  output: CliOutput,
  runtime: CliRuntime,
): Promise<ExitCode> {
  const command = parseArgv(argv, runtime.catalog)
  switch (command.kind) {
    case 'help':
      output.stdout(renderHelp(runtime.catalog))
      return 0
    case 'version': {
      const identity = runtime.readIdentity()
      if (identity.kind === 'error') {
        output.stderr(identity.message)
        return 1
      }
      output.stdout(`${identity.version}\n`)
      return 0
    }
    case 'command':
      return command.command.run(command.args, output, {
        homeFlag: command.homeFlag,
        environmentHome: runtime.environmentHome,
        homeDirectory: runtime.homeDirectory,
        environmentServer: runtime.environmentServer,
        services: runtime.services,
      })
    case 'usage-error':
      output.stderr(command.message)
      return 2
  }
}
