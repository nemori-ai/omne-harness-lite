import { modelProtocol } from '@omne-harness/model-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import {
  sessionProtocol,
  userMessage,
  type UserAttachment,
  type SessionProtocol,
} from '@omne-harness/session-protocol'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  localFailure,
  missingOption,
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
  instantOption,
  type Option,
} from './command-support.ts'
import { runReadSessionDiagnostics } from './diagnostics-command.ts'
import { governanceCommands } from './governance-commands.ts'
import { hitlCommands } from './hitl-commands.ts'
import { runReadHistory } from './history-command.ts'
import { runSearch } from './search-command.ts'
import { writeLoginState } from './login-state.ts'
import { openLink, type CallResult, type Link } from './link.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'
import { readSessionOwners, writeSessionOwners } from './session-owners.ts'
import { assetCommand } from './asset-command.ts'
import { settingCommand } from './setting-command.ts'
import { calendarCommand } from './calendar-command.ts'
import { usageCommands } from './usage-command.ts'
import { scheduleCommand } from './schedule-command.ts'
import { notificationCommand } from './notification-command.ts'
import { mediaCommand, readUpload, sendUpload } from './media-command.ts'
import { workspaceCommand } from './workspace-command.ts'
import { callsCommand } from './calls-command.ts'

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
  if (name === 'register' && environment.homeFlag !== undefined)
    return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const server = serverOf(read.values, environment)
  if (server.kind === 'invalid') return localFailure(output, server.message)
  const opened = openLink(environment, server.origin)
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
  const body = { loginIdentifier, credential: credential.value }
  const result = await opened.link.call(
    identityProtocol,
    name === 'register' ? 'register-and-activate' : 'issue-login',
    body,
    messageId,
  )
  if (result === undefined) return usageError(output, unrecognized(name))

  const echo = { messageId }
  if (name === 'register') return report(name, result, echo, output)

  const issued = result.kind === 'response' && result.outcome === 'succeeded'
  const saved = issued
    ? writeLoginState(directory, {
        version: 1,
        server: opened.link.origin,
        loginIdentifier: text(result.body, 'loginIdentifier'),
        issuedAt: text(result.body, 'issuedAt'),
        tenantId: text(result.body, 'tenantId'),
        loginProof: text(result.body, 'loginProof'),
        loginId: text(result.body, 'loginId'),
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
  readonly newId: () => string
}

type Stop = Readonly<{ usage: string }> | Readonly<{ local: string }>

type Built = {
  readonly send: (link: Link) => Promise<CallResult | Stop | undefined>
  readonly echo: RequestEcho
  readonly note?: () => string | null
}

interface SessionCommandBase<Parsed> {
  readonly name: string
  readonly accepted: readonly string[]
  readonly required: readonly string[]
  readonly switches?: readonly string[]
  readonly repeatable?: readonly string[]
  readonly parse: (
    values: Option,
    lists: ReadonlyMap<string, readonly string[]>,
  ) => Parsed | undefined
}

interface CreatingCommand<Parsed> extends SessionCommandBase<Parsed> {
  readonly kind: 'creating'
  readonly build: (parsed: Parsed, context: SessionContext & { loginTenant: TenantId }) => Built
}

interface ExistingCommand<Parsed> extends SessionCommandBase<Parsed> {
  readonly kind: 'existing'
  readonly target: (parsed: Parsed) => {
    readonly session: string
    readonly tenant: TenantId | undefined
  }
  readonly build: (parsed: Parsed, context: SessionContext & { owner: TenantId }) => Built
}

interface TenantCommand<Parsed> extends SessionCommandBase<Parsed> {
  readonly kind: 'tenant'
  readonly tenant: (parsed: Parsed) => TenantId | undefined
  readonly build: (parsed: Parsed, context: SessionContext & { tenant: TenantId }) => Built
}

type SessionCommand<Parsed> =
  | CreatingCommand<Parsed>
  | ExistingCommand<Parsed>
  | TenantCommand<Parsed>

type Login = Exclude<ReturnType<typeof loadLogin>, { kind: 'exit' }>
type Prepared =
  | Readonly<{ built: Built; owners: ReadonlyMap<string, string> }>
  | Readonly<{ exit: ExitCode }>
const NO_OWNERS: ReadonlyMap<string, string> = new Map()

function prepare<Parsed>(
  command: SessionCommand<Parsed>,
  parsed: Parsed,
  login: Login,
  context: Readonly<{ newId: () => string }>,
  output: CliOutput,
): Prepared {
  const { directory, tenant: loginTenant } = login
  if (command.kind === 'creating') {
    // The records are read before anything is sent, so a damaged file stops the command before a
    // session exists that the file cannot take.
    const records = readSessionOwners(directory)
    if (records.kind === 'failure') return { exit: localFailure(output, records.message) }
    return { built: command.build(parsed, { ...context, loginTenant }), owners: records.owners }
  }
  if (command.kind === 'tenant') {
    const tenant = command.tenant(parsed) ?? loginTenant
    return { built: command.build(parsed, { ...context, tenant }), owners: NO_OWNERS }
  }
  const { session, tenant: given } = command.target(parsed)
  const resolved = resolveOwner(command.name, session, given, directory, output)
  if (resolved.kind === 'exit') return { exit: resolved.code }
  return { built: command.build(parsed, { ...context, owner: resolved.owner }), owners: NO_OWNERS }
}

function recordCreated(
  name: string,
  session: string,
  owners: ReadonlyMap<string, string>,
  login: Login,
  output: CliOutput,
): ExitCode | null {
  const owner = encodeTenantText(login.tenant)
  const saved = writeSessionOwners(login.directory, new Map(owners).set(session, owner))
  if (saved.kind === 'written') return null
  const reason = saved.code === undefined ? '' : `: ${saved.code}`
  output.stderr(`omne ${name}: cannot write session records ${saved.path}${reason}
`)
  return 1
}

const sent = (result: CallResult | Stop | undefined): result is CallResult =>
  result !== undefined && 'kind' in result

function stopped(name: string, stop: Stop | undefined, output: CliOutput): ExitCode {
  if (stop === undefined) return usageError(output, unrecognized(name))
  if ('usage' in stop) return usageError(output, `omne ${name}: ${stop.usage}\n`)
  return localFailure(output, `omne ${name}: ${stop.local}\n`)
}

async function runSession<Parsed>(
  command: SessionCommand<Parsed>,
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { name } = command
  const { accepted, required, switches = [], repeatable = [] } = command
  const read = readOptions(args, { accepted, required, switches, repeatable })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const parsed = command.parse(read.values, read.lists)
  if (parsed === undefined) return usageError(output, unrecognized(name))

  const loaded = loadLogin(read.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const prepared = prepare(command, parsed, loaded, { newId: environment.services.newId }, output)
  if ('exit' in prepared) return prepared.exit
  const { built, owners } = prepared
  const result = await built.send(loaded.link)
  if (!sent(result)) return stopped(name, result, output)
  const code = report(name, result, built.echo, output)
  const note = built.note?.() ?? null
  if (note !== null) output.stderr(`omne ${name}: ${note}\n`)
  if (command.kind !== 'creating') return code

  const session =
    result.kind === 'response' && result.outcome === 'succeeded' ? text(result.body, 'session') : ''
  if (session === '') return code
  return recordCreated(name, session, owners, loaded, output) ?? code
}

type WorkspaceTarget = Readonly<{ workspace: string; instance: string }>

function workspaceOption(values: Option): WorkspaceTarget | null | undefined {
  const workspace = values.get('--workspace')
  const instance = values.get('--instance')
  if (workspace === undefined && instance === undefined) return null
  return workspace && instance ? { workspace, instance } : undefined
}

const createSession: CreatingCommand<{
  definition: string
  purpose: string
  model: string | undefined
  workspace: WorkspaceTarget | null
  createCallId: string | undefined
}> = {
  kind: 'creating',
  name: 'create-session',
  accepted: [
    '--definition',
    '--purpose',
    '--model',
    '--workspace',
    '--instance',
    '--create-call-id',
    serverOption,
  ],
  required: ['--definition'],
  parse: values => {
    const model = values.get('--model')
    const workspace = workspaceOption(values)
    if (model === '' || workspace === undefined) return undefined
    return {
      definition: values.get('--definition') ?? '',
      purpose: values.get('--purpose') ?? '',
      model,
      workspace,
      createCallId: values.get('--create-call-id'),
    }
  },
  build: (parsed, { loginTenant, newId }) => {
    const messageId = newId()
    const createCallId = parsed.createCallId ?? newId()
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'create-session',
          {
            createCallId,
            definition: parsed.definition,
            purpose: parsed.purpose,
            ...(parsed.model === undefined ? {} : { model: parsed.model }),
            ...(parsed.workspace === null ? {} : { workspace: parsed.workspace }),
          },
          messageId,
        ),
      echo: { messageId, createCallId, tenant: encodeTenantText(loginTenant) },
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

type InputCommand = ExistingCommand<
  Omit<Targeted, 'controlId'> & {
    text: string
    attach: readonly string[]
    model: string | undefined
    acceptId: string | undefined
    inputId: string | undefined
  }
>

function attachmentKind(mediaType: string): 'image' | 'voice' | 'file' {
  if (mediaType.startsWith('image/')) return 'image'
  return mediaType.startsWith('audio/') ? 'voice' : 'file'
}

// An ordinary input and an urgent one share their body, their queue and their query (C27).
const inputCommand = (name: 'send-input' | 'interrupt-input'): InputCommand => ({
  kind: 'existing',
  name,
  accepted: [
    '--session',
    '--text',
    '--attach',
    '--model',
    '--tenant',
    '--accept-id',
    '--input-id',
    serverOption,
  ],
  required: ['--session'],
  repeatable: ['--attach'],
  parse: (values, lists) => {
    const target = targeted(values)
    const model = values.get('--model')
    const text = values.get('--text') ?? ''
    const attach = lists.get('--attach') ?? []
    if (target === undefined || model === '') return undefined
    if (text === '' && attach.length === 0) return undefined
    return {
      session: target.session,
      tenant: target.tenant,
      text,
      attach,
      model,
      acceptId: values.get('--accept-id'),
      inputId: values.get('--input-id'),
    }
  },
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    const acceptId = parsed.acceptId ?? newId()
    const inputId = parsed.inputId ?? newId()
    const { session, model } = parsed
    let unselected = false
    let refused: string | null = null
    return {
      // Every file is read before anything is sent; then each is uploaded, a model is selected
      // under a control identity the accept identity gives, and the message goes last.
      send: async link => {
        const files = []
        for (const file of parsed.attach) {
          const read = await readUpload(file)
          if (!('file' in read)) return read
          files.push(read)
        }
        const attachments: UserAttachment[] = []
        for (const read of files) {
          const { result, ref } = await sendUpload({ link, tenant, newId }, read, newId())
          if (ref === null) {
            refused = read.file
            return result
          }
          attachments.push({ kind: attachmentKind(read.mediaType), ref })
        }
        if (model !== undefined) {
          const select = { tenant, session, controlId: `model:${acceptId}`, model }
          const selected = await link.call(sessionProtocol, 'select-model', select, newId())
          unselected = selected?.kind !== 'response' || selected.outcome !== 'succeeded'
          if (unselected) return selected
        }
        const message = await userMessage({ inputId, text: parsed.text, attachments })
        return link.call(
          sessionProtocol,
          name,
          { tenant, session, acceptId, inputId, message },
          messageId,
        )
      },
      echo: { messageId, acceptId, inputId, tenant: encodeTenantText(tenant) },
      note: () => {
        if (refused !== null)
          return `the attachment ${refused} was not taken; the input was not sent`
        return unselected ? 'the model was not selected; the input was not sent' : null
      },
    }
  },
})

const sendInput = inputCommand('send-input')
const interruptInput = inputCommand('interrupt-input')

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
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'cancel-run',
          { tenant, session: parsed.session, controlId, run: parsed.run, urgency: parsed.urgency },
          messageId,
        ),
      echo: { messageId, controlId, tenant: encodeTenantText(tenant) },
    }
  },
}

