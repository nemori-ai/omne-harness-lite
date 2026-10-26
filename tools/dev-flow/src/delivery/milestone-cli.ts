#!/usr/bin/env node
import { IntegrationError } from '../integration/parse.ts'
import { runGhCommand } from './github-read.ts'
import { carryMilestone, createMilestone, MILESTONE_VIEW_MANUAL_STEPS } from './milestone.ts'
import { InputError, issueNumberArgument, parseConfig } from './protocol.ts'
import { readJson, repositoryFile } from './repository-files.ts'

const usage = [
  'Usage: milestone-cli.ts create <title> --due <YYYY-MM-DD> [--description <text>] [--config <file>]',
  '       milestone-cli.ts carry --from <title> --to <title> --reason <text> <Issue number>... [--config <file>]',
].join('\n')

type Parsed = { positional: string[]; values: Map<string, string> }
function parse(args: string[], allowed: readonly string[]): Parsed {
  const values = new Map<string, string>(),
    positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (arg.startsWith('--')) {
      const value = args[index + 1]
      if (
        !allowed.includes(arg) ||
        value === undefined ||
        value.startsWith('--') ||
        values.has(arg)
      )
        throw new InputError(usage)
      values.set(arg, value)
      index += 1
    } else positional.push(arg)
  }
  return { positional, values }
}
function repositoryOf(values: Map<string, string>): string {
  return parseConfig(
    readJson(values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json')),
  ).repository
}
function create(args: string[]): { output: unknown; ok: boolean } {
  const { positional, values } = parse(args, ['--due', '--description', '--config'])
  const [title, ...extra] = positional,
    due = values.get('--due'),
    description = values.get('--description')
  if (title === undefined || extra.length > 0 || due === undefined) throw new InputError(usage)
  const milestone = createMilestone({
    repository: repositoryOf(values),
    title,
    due,
    ...(description === undefined ? {} : { description }),
    call: runGhCommand,
  })
  return {
    output: { ...milestone, manualSteps: MILESTONE_VIEW_MANUAL_STEPS },
    ok: milestone.verified,
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
    const issue = issueNumberArgument(value)
    if (issue === undefined) throw new InputError(usage)
    return issue
  })
  const cards = carryMilestone({
    repository: repositoryOf(values),
    from,
    to,
    issues,
    reason,
    call: runGhCommand,
  })
  return { output: cards, ok: cards.every(card => card.verified) }
}
try {
  const [command, ...rest] = process.argv.slice(2)
  const result = command === 'create' ? create(rest) : command === 'carry' ? carry(rest) : undefined
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
