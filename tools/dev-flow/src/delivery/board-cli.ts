#!/usr/bin/env node
import { parseCliOptions } from './cli-options.ts'
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
  const { values, flags } = parseCliOptions(
    rest,
    { values: ['--issue', '--date', '--config'], flags: ['--dry-run'] },
    usage,
  )
  const issue = issueNumberArgument(values.get('--issue') ?? ''),
    date = values.get('--date')
  if (issue === undefined) throw new InputError(usage)
  return {
    event,
    issue,
    date: date === undefined ? undefined : calendarDate(date, '--date'),
    dryRun: flags.has('--dry-run'),
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
  const kind = args.event === 'dispatched' ? cardKind(card.attributes) : undefined
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
