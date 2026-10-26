#!/usr/bin/env node
import type { EventPredicate } from './events.ts'
import { githubReconcile, originRepository } from './events-gh.ts'
import { WaitTimeout, waitForEvent } from './events-wait.ts'
import { runGhCommand } from './github-read.ts'
import { InputError, issueNumberArgument } from './protocol.ts'
import { repositoryFile } from './repository-files.ts'

const usage = [
  'Usage: wait-cli.ts issue-closed --issue <number> [common]',
  '       wait-cli.ts pr-ready --base <branch> [common]',
  '       wait-cli.ts comment --issue <number> --marker <name> [common]',
  'common: [--file <event file>] [--timeout <seconds>] [--since <ISO time or delivery id>] [--repo <owner/name>]',
].join('\n')

const common = ['--file', '--timeout', '--since', '--repo']
const perCommand: Record<string, readonly string[]> = {
  'issue-closed': ['--issue', ...common],
  'pr-ready': ['--base', ...common],
  comment: ['--issue', '--marker', ...common],
}

function options(args: string[]): { command: string; values: Map<string, string> } {
  const [command = '', ...rest] = args
  const allowed = perCommand[command]
  if (allowed === undefined) throw new InputError(usage)
  const values = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] ?? '',
      value = rest[index + 1]
    if (
      !allowed.includes(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new InputError(usage)
    values.set(flag, value)
  }
  return { command, values }
}
function issueOf(values: Map<string, string>): number {
  const issue = issueNumberArgument(values.get('--issue') ?? '')
  if (issue === undefined) throw new InputError(usage)
  return issue
}
function predicateOf(command: string, values: Map<string, string>): EventPredicate {
  if (command === 'issue-closed') return { kind: 'issue-closed', issue: issueOf(values) }
  const marker = values.get('--marker'),
    base = values.get('--base')
  if (command === 'comment') {
    if (marker === undefined || marker === '') throw new InputError(usage)
    return { kind: 'comment', issue: issueOf(values), marker }
  }
  if (base === undefined || base === '') throw new InputError(usage)
  return { kind: 'pr-ready', base }
}

try {
  const { command, values } = options(process.argv.slice(2))
  const predicate = predicateOf(command, values),
    timeout = values.get('--timeout'),
    since = values.get('--since')
  const seconds = timeout === undefined ? undefined : Number(timeout)
  if (seconds !== undefined && !(Number.isFinite(seconds) && seconds > 0))
    throw new InputError(usage)
  const repository = values.get('--repo') ?? originRepository()
  const result = await waitForEvent({
    file: values.get('--file') ?? repositoryFile('tmp/github-events/events.jsonl'),
    predicate,
    ...(since === undefined ? {} : { since }),
    ...(seconds === undefined ? {} : { timeoutMs: Math.round(seconds * 1000) }),
    reconcile: githubReconcile(repository, runGhCommand),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  if (error instanceof WaitTimeout) {
    process.stderr.write(
      `${JSON.stringify({ kind: 'wait-timeout', message: `${error.message}. Nothing matched, the condition may still be open.` })}\n`,
    )
    process.exitCode = 3
  } else {
    const message =
      error instanceof InputError
        ? error.message
        : 'Cannot read the event file or reconcile with GitHub. API output omitted.'
    process.stderr.write(`${JSON.stringify({ kind: 'wait-error', message })}\n`)
    process.exitCode = 2
  }
}
