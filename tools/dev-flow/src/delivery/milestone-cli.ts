#!/usr/bin/env node
import { IntegrationError } from '../integration/parse.ts'
import {
  BOARD_CONFIG_PATH,
  createMilestoneView,
  MILESTONE_VIEW_MANUAL_STEPS,
  parseBoardConfig,
  type MilestoneView,
} from './board.ts'
import { runGhCommand } from './github-read.ts'
import { carryMilestone, createMilestone } from './milestone.ts'
import { InputError, parseConfig } from './protocol.ts'
import { readJson, repositoryFile } from './repository-files.ts'

const usage = [
  'Usage: milestone-cli.ts create <title> --due <YYYY-MM-DD> [--description <text>] [--config <file>] [--board <file>]',
  '       milestone-cli.ts carry --from <title> --to <title> --reason <text> <Issue number>... [--config <file>]',
].join('\n')

type Parsed = { command: string; positional: string[]; values: Map<string, string> }
function parse(args: string[], allowed: readonly string[]): Parsed {
  const [command = '', ...rest] = args,
    values = new Map<string, string>(),
    positional: string[] = []
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? ''
    if (arg.startsWith('--')) {
      const value = rest[index + 1]
      if (!allowed.includes(arg) || value === undefined || values.has(arg))
        throw new InputError(usage)
      values.set(arg, value)
      index += 1
    } else positional.push(arg)
  }
  return { command, positional, values }
}
function cloudSession(): boolean {
  return (
    process.env.CCR_AGENT_PROXY_ENABLED === '1' || process.env.OMNE_DELIVERY_FACTS === 'workflow'
  )
}
function create(args: string[]): { output: unknown; ok: boolean } {
  const { positional, values } = parse(args, ['--due', '--description', '--config', '--board'])
  const [title, ...extra] = positional,
    due = values.get('--due')
  if (title === undefined || extra.length > 0 || due === undefined) throw new InputError(usage)
  const repository = parseConfig(
      readJson(values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json')),
    ).repository,
    board = parseBoardConfig(readJson(values.get('--board') ?? repositoryFile(BOARD_CONFIG_PATH)))
  const description = values.get('--description')
  const milestone = createMilestone({
    repository,
    title,
    due,
    ...(description === undefined ? {} : { description }),
    call: runGhCommand,
  })
  const wanted = board.enabled && board.milestoneView
  let view: MilestoneView | { skipped: string } = {
    skipped: 'The board config disables the milestone view',
  }
  if (wanted) {
    if (cloudSession())
      view = {
        skipped: 'A cloud session cannot reach GraphQL; create the view from a local session',
      }
    else
      try {
        view = createMilestoneView({ config: board, title, call: runGhCommand })
      } catch (error) {
        view = {
          skipped: `View creation failed: ${error instanceof InputError ? error.message : 'API output omitted.'}`,
        }
      }
  }
  return {
    output: { ...milestone, view, manualSteps: 'id' in view ? MILESTONE_VIEW_MANUAL_STEPS : [] },
    // A wanted view that was not created leaves the run incomplete: exit 1 with the milestone kept.
    ok: milestone.verified && (!wanted || 'id' in view),
  }
}
function carry(args: string[]): { output: unknown; ok: boolean } {
  const { positional, values } = parse(args, ['--from', '--to', '--reason', '--config'])
  const from = values.get('--from'),
    to = values.get('--to'),
    reason = values.get('--reason')
  if (from === undefined || to === undefined || reason === undefined || positional.length === 0)
    throw new InputError(usage)
  const issues = positional.map(value => {
    if (!/^#?[1-9]\d*$/.test(value)) throw new InputError(usage)
    return Number(value.replace('#', ''))
  })
  const repository = parseConfig(
    readJson(values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json')),
  ).repository
  const cards = carryMilestone({ repository, from, to, issues, reason, call: runGhCommand })
  return { output: cards, ok: cards.every(card => card.verified) }
}
try {
  const args = process.argv.slice(2)
  const result =
    args[0] === 'create'
      ? create(args.slice(1))
      : args[0] === 'carry'
        ? carry(args.slice(1))
        : undefined
  if (result === undefined) throw new InputError(usage)
  process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read the configuration or GitHub. API output omitted.'
  process.stderr.write(`${JSON.stringify({ kind: 'milestone-error', message })}\n`)
  process.exitCode = 2
}
