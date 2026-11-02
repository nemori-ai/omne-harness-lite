import { homedir } from 'node:os'
import {
  productionCatalog,
  run,
  type CliRuntime,
  type CommandServices,
  type CredentialRead,
} from '@omne-harness/cli'
import { createHttpTransport } from '@omne-harness/sdk'

export interface InProcessResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  /** How many times the command asked for the credential. */
  readonly credentialReads: number
}

export interface InProcessOptions {
  readonly omneHome?: string
  readonly homeDirectory?: string
  readonly omneServer?: string
  readonly credential?: CredentialRead
  readonly failStdout?: boolean
}

/** Runs the production catalog in this process: real HTTP transport, scripted credential and ids. */
export async function runInProcess(
  argv: readonly string[],
  options: InProcessOptions = {},
): Promise<InProcessResult> {
  let stdout = ''
  let stderr = ''
  let credentialReads = 0
  let counter = 0
  const services: CommandServices = {
    createTransport: (origin, location) => createHttpTransport({ origin, location }),
    readCredential: async () => {
      credentialReads += 1
      return options.credential ?? { kind: 'credential', value: 'correct horse battery staple' }
    },
    newId: () => `id-${(counter += 1)}`,
  }
  const runtime: CliRuntime = {
    catalog: productionCatalog,
    readIdentity: () => ({ kind: 'identity', version: '0.0.0' }),
    environmentHome: options.omneHome,
    homeDirectory: options.homeDirectory ?? homedir(),
    environmentServer: options.omneServer,
    services,
  }
  const code = await run(
    argv,
    {
      stdout: text => {
        if (options.failStdout === true) throw new Error('EPIPE')
        stdout += text
      },
      stderr: text => {
        stderr += text
      },
    },
    runtime,
  )
  return { code, stdout, stderr, credentialReads }
}
