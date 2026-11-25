import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  serverOption,
  tenantOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'

type Operations = HumanInterventionProtocol['operations']
type CardState = BodyOf<Operations['list-cards']>['filter']['states'][number]
type Reply = BodyOf<Operations['submit-reply']>['reply']

const DECIMAL = /^(0|[1-9][0-9]*)$/
const DEFAULT_LIMIT = 100

interface Context {
  readonly messageId: string
  readonly tenant: TenantId
  readonly newId: () => string
}

type Built = {
  readonly send: (link: Link) => Promise<CallResult | undefined>
  readonly echo: RequestEcho
}

interface HitlCommand {
  readonly name: string
  readonly accepted: readonly string[]
  readonly required: readonly string[]
  readonly switches?: readonly string[]
  readonly build: (values: Option, context: Context) => Built | undefined
  readonly cards?: (body: unknown) => readonly unknown[]
}

type Row = Readonly<{ label: string; value: string | readonly string[] }>
type ReleaseQuestion = Readonly<{
  kind: 'release'
  target: Readonly<{ tool: string; command: string | null }>
  gateTitle: string
  origin?: Readonly<{ program?: true }>
  options: readonly Readonly<{ label: string; description: string; offered: boolean }>[]
  detail?: Readonly<{ state: 'given'; rows: readonly Row[] }> | Readonly<{ state: 'unavailable' }>
}>

const questionOf = (item: unknown): unknown =>
  (item as Readonly<{ card: Readonly<{ question: unknown }> }>).card.question

function isRelease(question: unknown): question is ReleaseQuestion {
  return (question as Readonly<{ kind: string }>).kind === 'release'
}

function releaseLines(question: ReleaseQuestion): string {
  const call = [question.target.tool, question.target.command].filter(Boolean).join(' ')
  const lines = [`放行卡：${call}`, `关口：${question.gateTitle}`]
  if (question.origin?.program === true) lines.push('来源：由程序发起')
  for (const option of question.options)
    lines.push(`  ${option.label}：${option.description}${option.offered ? '' : '（现在不能选）'}`)
  const { detail } = question
  if (detail?.state === 'unavailable') lines.push('工具没能给出这次调用的详情')
  if (detail?.state === 'given') {
    lines.push('详情：')
    for (const row of detail.rows)
      lines.push(
        `  ${row.label}：${typeof row.value === 'string' ? row.value : row.value.join('、')}`,
      )
  }
  return `${lines.join('\n')}\n`
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
  const loaded = loadLogin(read.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const built = command.build(read.values, {
    messageId: environment.services.newId(),
    tenant: given ?? loaded.tenant,
    newId: environment.services.newId,
  })
  if (built === undefined) return usageError(output, unrecognized(name))
  const result = await built.send(loaded.link)
  if (result === undefined) return usageError(output, unrecognized(name))
  const code = report(name, result, built.echo, output)
  printReleaseCards(command, result, output)
  return code
}

// The human channel also gets every release card the answer holds; the machine result stays as it was.
function printReleaseCards(command: HitlCommand, result: CallResult, output: CliOutput): void {
  if (command.cards === undefined || result.kind !== 'response' || result.outcome !== 'succeeded')
    return
  for (const question of command.cards(result.body).map(questionOf))
    if (isRelease(question)) output.stderr(releaseLines(question))
}

function cardOf(values: Option, tenant: TenantId) {
  return {
    request: { tenantRef: encodeTenantText(tenant), requestId: values.get('--request') ?? '' },
    cardId: values.get('--card') ?? '',
  }
}

const listCards: HitlCommand = {
  name: 'list-cards',
  accepted: ['--session', '--state', '--limit', '--cursor', '--tenant', serverOption],
  required: [],
  build: (values, { messageId, tenant }) => {
    const wanted = values.get('--state') ?? 'pending'
    const limitText = values.get('--limit') ?? String(DEFAULT_LIMIT)
    const limit = Number(limitText)
    if (!DECIMAL.test(limitText)) return undefined
    const session = values.get('--session')
    return {
      send: link =>
        link.call(
          humanInterventionProtocol,
          'list-cards',
          {
            tenant,
            filter: {
              states: [wanted as CardState],
              ...(session === undefined ? {} : { sessionRef: session }),
            },
            cursor: values.get('--cursor') ?? null,
            limit,
          },
          messageId,
        ),
      echo: { messageId, tenant: encodeTenantText(tenant) },
    }
  },
  cards: body => (body as Readonly<{ items: readonly unknown[] }>).items,
}

const readCard: HitlCommand = {
  name: 'read-card',
  accepted: ['--request', '--card', '--tenant', serverOption],
  required: ['--request', '--card'],
  build: (values, { messageId, tenant }) => ({
    send: link =>
      link.call(
        humanInterventionProtocol,
        'read-card',
        { tenant, card: cardOf(values, tenant) },
        messageId,
      ),
    echo: { messageId, tenant: encodeTenantText(tenant) },
  }),
  cards: body => [(body as Readonly<{ item: unknown }>).item],
}

function replyOf(values: Option): Reply | undefined {
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
  build: (values, { messageId, tenant, newId }) => {
    const reply = replyOf(values)
    const revision = values.get('--revision') ?? ''
    if (reply === undefined) return undefined
    const replyId = values.get('--reply-id') ?? newId()
    return {
      send: link =>
        link.call(
          humanInterventionProtocol,
          'submit-reply',
          { tenant, card: cardOf(values, tenant), expectedRevision: revision, reply, replyId },
          messageId,
        ),
      echo: { messageId, replyId, tenant: encodeTenantText(tenant) },
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
