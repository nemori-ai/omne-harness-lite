import { helpText, parseArgv } from './argv.ts'
import { readBuildIdentity } from './identity.ts'

export interface CliOutput {
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
}

export type ExitCode = 0 | 1 | 2

export function run(argv: readonly string[], output: CliOutput): ExitCode {
  const command = parseArgv(argv)
  switch (command.kind) {
    case 'help':
      output.stdout(helpText)
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
    case 'usage-error':
      output.stderr(command.message)
      return 2
  }
}
