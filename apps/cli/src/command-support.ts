import {
  encodeTenantText,
  readTenantText,
  ruleCodec,
  type RuleValue,
  type TenantId,
} from '@omne-harness/public-contract'
import type { CliOutput, CommandEnvironment, ExitCode } from './cli-types.ts'
import { openLink, type Link } from './link.ts'
import { readLoginState, type LoginState } from './login-state.ts'
import { readSessionOwners } from './session-owners.ts'
import { ensureStateDirectory, resolveStateDirectory } from './state-directory.ts'

export const defaultServer = 'http://127.0.0.1:8787'
export const serverOption = '--server'
const hint = 'Run omne --help for usage.\n'
const serverRefused = 'omne: --server must be a loopback http address\n'
const invalidLogin = 'omne: login state is invalid\n'

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

export function givenServer(values: Option, environment: CommandEnvironment): string | undefined {
  const fromEnvironment = environment.environmentServer
  return values.get(serverOption) ?? (fromEnvironment === '' ? undefined : fromEnvironment)
}

export function serverOf(
  values: Option,
  environment: CommandEnvironment,
):
  | { readonly kind: 'server'; readonly origin: string }
  | { readonly kind: 'invalid'; readonly message: string } {
  const given = givenServer(values, environment)
  if (given !== undefined) return { kind: 'server', origin: given }
  const local = environment.localServer?.() ?? { kind: 'none' }
  if (local.kind === 'invalid') return local
  return { kind: 'server', origin: local.kind === 'address' ? local.origin : defaultServer }
}

export function tenantOption(values: Option): TenantId | undefined | null {
  const given = values.get('--tenant')
  if (given === undefined) return undefined
  return readTenantText(given) ?? null
}

export type Instant = RuleValue<{ readonly kind: 'instant' }>
const instantRule = ruleCodec({ kind: 'instant' })
const LEAF_LIMITS = {
  maxBytes: 1024,
  maxDepth: 1,
  maxItems: 1,
  maxMembers: 1,
  maxStringLength: 1024,
  maxNumberLength: 1,
}

/** An instant given as an option: null when absent, undefined when it is not an instant. */
export function instantOption(values: Option, option: string): Instant | null | undefined {
  const given = values.get(option)
  if (given === undefined) return null
  const read = instantRule.read({ kind: 'string', value: given }, LEAF_LIMITS)
  return read.ok ? (read.value as Instant) : undefined
}

export type OwnerResolution =
  | { readonly kind: 'owner'; readonly owner: TenantId }
  | { readonly kind: 'exit'; readonly code: ExitCode }

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
    owner = readTenantText(records.owners.get(session) ?? '')
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
      readonly link: Link
    }
  | { readonly kind: 'exit'; readonly code: ExitCode }

export function loadLogin(
  values: Option,
  output: CliOutput,
  environment: CommandEnvironment,
): LoadedLogin {
  const given = givenServer(values, environment)
  if (given !== undefined && openLink(environment, given).kind === 'refused')
    return { kind: 'exit', code: refusedServer(output) }

  const directory = stateDirectory(environment, false)
  if (directory.kind === 'error')
    return { kind: 'exit', code: localFailure(output, directory.message) }
  const login = readLoginState(directory.path)
  if (login.kind === 'failure') return { kind: 'exit', code: localFailure(output, login.message) }
  const tenant = readTenantText(login.state.tenantId)
  if (tenant === undefined) return { kind: 'exit', code: localFailure(output, invalidLogin) }
  const opened = openLink(environment, given ?? login.state.server, {
    proof: login.state.loginProof,
    tenant: encodeTenantText(tenant),
  })
  if (opened.kind === 'refused') return { kind: 'exit', code: localFailure(output, invalidLogin) }
  return { kind: 'login', directory: directory.path, state: login.state, tenant, link: opened.link }
}