// Archive and unarchive are controls of the session: a control id makes a retry the same one.
const sessionControl = (
  name: 'archive-session' | 'unarchive-session',
): ExistingCommand<Targeted> => ({
  kind: 'existing',
  name,
  accepted: ['--session', '--tenant', '--control-id', serverOption],
  required: ['--session'],
  parse: targeted,
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
    return {
      send: link =>
        link.call(sessionProtocol, name, { tenant, session: parsed.session, controlId }, messageId),
      echo: { messageId, controlId, tenant: encodeTenantText(tenant) },
    }
  },
})

type PermissionModeName = BodyOf<SessionProtocol['operations']['change-permission-mode']>['mode']
const PERMISSION_MODES: readonly PermissionModeName[] = [
  'never',
  'auto_permission',
  'bypass-permissions',
]
type ModeTarget = Omit<Targeted, 'controlId'>

const modeTarget = (values: Option): ModeTarget | undefined => {
  const target = targeted(values)
  return target === undefined ? undefined : { session: target.session, tenant: target.tenant }
}

const readPermissionMode: ExistingCommand<ModeTarget> = {
  kind: 'existing',
  name: 'read-permission-mode',
  accepted: ['--session', '--tenant', serverOption],
  required: ['--session'],
  parse: modeTarget,
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'read-permission-mode',
          { tenant, session: parsed.session },
          messageId,
        ),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

