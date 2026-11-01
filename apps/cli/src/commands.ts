import {
  RequestInvalidError,
  createGovernanceClient,
  createSessionClient,
  parseTenantText,
  tenantText,
  userTextMessage,
  type CallerResult,
  type GovernanceTransport,
  type SessionRequest,
  type TenantId,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import { readLoginState, writeLoginState, type LoginState } from './login-state.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'
import { ensureStateDirectory, resolveStateDirectory } from './state-directory.ts'

const defaultServer = 'http://127.0.0.1:8787'
const serverOption = '--server'
const hint = 'Run omne --help for usage.\n'
const serverRefused = 'omne: --server must be a loopback http address\n'

function unrecognized(command: string): string {
  return `omne ${command}: unrecognized arguments\n${hint}`
}

function usageError(output: CliOutput, message: string): ExitCode {
  output.stderr(message)
  return 2
}

function localFailure(output: CliOutput, message: string): ExitCode {
  output.stderr(message)
  return 1
}

type Option = ReadonlyMap<string, string>

/** The server a command was told about on its command line or in its environment, if any. */
function givenServer(values: Option, environment: CommandEnvironment): string | undefined {
  const fromEnvironment = environment.environmentServer
  return values.get(serverOption) ?? (fromEnvironment === '' ? undefined : fromEnvironment)
}

type Transport =
  | { readonly kind: 'transport'; readonly origin: string; readonly transport: GovernanceTransport }
  | { readonly kind: 'refused' }

function openTransport(
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
async function attempt(submit: () => Promise<CallerResult>): Promise<CallerResult | undefined> {
  try {
    return await submit()
  } catch (error) {
    if (error instanceof RequestInvalidError) return undefined
    throw error
  }
}

function withoutProof(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'loginProof'))
}

function text(body: unknown, key: string): string {
  const value =
    typeof body === 'object' && body !== null
      ? Object.entries(body).find(([name]) => name === key)?.[1]
      : undefined
  return typeof value === 'string' ? value : ''
}

