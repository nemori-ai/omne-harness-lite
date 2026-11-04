import {
  RequestInvalidError,
  parseTenantText,
  type CallerResult,
  type GovernanceTransport,
  type TenantId,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, ExitCode } from './cli-types.ts'
import { readLoginState, type LoginState } from './login-state.ts'
import { readSessionOwners } from './session-owners.ts'
import { ensureStateDirectory, resolveStateDirectory } from './state-directory.ts'

export const defaultServer = 'http://127.0.0.1:8787'
export const serverOption = '--server'
const hint = 'Run omne --help for usage.\n'
const serverRefused = 'omne: --server must be a loopback http address\n'

export type Option = ReadonlyMap<string, string>

export function unrecognized(command: string): string {
  return `omne ${command}: unrecognized arguments\n${hint}`
}

export function missingOption(command: string, option: string): string {
  return `omne ${command}: missing ${option}\n${hint}`
}

export function usageError(output: CliOutput, message: string): ExitCode {
  output.stderr(message)
  return 2
}

export function localFailure(output: CliOutput, message: string): ExitCode {
  output.stderr(message)
  return 1
}

export function refusedServer(output: CliOutput): ExitCode {
  return usageError(output, serverRefused)
}

/** The server a command was told about on its command line or in its environment, if any. */
export function givenServer(values: Option, environment: CommandEnvironment): string | undefined {
  const fromEnvironment = environment.environmentServer
  return values.get(serverOption) ?? (fromEnvironment === '' ? undefined : fromEnvironment)
}

export type Transport =
  | { readonly kind: 'transport'; readonly origin: string; readonly transport: GovernanceTransport }
  | { readonly kind: 'refused' }

export function openTransport(
  environment: CommandEnvironment,
  origin: string,
  location: 'governance' | 'session',
): Transport {
  try {
    const transport = environment.services.createTransport(origin, location)
    return { kind: 'transport', origin: new URL(origin).origin, transport }
  } catch {
    return { kind: 'refused' }
  }
}

/** Runs the submit and turns a request the contract refuses into `undefined`, a usage error. */
export async function attempt(
  submit: () => Promise<CallerResult>,
): Promise<CallerResult | undefined> {
  try {
    return await submit()
  } catch (error) {
    if (error instanceof RequestInvalidError) return undefined
    throw error
  }
}

/** `--tenant`: `undefined` when absent, `null` when present but not a tenant text. */
export function tenantOption(values: Option): TenantId | undefined | null {
  const given = values.get('--tenant')
  if (given === undefined) return undefined
  return parseTenantText(given) ?? null
}

export function proofOf(state: LoginState) {
  return { kind: 'present', value: state.loginProof } as const
}

export type OwnerResolution =
  | { readonly kind: 'owner'; readonly owner: TenantId }
  | { readonly kind: 'exit'; readonly code: ExitCode }

/**
 * The tenant that owns an existing session: the `--tenant` value, else the record of the state
 * directory. No record is a usage error, so a request never falls back to the selected tenant.
 */
export function resolveOwner(
  command: string,
  session: string,
  given: TenantId | undefined,
  directory: string,
  output: CliOutput,
): OwnerResolution {
  let owner = given
  if (owner === undefined) {
    const records = readSessionOwners(directory)
    if (records.kind === 'failure')
      return { kind: 'exit', code: localFailure(output, records.message) }
    owner = parseTenantText(records.owners.get(session) ?? '')
  }
  if (owner === undefined)
    return {
      kind: 'exit',
      code: usageError(
        output,
        `omne ${command}: the owner tenant of this session is unknown
Add --tenant <tenant>.
`,
      ),
    }
  return { kind: 'owner', owner }
}

export function withoutProof(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'loginProof'))
}

export function text(body: unknown, key: string): string {
  const value =
    typeof body === 'object' && body !== null
      ? Object.entries(body).find(([name]) => name === key)?.[1]
      : undefined
  return typeof value === 'string' ? value : ''
}

export function stateDirectory(environment: CommandEnvironment, create: boolean) {
  const resolved = resolveStateDirectory({
    flag: environment.homeFlag,
    environment: environment.environmentHome,
    home: environment.homeDirectory,
  })
  if (resolved.kind === 'error') return resolved
  return create
    ? ensureStateDirectory(resolved.path)
    : { kind: 'ready' as const, path: resolved.path }
}

export type LoadedLogin =
  | {
      readonly kind: 'login'
      readonly directory: string
      readonly state: LoginState
      readonly tenant: TenantId
      readonly opened: Extract<Transport, { kind: 'transport' }>
    }
  | { readonly kind: 'exit'; readonly code: ExitCode }

/**
 * Reads the login a command acts under and opens the transport for its location. The server is
 * the one the command line or environment names, else the one the login was issued by. The state
 * directory is only read, never created.
 */
export function loadLogin(
  values: Option,
  output: CliOutput,
  environment: CommandEnvironment,
  location: 'governance' | 'session',
): LoadedLogin {
  const given = givenServer(values, environment)
  const early = given === undefined ? undefined : openTransport(environment, given, location)
  if (early?.kind === 'refused') return { kind: 'exit', code: refusedServer(output) }

  const directory = stateDirectory(environment, false)
  if (directory.kind === 'error')
    return { kind: 'exit', code: localFailure(output, directory.message) }
  const login = readLoginState(directory.path)
  if (login.kind === 'failure') return { kind: 'exit', code: localFailure(output, login.message) }
  const tenant = parseTenantText(login.state.tenantId)
  const opened = early ?? openTransport(environment, login.state.server, location)
  if (opened.kind === 'refused' || tenant === undefined)
    return { kind: 'exit', code: localFailure(output, `omne: login state is invalid\n`) }
  return { kind: 'login', directory: directory.path, state: login.state, tenant, opened }
}