const POSITION = /^(0|[1-9][0-9]*)$/u
const DEFAULT_PENDING_LIMIT = 50

type PendingTarget = ModeTarget & { after: string | null; limit: number }

function pendingTarget(values: Option): PendingTarget | undefined {
  const target = modeTarget(values)
  const after = values.get('--after') ?? null
  const limit = Number(values.get('--limit') ?? DEFAULT_PENDING_LIMIT)
  if (target === undefined || !Number.isInteger(limit) || limit < 1) return undefined
  if (after !== null && !POSITION.test(after)) return undefined
  return { ...target, after, limit }
}

const readPending: ExistingCommand<PendingTarget> = {
  kind: 'existing',
  name: 'read-pending',
  accepted: ['--session', '--tenant', '--after', '--limit', serverOption],
  required: ['--session'],
  parse: pendingTarget,
  target: ({ session, tenant }) => ({ session, tenant }),
  build: ({ session, after, limit }, { owner: tenant, newId }) => {
    const messageId = newId()
    return {
      send: link =>
        link.call(sessionProtocol, 'read-pending', { tenant, session, after, limit }, messageId),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

const readWaitingCalls: ExistingCommand<ModeTarget> = {
  kind: 'existing',
  name: 'read-waiting-calls',
  accepted: ['--session', '--tenant', serverOption],
  required: ['--session'],
  parse: modeTarget,
  target: ({ session, tenant }) => ({ session, tenant }),
  build: ({ session }, { owner: tenant, newId }) => {
    const messageId = newId()
    return {
      send: link =>
        link.call(sessionProtocol, 'read-waiting-calls', { tenant, session }, messageId),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

const readInputFate: ExistingCommand<ModeTarget & { inputId: string }> = {
  kind: 'existing',
  name: 'read-input-fate',
  accepted: ['--session', '--tenant', '--input-id', serverOption],
  required: ['--session', '--input-id'],
  parse: values => {
    const target = modeTarget(values)
    return target === undefined ? undefined : { ...target, inputId: values.get('--input-id') ?? '' }
  },
  target: ({ session, tenant }) => ({ session, tenant }),
  build: ({ session, inputId }, { owner: tenant, newId }) => {
    const messageId = newId()
    return {
      send: link =>
        link.call(sessionProtocol, 'read-input-fate', { tenant, session, inputId }, messageId),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

// The change names the revision it was read at, so a change made meanwhile answers conflict.
const changePermissionMode: ExistingCommand<
  ModeTarget & { mode: PermissionModeName; expectedRevision: string }
> = {
  kind: 'existing',
  name: 'change-permission-mode',
  accepted: ['--session', '--tenant', '--mode', '--expected-revision', serverOption],
  required: ['--session', '--mode', '--expected-revision'],
  parse: values => {
    const target = modeTarget(values)
    const mode = PERMISSION_MODES.find(name => name === values.get('--mode'))
    if (target === undefined || mode === undefined) return undefined
    return { ...target, mode, expectedRevision: values.get('--expected-revision') ?? '' }
  },
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    const { session, mode, expectedRevision } = parsed
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'change-permission-mode',
          { tenant, session, mode, expectedRevision },
          messageId,
        ),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

type ArchivedFilters = BodyOf<SessionProtocol['operations']['list-archived-sessions']>
type By = NonNullable<ArchivedFilters['by']>
const BY = ['person', 'auto', 'parent'] as const
const LIMIT = /^[1-9][0-9]*$/

type ListFilters = BodyOf<SessionProtocol['operations']['list-sessions']>
const RELATIONS = ['main', 'child', 'handoff'] as const
const ATTENDANCES = ['attended', 'unattended'] as const
const RELATION_OPTIONS = ['--relation', '--parent', '--attendance', '--definition'] as const
const PAGE_OPTIONS = ['--tenant', '--cursor', '--limit', ...RELATION_OPTIONS] as const

const RELATION_USAGE =
  '[--relation <kind>] [--parent <id>] [--attendance <who>] [--definition <name>]'

const oneOf = <T extends string>(allowed: readonly T[], value: string | undefined) =>
  value === undefined ? null : allowed.includes(value as T) ? (value as T) : undefined

const present = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, member]) => member !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>
  }

/** What both lists read alike: the tenant, the page, and the relation filters that were given. */
function listFilters(values: Option): (ListFilters & { given: TenantId | undefined }) | undefined {
  const given = tenantOption(values)
  const limit = values.get('--limit')
  const relation = oneOf(RELATIONS, values.get('--relation'))
  const attendance = oneOf(ATTENDANCES, values.get('--attendance'))
  if (given === null || relation === undefined || attendance === undefined) return undefined
  if (limit !== undefined && !LIMIT.test(limit)) return undefined
  return {
    given,
    tenant: given as TenantId,
    cursor: values.get('--cursor') ?? null,
    ...present({
      limit: limit === undefined ? undefined : Number(limit),
      relation: relation ?? undefined,
      parent: values.get('--parent'),
      attendance: attendance ?? undefined,
      definition: values.get('--definition'),
    }),
  }
}

function archivedFilters(
  values: Option,
): (ArchivedFilters & { given: TenantId | undefined }) | undefined {
  const page = listFilters(values)
  const from = instantOption(values, '--since')
  const to = instantOption(values, '--before')
  const by = values.get('--by') ?? null
  if (page === undefined || from === undefined || to === undefined) return undefined
  if (by !== null && !BY.includes(by as (typeof BY)[number])) return undefined
  return { ...page, from, to, by: by as By | null, titleContains: values.get('--title') ?? null }
}

const listSessions: TenantCommand<NonNullable<ReturnType<typeof listFilters>>> = {
  kind: 'tenant',
  name: 'list-sessions',
  accepted: [...PAGE_OPTIONS, serverOption],
  required: [],
  parse: listFilters,
  tenant: parsed => parsed.given,
  build: ({ given: _given, ...filters }, { tenant, newId }) => {
    const messageId = newId()
    return {
      send: link => link.call(sessionProtocol, 'list-sessions', { ...filters, tenant }, messageId),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

const listArchivedSessions: TenantCommand<NonNullable<ReturnType<typeof archivedFilters>>> = {
  kind: 'tenant',
  name: 'list-archived-sessions',
  accepted: [...PAGE_OPTIONS, '--since', '--before', '--by', '--title', serverOption],
  required: [],
  parse: archivedFilters,
  tenant: parsed => parsed.given,
  build: ({ given: _given, ...filters }, { tenant, newId }) => {
    const messageId = newId()
    return {
      send: link =>
        link.call(sessionProtocol, 'list-archived-sessions', { ...filters, tenant }, messageId),
      echo: { messageId, tenant: encodeTenantText(tenant) },
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
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'stop-call',
          {
            tenant,
            session: parsed.session,
            controlId,
            producer: { kind: parsed.kind, call: parsed.call },
          },
          messageId,
        ),
      echo: { messageId, controlId, tenant: encodeTenantText(tenant) },
    }
  },
}

const selectModel: ExistingCommand<Targeted & { model: string }> = {
  kind: 'existing',
  name: 'select-model',
  accepted: ['--session', '--model', '--tenant', '--control-id', serverOption],
  required: ['--session', '--model'],
  parse: values => {
    const target = targeted(values)
    const model = values.get('--model') ?? ''
    if (target === undefined || model === '') return undefined
    return { ...target, model }
  },
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'select-model',
          { tenant, session: parsed.session, controlId, model: parsed.model },
          messageId,
        ),
      echo: { messageId, controlId, tenant: encodeTenantText(tenant) },
    }
  },
}

const selectWorkspace: ExistingCommand<Targeted & { workspace: WorkspaceTarget | null }> = {
  kind: 'existing',
  name: 'select-workspace',
  accepted: ['--session', '--workspace', '--instance', '--tenant', '--control-id', serverOption],
  required: ['--session'],
  switches: ['--none'],
  parse: values => {
    const target = targeted(values)
    const workspace = workspaceOption(values)
    if (target === undefined || workspace === undefined) return undefined
    if (values.has('--none') === (workspace !== null)) return undefined
    return { ...target, workspace }
  },
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    const controlId = parsed.controlId ?? newId()
    const { session, workspace } = parsed
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'select-workspace',
          { tenant, session, controlId, workspace },
          messageId,
        ),
      echo: { messageId, controlId, tenant: encodeTenantText(tenant) },
    }
  },
}

const readModelSelection: ExistingCommand<Targeted> = {
  kind: 'existing',
  name: 'read-model-selection',
  accepted: ['--session', '--tenant', serverOption],
  required: ['--session'],
  parse: targeted,
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'read-model-selection',
          { tenant, session: parsed.session },
          messageId,
        ),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

const readWorkspaceSelection: ExistingCommand<Targeted> = {
  kind: 'existing',
  name: 'read-workspace-selection',
  accepted: ['--session', '--tenant', serverOption],
  required: ['--session'],
  parse: targeted,
  target: ({ session, tenant }) => ({ session, tenant }),
  build: (parsed, { owner: tenant, newId }) => {
    const messageId = newId()
    return {
      send: link =>
        link.call(
          sessionProtocol,
          'read-workspace-selection',
          { tenant, session: parsed.session },
          messageId,
        ),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

const listModels: TenantCommand<{ given: TenantId | undefined }> = {
  kind: 'tenant',
  name: 'list-models',
  accepted: ['--tenant', serverOption],
  required: [],
  parse: values => {
    const given = tenantOption(values)
    return given === null ? undefined : { given }
  },
  tenant: parsed => parsed.given,
  build: (_parsed, { tenant, newId }) => {
    const messageId = newId()
    return {
      send: link => link.call(modelProtocol, 'list-models', { tenant }, messageId),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
}

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
    usage: '--definition <name> [--model <route>] [--workspace <id> --instance <id>]',
    summary: 'Create a session, in a workspace when one is named.',
    run: (args, output, environment) => runSession(createSession, args, output, environment),
  },
  {
    name: 'send-input',
    usage: '--session <id> [--text <text>] [--attach <file>]... [--model <route>]',
    summary:
      'Send a user message to a session: words, files (each --attach is uploaded first), or both.',
    run: (args, output, environment) => runSession(sendInput, args, output, environment),
  },
  {
    name: 'interrupt-input',
    usage: '--session <id> [--text <text>] [--attach <file>]... [--model <route>]',
    summary: 'Send an urgent user message: it releases what the run waits for, or is ordinary.',
    run: (args, output, environment) => runSession(interruptInput, args, output, environment),
  },
  {
    name: 'read-history',
    usage: '--session <id>',
    summary: 'Read the whole history of a session.',
    run: runReadHistory,
  },
  {
    name: 'search',
    usage: '(--text <literal> | --words <words> | --regex <pattern>)',
    summary: 'Search the history of all sessions of the tenant.',
    run: runSearch,
  },
  {
    name: 'read-session-diagnostics',
    usage: '--session <id>',
    summary: 'Read the diagnostics of the runs of a session.',
    run: runReadSessionDiagnostics,
  },
  {
    name: 'read-pending',
    usage: '--session <id> [--after <position>] [--limit <n>]',
    summary: 'List the inputs a session accepted that no run took yet, the oldest first.',
    run: (args, output, environment) => runSession(readPending, args, output, environment),
  },
  {
    name: 'read-waiting-calls',
    usage: '--session <id>',
    summary: 'List the calls of a session that wait for a person to answer a card.',
    run: (args, output, environment) => runSession(readWaitingCalls, args, output, environment),
  },
  {
    name: 'read-input-fate',
    usage: '--session <id> --input-id <id>',
    summary: 'Read where one input is now: pending, taken, answered, settled or refused.',
    run: (args, output, environment) => runSession(readInputFate, args, output, environment),
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
  {
    name: 'select-model',
    usage: '--session <id> --model <route>',
    summary: 'Select the model of a session: the next model request uses it.',
    run: (args, output, environment) => runSession(selectModel, args, output, environment),
  },
  {
    name: 'select-workspace',
    usage: '--session <id> (--workspace <id> --instance <id> | --none)',
    summary: 'Select the workspace a session works in, or none: it is in force from the next step.',
    run: (args, output, environment) => runSession(selectWorkspace, args, output, environment),
  },
  {
    name: 'read-workspace-selection',
    usage: '--session <id>',
    summary:
      'Read the workspace a session stands at, and the directory and state its step works in.',
    run: (args, output, environment) =>
      runSession(readWorkspaceSelection, args, output, environment),
  },
  {
    name: 'read-model-selection',
    usage: '--session <id>',
    summary: 'Read the model a session stands at now.',
    run: (args, output, environment) => runSession(readModelSelection, args, output, environment),
  },
  {
    name: 'list-models',
    usage: '[--tenant <tenant>]',
    summary: 'List the models of the tenant: which can be selected, and why one cannot.',
    run: (args, output, environment) => runSession(listModels, args, output, environment),
  },
  {
    name: 'archive-session',
    usage: '--session <id>',
    summary: 'Archive a session: its run ends and its background calls are withdrawn.',
    run: (args, output, environment) =>
      runSession(sessionControl('archive-session'), args, output, environment),
  },
  {
    name: 'unarchive-session',
    usage: '--session <id>',
    summary: 'Take a session back from the archive.',
    run: (args, output, environment) =>
      runSession(sessionControl('unarchive-session'), args, output, environment),
  },
  {
    name: 'read-permission-mode',
    usage: '--session <id>',
    summary: 'Read the permission mode of a session and the revision it stands at.',
    run: (args, output, environment) => runSession(readPermissionMode, args, output, environment),
  },
  {
    name: 'change-permission-mode',
    usage: '--session <id> --mode <mode> --expected-revision <n>',
    summary:
      'Change the permission mode of a session (never, auto_permission or bypass-permissions) at the revision read.',
    run: (args, output, environment) => runSession(changePermissionMode, args, output, environment),
  },
  {
    name: 'list-sessions',
    usage: RELATION_USAGE,
    summary:
      'List the sessions that are not archived, each with its relation (main, child or handoff) and who attends it (attended or unattended).',
    run: (args, output, environment) => runSession(listSessions, args, output, environment),
  },
  {
    name: 'list-archived-sessions',
    usage: '[--since <instant>] [--before <instant>] [--by person|auto|parent] [--title <text>]',
    summary:
      'List the archived sessions, the latest archived first. It takes the filters of list-sessions too.',
    run: (args, output, environment) => runSession(listArchivedSessions, args, output, environment),
  },
  callsCommand,
  ...hitlCommands,
  ...governanceCommands,
  calendarCommand,
  scheduleCommand,
  notificationCommand,
  workspaceCommand,
  settingCommand,
  assetCommand,
  mediaCommand,
  ...usageCommands,
]
