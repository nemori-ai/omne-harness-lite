#!/usr/bin/env node
import { factsSource } from '../integration/delivery-facts.ts'
import { IntegrationError } from '../integration/parse.ts'
import { readTaskBinding } from './binding.ts'
import {
  boardEvent,
  boardEvents,
  BoardWriteError,
  cardKind,
  cardLine,
  recordBoardEvent,
  type BoardEvent,
} from './board.ts'
import { readIssueCard, REST_HEADERS, runGhCommand } from './github-read.ts'
import {
  calendarDate,
  calendarDay,
  InputError,
  issueNumberArgument,
  parseConfig,
  text,
} from './protocol.ts'
import { readJson, repositoryFile } from './repository-files.ts'

const usage = `Usage: board-cli.ts <${boardEvents.join('|')}> --issue <number> [--date <YYYY-MM-DD>] [--dry-run] [--config <file>]`

function options(args: string[]): {
  event: BoardEvent
  issue: number
  date: string | undefined
  dryRun: boolean
  config: string
} {
  const [first, ...rest] = args,
    event = boardEvents.find(item => item === first)
  if (event === undefined) throw new InputError(usage)
  const values = new Map<string, string>()
  let dryRun = false
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]
    if (flag === '--dry-run' && !dryRun) {
      dryRun = true
      continue
    }
    const value = rest[index + 1]
    if (
      flag === undefined ||
      !['--issue', '--date', '--config'].includes(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new InputError(usage)
    values.set(flag, value)
    index += 1
  }
  const issue = issueNumberArgument(values.get('--issue') ?? ''),
    date = values.get('--date')
  if (issue === undefined) throw new InputError(usage)
  return {
    event,
    issue,
    date: date === undefined ? undefined : calendarDate(date, '--date'),
    dryRun,
    config: values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json'),
  }
}
try {
  const args = options(process.argv.slice(2))
  if (factsSource(process.env) === 'workflow')
    throw new InputError(
      'A cloud session cannot reach GraphQL. Run this command from a local session; for Stage alone use the delivery-stage workflow.',
    )
  const delivery = parseConfig(readJson(args.config)),
    board = boardEvent(delivery, args.event)
  if (board === null)
    throw new InputError(`The delivery config enables no board writes for ${args.event}`)
  const repository = delivery.repository
  const card = readIssueCard(
    runGhCommand(
      ['api', '--method', 'GET', ...REST_HEADERS, `repos/${repository}/issues/${args.issue}`],
      15_000,
    ),
    repository,
    args.issue,
  )
  const id = text(card.issue.node_id, 'Issue.node_id')
  const line =
    args.event === 'dispatched'
      ? cardLine(
          readTaskBinding(card.body, { repository, number: args.issue, url: card.url, id }),
          card.attributes,
        )
      : undefined
  const kind = args.event === 'dispatched' ? cardKind(card.attributes.labels) : undefined
  const result = recordBoardEvent({
    config: board,
    issue: { id, url: card.url },
    date: args.date ?? calendarDay(board.timeZone, new Date()),
    line,
    kind,
    dryRun: args.dryRun,
    call: runGhCommand,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.applied && !result.verified) process.exitCode = 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read the configuration, the card or the Project. API output omitted.'
  const skipped = error instanceof BoardWriteError ? { skipped: error.skipped } : {}
  process.stderr.write(`${JSON.stringify({ kind: 'board-error', message, ...skipped })}\n`)
  process.exitCode = 2
}
