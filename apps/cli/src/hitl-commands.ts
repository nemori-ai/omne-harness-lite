import {
  createHitlClient,
  tenantText,
  type HitlCardState,
  type HitlReply,
  type HitlRequest,
  type TenantId,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  attempt,
  loadLogin,
  missingOption,
  proofOf,
  serverOption,
  tenantOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import type { LoginState } from './login-state.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'

const DECIMAL = /^(0|[1-9][0-9]*)$/
const DEFAULT_LIMIT = 100

interface Context {
  readonly messageId: string
  readonly state: LoginState
  readonly tenant: TenantId
  readonly newId: () => string
}

type Built = { readonly request: HitlRequest; readonly echo: RequestEcho }

interface HitlCommand {
  readonly name: string
  readonly accepted: readonly string[]
  readonly required: readonly string[]
  readonly switches?: readonly string[]
  readonly build: (values: Option, context: Context) => Built | undefined
}

async function runHitl(
  command: HitlCommand,
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { name } = command
  const read = readOptions(args, {
    accepted: command.accepted,
    required: command.required,
    ...(command.switches === undefined ? {} : { switches: command.switches }),
  })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const given = tenantOption(read.values)
  if (given === null) return usageError(output, unrecognized(name))
  const loaded = loadLogin(read.values, output, environment, 'hitl')
  if (loaded.kind === 'exit') return loaded.code
  const built = command.build(read.values, {
    messageId: environment.services.newId(),
    state: loaded.state,
    tenant: given ?? loaded.tenant,
    newId: environment.services.newId,
  })
  if (built === undefined) return usageError(output, unrecognized(name))
  const client = createHitlClient({ transport: loaded.opened.transport })
  const result = await attempt(() => client.submit(built.request))
  if (result === undefined) return usageError(output, unrecognized(name))
  return report(name, result, built.echo, output)
}

function cardOf(values: Option, tenant: TenantId) {
  return {
    request: { tenantRef: tenantText(tenant), requestId: values.get('--request') ?? '' },
    cardId: values.get('--card') ?? '',
  }
}

const listCards: HitlCommand = {
  name: 'list-cards',
  accepted: ['--session', '--state', '--limit', '--cursor', '--tenant', serverOption],
  required: [],
  build: (values, { messageId, state, tenant }) => {
    const wanted = values.get('--state') ?? 'pending'
    const limitText = values.get('--limit') ?? String(DEFAULT_LIMIT)
    const limit = Number(limitText)
    if (!DECIMAL.test(limitText)) return undefined
    const session = values.get('--session')
    return {
      request: {
        protocolVersion: 'hitl-public/1',
        messageId,
        operation: 'list-cards',
        proof: proofOf(state),
        body: {
          tenant,
          filter: {
            states: [wanted as HitlCardState],
            ...(session === undefined ? {} : { sessionRef: session }),
          },
          cursor: values.get('--cursor') ?? null,
          limit,
        },
      },
      echo: { messageId, tenant: tenantText(tenant) },
    }
  },
}

const readCard: HitlCommand = {
  name: 'read-card',
  accepted: ['--request', '--card', '--tenant', serverOption],
  required: ['--request', '--card'],
  build: (values, { messageId, state, tenant }) => ({
    request: {
      protocolVersion: 'hitl-public/1',
      messageId,
      operation: 'read-card',
      proof: proofOf(state),
      body: { tenant, card: cardOf(values, tenant) },
    },
    echo: { messageId, tenant: tenantText(tenant) },
  }),
}

function replyOf(values: Option): HitlReply | undefined {
  const option = values.get('--option')
  const text = values.get('--text')
  const declined = values.has('--decline')
  if ([option !== undefined, text !== undefined, declined].filter(Boolean).length !== 1)
    return undefined
  if (option !== undefined) return { kind: 'selection', optionId: option }
  if (text !== undefined) return { kind: 'text', text }
  return { kind: 'decline' }
}

const submitReply: HitlCommand = {
  name: 'submit-reply',
  accepted: [
    '--request',
    '--card',
    '--revision',
    '--option',
    '--text',
    '--reply-id',
    '--tenant',
    serverOption,
  ],
  required: ['--request', '--card', '--revision'],
  switches: ['--decline'],
  build: (values, { messageId, state, tenant, newId }) => {
    const reply = replyOf(values)
    const revision = values.get('--revision') ?? ''
    if (reply === undefined) return undefined
    const replyId = values.get('--reply-id') ?? newId()
    return {
      request: {
        protocolVersion: 'hitl-public/1',
        messageId,
        operation: 'submit-reply',
        proof: proofOf(state),
        body: { tenant, card: cardOf(values, tenant), expectedRevision: revision, reply, replyId },
      },
      echo: { messageId, replyId, tenant: tenantText(tenant) },
    }
  },
}

const run =
  (command: HitlCommand): CommandSpec['run'] =>
  (args, output, environment) =>
    runHitl(command, args, output, environment)

export const hitlCommands: readonly CommandSpec[] = [
  {
    name: 'list-cards',
    usage: '',
    summary: 'List the cards that wait for a person.',
    run: run(listCards),
  },
  {
    name: 'read-card',
    usage: '--request <id> --card <id>',
    summary: 'Read one card.',
    run: run(readCard),
  },
  {
    name: 'submit-reply',
    usage: '--request <id> --card <id> --revision <name>',
    summary: 'Reply to a card with an option, a text or a decline.',
    run: run(submitReply),
  },
]
