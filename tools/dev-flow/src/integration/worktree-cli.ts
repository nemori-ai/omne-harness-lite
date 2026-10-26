#!/usr/bin/env node
import { basename, dirname, resolve } from 'node:path'
import { runGhCommand } from '../delivery/github-read.ts'
import { InputError, issueNumberArgument, parseConfig } from '../delivery/protocol.ts'
import { readJson, repositoryFile } from '../delivery/repository-files.ts'
import { repository } from './git.ts'
import { IntegrationError } from './parse.ts'
import { issueBinding, prepareWorktree, regenerateProjections, swapWorktree } from './worktree.ts'

const usage = `Usage:
  worktree-cli.ts prepare --issue <N> --tree <dir> [--evidence <dir>] [--root <main checkout>] [--remote <name>] [--config <file>]
  worktree-cli.ts swap --issue <N> --old <dir> --tree <dir> [--root <main checkout>] [--remote <name>] [--config <file>]
  worktree-cli.ts projections [--tree <dir>]`

const ALLOWED = {
  prepare: ['--issue', '--tree', '--evidence', '--root', '--remote', '--config'],
  swap: ['--issue', '--old', '--tree', '--root', '--remote', '--config'],
  projections: ['--tree'],
} as const
type Command = keyof typeof ALLOWED
function options(args: string[]): { command: Command; values: Map<string, string> } {
  const [first, ...rest] = args
  if (first !== 'prepare' && first !== 'swap' && first !== 'projections')
    throw new InputError(usage)
  const allowed: readonly string[] = ALLOWED[first],
    values = new Map<string, string>()
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
  return { command: first, values }
}
function required(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag)
  if (value === undefined) throw new InputError(usage)
  return value
}
/** The main checkout that owns the current directory's Git common directory. */
function mainCheckout(): string {
  const common = repository(process.cwd()).commonDir
  if (basename(common) !== '.git')
    throw new InputError('Cannot derive the main checkout; pass --root')
  return dirname(common)
}
function cardBinding(values: ReadonlyMap<string, string>) {
  const number = issueNumberArgument(required(values, '--issue'))
  if (number === undefined) throw new InputError(usage)
  const config = parseConfig(
    readJson(values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json')),
  )
  return issueBinding(config.repository, number, runGhCommand)
}

try {
  const { command, values } = options(process.argv.slice(2))
  const remote = values.get('--remote') ?? 'origin'
  let result: unknown
  if (command === 'projections')
    result = regenerateProjections(resolve(values.get('--tree') ?? process.cwd()))
  else {
    const root = resolve(values.get('--root') ?? mainCheckout()),
      tree = resolve(required(values, '--tree')),
      binding = cardBinding(values)
    result =
      command === 'prepare'
        ? prepareWorktree({ root, tree, binding, remote, evidence: values.get('--evidence') })
        : swapWorktree({ root, old: resolve(required(values, '--old')), tree, binding, remote })
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read the card or run a step. API output omitted.'
  const code = error instanceof IntegrationError ? error.code : 'input-error'
  process.stderr.write(`${JSON.stringify({ kind: 'worktree-error', code, message })}\n`)
  process.exitCode = 2
}
