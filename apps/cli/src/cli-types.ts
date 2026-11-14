import type { GovernanceTransport } from '@omne-harness/sdk'
import type { BuildIdentityResult } from './identity.ts'
import type { LocalServerRead } from './local-server.ts'

export interface CliOutput {
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
}

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5

export type CredentialRead =
  | { readonly kind: 'credential'; readonly value: string }
  | { readonly kind: 'failure'; readonly message: string }

export interface CommandServices {
  readonly createTransport: (
    origin: string,
    location: 'governance' | 'session' | 'hitl',
  ) => GovernanceTransport
  readonly readCredential: (prompt: (text: string) => void) => Promise<CredentialRead>
  readonly newId: () => string
}

export interface CommandEnvironment {
  readonly homeFlag: string | undefined
  readonly environmentHome: string | undefined
  readonly homeDirectory: string | undefined
  readonly environmentServer: string | undefined
  readonly localServer?: () => LocalServerRead
  readonly services: CommandServices
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
  ) => Promise<ExitCode>
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
  readonly environmentServer: string | undefined
  readonly localServer?: () => LocalServerRead
  readonly services: CommandServices
}
