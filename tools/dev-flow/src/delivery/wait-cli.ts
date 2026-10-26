#!/usr/bin/env node
import { errorCode, type AtomicPredicate, type EventPredicate, type PullKey } from './events.ts'
import { githubReconcile, originRepository } from './events-gh.ts'
import { WaitTimeout, waitForEvent } from './events-wait.ts'
import { runGhCommand } from './github-read.ts'
import { InputError, issueNumberArgument } from './protocol.ts'
import { repositoryFile } from './repository-files.ts'

const usage = [
  'Usage: wait-cli.ts issue-closed --issue <number> [common]',
  '       wait-cli.ts pr-ready --base <branch> [--ignore <pr>@<head> ...] [common]',
  '       wait-cli.ts comment --issue <number> --marker <name> [common]',
  '       wait-cli.ts any [--issue-closed <number> ...] [--comment <issue>:<marker> ...] [common]',
  'common: [--file <event file>] [--timeout <seconds>] [--since <ISO time or delivery id>] [--repo <owner/name>]',
].join('\n')

const common = ['--file', '--timeout', '--since', '--repo']
const perCommand: Record<string, readonly string[]> = {
  'issue-closed': ['--issue', ...common],
  'pr-ready': ['--base', '--ignore', ...common],
  comment: ['--issue', '--marker', ...common],
  any: ['--issue-closed', '--comment', ...common],
}
/** The flags that may appear more than once. */
const repeatable = new Set(['--ignore', '--issue-closed', '--comment'])

function options(args: string[]): { command: string; values: Map<string, string[]> } {
  const [command = '', ...rest] = args
  const allowed = perCommand[command]
  if (allowed === undefined) throw new InputError(usage)
  const values = new Map<string, string[]>()
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] ?? '',
      value = rest[index + 1]
    if (
      !allowed.includes(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      (values.has(flag) && !repeatable.has(flag))
    )
      throw new InputError(usage)
    values.set(flag, [...(values.get(flag) ?? []), value])
  }
  return { command, values }
}
function single(values: Map<string, string[]>, flag: string): string | undefined {
  return values.get(flag)?.[0]
}
function issueOf(value: string | undefined): number {
  const issue = issueNumberArgument(value ?? '')
  if (issue === undefined) throw new InputError(usage)
  return issue
}
/** `<pr>@<head>` with the full head sha: 40 hexadecimal digits, or 64 for SHA-256. */
function ignoreOf(value: string): PullKey {
  const match = /^([1-9]\d*)@([0-9a-fA-F]+)$/.exec(value)
  if (match === null) throw new InputError(usage)
  const head = match[2] ?? ''
  if (head.length !== 40 && head.length !== 64)
    throw new InputError(
      `--ignore ${value}: the head must be the full commit sha, 40 or 64 hexadecimal digits. A short sha never matches.`,
    )
  return { number: Number(match[1]), head: head.toLowerCase() }
}
function commentOf(issue: number, marker: string | undefined): AtomicPredicate {
  if (marker === undefined || marker === '') throw new InputError(usage)
  return { kind: 'comment', issue, marker }
}
function predicateOf(command: string, values: Map<string, string[]>): EventPredicate {
  if (command === 'issue-closed')
    return { kind: 'issue-closed', issue: issueOf(single(values, '--issue')) }
  if (command === 'comment')
    return commentOf(issueOf(single(values, '--issue')), single(values, '--marker'))
  if (command === 'any') {
    const of: AtomicPredicate[] = [
      ...(values.get('--issue-closed') ?? []).map((issue): AtomicPredicate => ({
        kind: 'issue-closed',
        issue: issueOf(issue),
      })),
      ...(values.get('--comment') ?? []).map(value => {
        const split = value.indexOf(':')
        return commentOf(issueOf(value.slice(0, Math.max(split, 0))), value.slice(split + 1))
      }),
    ]
    if (of.length === 0) throw new InputError(usage)
    return { kind: 'any', of }
  }
  const base = single(values, '--base')
  if (base === undefined || base === '') throw new InputError(usage)
  return { kind: 'pr-ready', base, ignore: (values.get('--ignore') ?? []).map(ignoreOf) }
}

try {
  const { command, values } = options(process.argv.slice(2))
  const predicate = predicateOf(command, values),
    timeout = single(values, '--timeout'),
    since = single(values, '--since')
  const seconds = timeout === undefined ? undefined : Number(timeout)
  if (seconds !== undefined && !(Number.isFinite(seconds) && seconds > 0))
    throw new InputError(usage)
  const repository = single(values, '--repo') ?? originRepository()
  const result = await waitForEvent({
    file: single(values, '--file') ?? repositoryFile('tmp/github-events/events.jsonl'),
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
          : 'Cannot read the event file or reconcile with GitHub. API output omitted.',
      code = error instanceof InputError ? undefined : errorCode(error)
    process.stderr.write(
      `${JSON.stringify({ kind: 'wait-error', message, ...(code === undefined ? {} : { code }) })}\n`,
    )
    process.exitCode = 2
  }
}
