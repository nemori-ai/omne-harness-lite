import type { GovernanceTransport } from '@omne-harness/sdk'
import type { BuildIdentityResult } from './identity.ts'

export interface CliOutput {
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
}

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5

export type CredentialRead =
  | { readonly kind: 'credential'; readonly value: string }
  | { readonly kind: 'failure'; readonly message: string }

/** What a command needs from the process, so tests can stand in for each of them. */
export interface CommandServices {
  /** Builds the transport for one public location. Throws `TypeError` when the address is refused. */
  readonly createTransport: (
    origin: string,
    location: 'governance' | 'session',
  ) => GovernanceTransport
  /** Reads the account credential. `prompt` receives the text to show before a hidden read. */
  readonly readCredential: (prompt: (text: string) => void) => Promise<CredentialRead>
  /** A fresh identifier for a message, call, accept, input, or control. */
  readonly newId: () => string
}

export interface CommandEnvironment {
  readonly homeFlag: string | undefined
  readonly environmentHome: string | undefined
  readonly homeDirectory: string | undefined
  readonly environmentServer: string | undefined
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
  readonly services: CommandServices
}
