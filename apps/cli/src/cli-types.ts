import type { BuildIdentityResult } from './identity.ts'

export interface CliOutput {
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
}

export type ExitCode = 0 | 1 | 2

export interface CommandEnvironment {
  readonly homeFlag: string | undefined
  readonly environmentHome: string | undefined
  readonly homeDirectory: string | undefined
}

export interface FlagSpec {
  readonly token: '--help' | '--version'
  readonly usage: string
  readonly result: 'help' | 'version'
}

export interface CommandSpec {
  readonly name: string
  readonly usage: string
  readonly summary: string
  readonly run: (
    args: readonly string[],
    output: CliOutput,
    environment: CommandEnvironment,
  ) => ExitCode
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

export interface CliRuntime {
  readonly catalog: Catalog
  readonly readIdentity: () => BuildIdentityResult
  readonly environmentHome: string | undefined
  readonly homeDirectory: string | undefined
}
