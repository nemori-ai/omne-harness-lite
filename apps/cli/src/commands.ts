import {
  createGovernanceClient,
  createSessionClient,
  tenantText,
  userTextMessage,
  type SessionRequest,
  type TenantId,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  attempt,
  loadLogin,
  localFailure,
  missingOption,
  openTransport,
  proofOf,
  refusedServer,
  resolveOwner,
  serverOf,
  serverOption,
  stateDirectory,
  tenantOption,
  text,
  unrecognized,
  usageError,
  withoutProof,
  type Option,
} from './command-support.ts'
import { credentialCommand } from './credential-command.ts'
import { governanceCommands } from './governance-commands.ts'
import { runReadHistory } from './history-command.ts'
import { writeLoginState, type LoginState } from './login-state.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'
import { readSessionOwners, writeSessionOwners } from './session-owners.ts'

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
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const server = serverOf(read.values, environment)
  if (server.kind === 'invalid') return localFailure(output, server.message)
  const opened = openTransport(environment, server.origin, 'governance')
  if (opened.kind === 'refused') return refusedServer(output)

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
  const loginId = issued ? text(result.message.body, 'loginId') : ''
  const saved = issued
    ? writeLoginState(directory, {
        version: 1,
        server: opened.origin,
        loginIdentifier: text(result.message.body, 'loginIdentifier'),
        issuedAt: text(result.message.body, 'issuedAt'),
        tenantId: text(result.message.body, 'tenantId'),
        loginProof: text(result.message.body, 'loginProof'),
        ...(loginId === '' ? {} : { loginId }),
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
  readonly newId: () => string
}

type Built = { readonly request: SessionRequest; readonly echo: RequestEcho }

interface SessionCommandBase<Parsed> {
  readonly name: string
  readonly accepted: readonly string[]
  readonly required: readonly string[]
  /** Checks the values that need no state. Returns `undefined` for a usage error. */
  readonly parse: (values: Option) => Parsed | undefined
}

/** Creates a session. The tenant that is selected at login is the acting tenant. */
interface CreatingCommand<Parsed> extends SessionCommandBase<Parsed> {
  readonly kind: 'creating'
  readonly build: (parsed: Parsed, context: SessionContext & { loginTenant: TenantId }) => Built
}

/**
 * Acts on a session that exists. The owner of a session is fixed when it is created, so the
 * tenant of the request is the owner and never the tenant that is selected now.
 */
interface ExistingCommand<Parsed> extends SessionCommandBase<Parsed> {
  readonly kind: 'existing'
  readonly target: (parsed: Parsed) => {
    readonly session: string
    readonly tenant: TenantId | undefined
  }
  readonly build: (parsed: Parsed, context: SessionContext & { owner: TenantId }) => Built
}

type SessionCommand<Parsed> = CreatingCommand<Parsed> | ExistingCommand<Parsed>

async function runSession<Parsed>(
  command: SessionCommand<Parsed>,
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { name } = command
  const read = readOptions(args, { accepted: command.accepted, required: command.required })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const parsed = command.parse(read.values)
  if (parsed === undefined) return usageError(output, unrecognized(name))

  const loaded = loadLogin(read.values, output, environment, 'session')
  if (loaded.kind === 'exit') return loaded.code
  const { directory, opened, tenant: loginTenant } = loaded

  const context = { state: loaded.state, newId: environment.services.newId }
  let built: Built
  let owners: ReadonlyMap<string, string> = new Map()
  if (command.kind === 'creating') {
    // The records are read before anything is sent, so a damaged file stops the command before a
    // session exists that the file cannot take.
    const records = readSessionOwners(directory)
    if (records.kind === 'failure') return localFailure(output, records.message)
    owners = records.owners
    built = command.build(parsed, { ...context, loginTenant })
  } else {
    const { session, tenant: given } = command.target(parsed)
    const resolved = resolveOwner(name, session, given, directory, output)
    if (resolved.kind === 'exit') return resolved.code
    built = command.build(parsed, { ...context, owner: resolved.owner })
  }
  const client = createSessionClient({ transport: opened.transport })
  const result = await attempt(() => client.submit(built.request))
  if (result === undefined) return usageError(output, unrecognized(name))
  const code = report(name, result, built.echo, output)
  if (command.kind !== 'creating') return code

  const session =
    result.kind === 'response' && result.message.outcome === 'succeeded'
      ? text(result.message.body, 'session')
      : ''
  if (session === '') return code
  const saved = writeSessionOwners(directory, new Map(owners).set(session, tenantText(loginTenant)))
  if (saved.kind === 'written') return code
  const reason = saved.code === undefined ? '' : `: ${saved.code}`
  output.stderr(`omne ${name}: cannot write session records ${saved.path}${reason}
`)
  return 1
}

const createSession: CreatingCommand<{
  definition: string
  purpose: string
  createCallId: string | undefined
}> = {
  kind: 'creating',
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

const sendInput: ExistingCommand<
  Omit<Targeted, 'controlId'> & {
    text: string
    acceptId: string | undefined
    inputId: string | undefined
  }
> = {
  kind: 'existing',
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
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { state, owner: tenant, newId }) => {
    const messageId = newId()
    const acceptId = parsed.acceptId ?? newId()
    const inputId = parsed.inputId ?? newId()
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

const cancelRun: ExistingCommand<Targeted & { run: string; urgency: 'graceful' | 'force' }> = {
  kind: 'existing',
  name: 'cancel-run',
  accepted: ['--session', '--run', '--urgency', '--tenant', '--control-id', serverOption],
  required: ['--session', '--run'],
  parse: values => {
    const target = targeted(values)
    const urgency = values.get('--urgency') ?? 'graceful'
    if (target === undefined || (urgency !== 'graceful' && urgency !== 'force')) return undefined
    return { ...target, run: values.get('--run') ?? '', urgency }
  },
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { state, owner: tenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
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

const stopCall: ExistingCommand<Targeted & { kind: 'model' | 'tool'; call: string }> = {
  kind: 'existing',
  name: 'stop-call',
  accepted: ['--session', '--producer-kind', '--call', '--tenant', '--control-id', serverOption],
  required: ['--session', '--producer-kind', '--call'],
  parse: values => {
    const target = targeted(values)
    const kind = values.get('--producer-kind')
    if (target === undefined || (kind !== 'model' && kind !== 'tool')) return undefined
    return { ...target, kind, call: values.get('--call') ?? '' }
  },
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { state, owner: tenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
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

/** The commands of the command surface, in the order the help lists them. */
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
    name: 'read-history',
    usage: '--session <id>',
    summary: 'Read the whole history of a session.',
    run: runReadHistory,
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
  ...governanceCommands,
  credentialCommand,
]