function stateDirectory(environment: CommandEnvironment, create: boolean) {
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

async function runAccount(
  name: 'register' | 'login',
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const read = readOptions(args, {
    accepted: ['--login-identifier', serverOption],
    required: ['--login-identifier'],
  })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  // `register` never touches the state directory, so it takes no `--home`.
  if (name === 'register' && environment.homeFlag !== undefined)
    return usageError(output, unrecognized(name))
  if (read.kind === 'missing')
    return usageError(output, `omne ${name}: missing ${read.option}\n${hint}`)
  const opened = openTransport(
    environment,
    givenServer(read.values, environment) ?? defaultServer,
    'governance',
  )
  if (opened.kind === 'refused') return usageError(output, serverRefused)

  const credential = await environment.services.readCredential(output.stderr)
  if (credential.kind === 'failure') return localFailure(output, credential.message)
  if (credential.value === '') return usageError(output, 'omne: empty credential\n')

  // `login` opens the state directory before it sends anything, so a failure sends no credential.
  let directory = ''
  if (name === 'login') {
    const ready = stateDirectory(environment, true)
    if (ready.kind === 'error') return localFailure(output, ready.message)
    directory = ready.path
  }

  const messageId = environment.services.newId()
  const loginIdentifier = read.values.get('--login-identifier') ?? ''
  const client = createGovernanceClient({ transport: opened.transport })
  const body = { loginIdentifier, credential: credential.value }
  const result = await attempt(() =>
    client.submit(
      name === 'register'
        ? {
            protocolVersion: 'governance-public/1',
            messageId,
            operation: 'register-and-activate',
            body,
          }
        : { protocolVersion: 'governance-public/1', messageId, operation: 'issue-login', body },
    ),
  )
  if (result === undefined) return usageError(output, unrecognized(name))

  const echo = { messageId }
  if (name === 'register') return report(name, result, echo, output)

  const issued = result.kind === 'response' && result.message.outcome === 'succeeded'
  const saved = issued
    ? writeLoginState(directory, {
        version: 1,
        server: opened.origin,
        loginIdentifier: text(result.message.body, 'loginIdentifier'),
        issuedAt: text(result.message.body, 'issuedAt'),
        tenantId: text(result.message.body, 'tenantId'),
        loginProof: text(result.message.body, 'loginProof'),
      })
    : undefined
  const code = report(name, result, echo, output, withoutProof)
  if (saved?.kind === 'failed') {
    const reason = saved.code === undefined ? '' : `: ${saved.code}`
    output.stderr(`omne login: cannot write login state ${saved.path}${reason}\n`)
    return 1
  }
  return code
}

interface SessionContext {
  readonly state: LoginState
  readonly loginTenant: TenantId
  readonly newId: () => string
}

type Built = { readonly request: SessionRequest; readonly echo: RequestEcho }

interface SessionCommand<Parsed> {
  readonly name: string
  readonly accepted: readonly string[]
  readonly required: readonly string[]
  /** Checks the values that need no state. Returns `undefined` for a usage error. */
  readonly parse: (values: Option) => Parsed | undefined
  readonly build: (parsed: Parsed, context: SessionContext) => Built
}

/** `--tenant`: `undefined` when absent, `null` when present but not a tenant text. */
function tenantOption(values: Option): TenantId | undefined | null {
  const given = values.get('--tenant')
  if (given === undefined) return undefined
  return parseTenantText(given) ?? null
}

async function runSession<Parsed>(
  command: SessionCommand<Parsed>,
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { name } = command
  const read = readOptions(args, { accepted: command.accepted, required: command.required })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing')
    return usageError(output, `omne ${name}: missing ${read.option}\n${hint}`)
  const parsed = command.parse(read.values)
  if (parsed === undefined) return usageError(output, unrecognized(name))

  const given = givenServer(read.values, environment)
  const early = given === undefined ? undefined : openTransport(environment, given, 'session')
  if (early?.kind === 'refused') return usageError(output, serverRefused)

  const directory = stateDirectory(environment, false)
  if (directory.kind === 'error') return localFailure(output, directory.message)
  const login = readLoginState(directory.path)
  if (login.kind === 'failure') return localFailure(output, login.message)
  const loginTenant = parseTenantText(login.state.tenantId)
  const opened = early ?? openTransport(environment, login.state.server, 'session')
  if (opened.kind === 'refused' || loginTenant === undefined)
    return localFailure(output, `omne: login state is invalid\n`)

  const { request, echo } = command.build(parsed, {
    state: login.state,
    loginTenant,
    newId: environment.services.newId,
  })
  const client = createSessionClient({ transport: opened.transport })
  const result = await attempt(() => client.submit(request))
  if (result === undefined) return usageError(output, unrecognized(name))
  return report(name, result, echo, output)
}

function proofOf(state: LoginState) {
  return { kind: 'present', value: state.loginProof } as const
}

const createSession: SessionCommand<{
  definition: string
  purpose: string
  createCallId: string | undefined
}> = {
  name: 'create-session',
  accepted: ['--definition', '--purpose', '--create-call-id', serverOption],
  required: ['--definition'],
  parse: values => ({
    definition: values.get('--definition') ?? '',
    purpose: values.get('--purpose') ?? '',
    createCallId: values.get('--create-call-id'),
  }),
  build: (parsed, { state, loginTenant, newId }) => {
    const messageId = newId()
    const createCallId = parsed.createCallId ?? newId()
    return {
      request: {
        protocolVersion: 'session-public/1',
        messageId,
        operation: 'create-session',
        proof: proofOf(state),
        actingTenant: loginTenant,
        body: { createCallId, definition: parsed.definition, purpose: parsed.purpose },
      },
      echo: { messageId, createCallId, tenant: tenantText(loginTenant) },
    }
  },
}

type Targeted = {
  session: string
  tenant: TenantId | undefined
  controlId: string | undefined
}

function targeted(values: Option): Targeted | undefined {
  const tenant = tenantOption(values)
  if (tenant === null) return undefined
  return { session: values.get('--session') ?? '', tenant, controlId: values.get('--control-id') }
}

const sendInput: SessionCommand<
  Omit<Targeted, 'controlId'> & {
    text: string
    acceptId: string | undefined
    inputId: string | undefined
  }
> = {
  name: 'send-input',
  accepted: ['--session', '--text', '--tenant', '--accept-id', '--input-id', serverOption],
  required: ['--session', '--text'],
  parse: values => {
    const target = targeted(values)
    if (target === undefined) return undefined
    return {
      session: target.session,
      tenant: target.tenant,
      text: values.get('--text') ?? '',
      acceptId: values.get('--accept-id'),
      inputId: values.get('--input-id'),
    }
  },
  build: (parsed, { state, loginTenant, newId }) => {
    const messageId = newId()
    const acceptId = parsed.acceptId ?? newId()
    const inputId = parsed.inputId ?? newId()
    const tenant = parsed.tenant ?? loginTenant
    return {
      request: {
        protocolVersion: 'session-public/1',
        messageId,
        operation: 'send-input',
        proof: proofOf(state),
        body: {
          tenant,
          session: parsed.session,
          acceptId,
          inputId,
          message: userTextMessage(parsed.text, inputId),
        },
      },
      echo: { messageId, acceptId, inputId, tenant: tenantText(tenant) },
    }
  },
}

const cancelRun: SessionCommand<Targeted & { run: string; urgency: 'graceful' | 'force' }> = {
  name: 'cancel-run',
  accepted: ['--session', '--run', '--urgency', '--tenant', '--control-id', serverOption],
  required: ['--session', '--run'],
  parse: values => {
    const target = targeted(values)
    const urgency = values.get('--urgency') ?? 'graceful'
    if (target === undefined || (urgency !== 'graceful' && urgency !== 'force')) return undefined
    return { ...target, run: values.get('--run') ?? '', urgency }
  },
  build: (parsed, { state, loginTenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
    const tenant = parsed.tenant ?? loginTenant
    return {
      request: {
        protocolVersion: 'session-public/1',
        messageId,
        operation: 'cancel-run',
        proof: proofOf(state),
        body: {
          tenant,
          session: parsed.session,
          controlId,
          run: parsed.run,
          urgency: parsed.urgency,
        },
      },
      echo: { messageId, controlId, tenant: tenantText(tenant) },
    }
  },
}

const stopCall: SessionCommand<Targeted & { kind: 'model' | 'tool'; call: string }> = {
  name: 'stop-call',
  accepted: ['--session', '--producer-kind', '--call', '--tenant', '--control-id', serverOption],
  required: ['--session', '--producer-kind', '--call'],
  parse: values => {
    const target = targeted(values)
    const kind = values.get('--producer-kind')
    if (target === undefined || (kind !== 'model' && kind !== 'tool')) return undefined
    return { ...target, kind, call: values.get('--call') ?? '' }
  },
  build: (parsed, { state, loginTenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
    const tenant = parsed.tenant ?? loginTenant
    return {
      request: {
        protocolVersion: 'session-public/1',
        messageId,
        operation: 'stop-call',
        proof: proofOf(state),
        body: {
          tenant,
          session: parsed.session,
          controlId,
          producer: { kind: parsed.kind, call: parsed.call },
        },
      },
      echo: { messageId, controlId, tenant: tenantText(tenant) },
    }
  },
}

/** The six commands of the minimal command surface, in the order the help lists them. */
export const productionCommands: readonly CommandSpec[] = [
  {
    name: 'register',
    usage: '--login-identifier <id>',
    summary: 'Register and activate an account.',
    run: (args, output, environment) => runAccount('register', args, output, environment),
  },
  {
    name: 'login',
    usage: '--login-identifier <id>',
    summary: 'Issue a login and save it in the state directory.',
    run: (args, output, environment) => runAccount('login', args, output, environment),
  },
  {
    name: 'create-session',
    usage: '--definition <name>',
    summary: 'Create a session.',
    run: (args, output, environment) => runSession(createSession, args, output, environment),
  },
  {
    name: 'send-input',
    usage: '--session <id> --text <text>',
    summary: 'Send a user message to a session.',
    run: (args, output, environment) => runSession(sendInput, args, output, environment),
  },
  {
    name: 'cancel-run',
    usage: '--session <id> --run <id>',
    summary: 'Cancel a run.',
    run: (args, output, environment) => runSession(cancelRun, args, output, environment),
  },
  {
    name: 'stop-call',
    usage: '--session <id> --producer-kind <kind> --call <id>',
    summary: 'Stop a model or tool call.',
    run: (args, output, environment) => runSession(stopCall, args, output, environment),
  },
]
