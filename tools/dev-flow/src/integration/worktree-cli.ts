#!/usr/bin/env node
import { basename, dirname, resolve } from 'node:path'
import { runGhCommand } from '../delivery/github-read.ts'
import { InputError, issueNumberArgument, parseConfig } from '../delivery/protocol.ts'
import { readJson, repositoryFile } from '../delivery/repository-files.ts'
import { repository } from './git.ts'
import { IntegrationError } from './parse.ts'
import {
  issueBinding,
  prepareWorktree,
  regenerateProjections,
  removeWorktree,
  swapWorktree,
} from './worktree.ts'

const usage = `Usage:
  worktree-cli.ts prepare --issue <N> --tree <dir> [--evidence <dir>] [--root <main checkout>] [--remote <name>] [--config <file>]
  worktree-cli.ts swap --issue <N> --old <dir> --tree <dir> [--root <main checkout>] [--remote <name>] [--config <file>]
  worktree-cli.ts projections [--tree <dir>]
  worktree-cli.ts remove --tree <dir> [--root <main checkout>] [--force]`

const ALLOWED = {
  prepare: {
    values: ['--issue', '--tree', '--evidence', '--root', '--remote', '--config'],
    flags: [],
  },
  swap: { values: ['--issue', '--old', '--tree', '--root', '--remote', '--config'], flags: [] },
  projections: { values: ['--tree'], flags: [] },
  remove: { values: ['--tree', '--root'], flags: ['--force'] },
} as const
type Command = keyof typeof ALLOWED
function isCommand(value: string | undefined): value is Command {
  return value !== undefined && Object.hasOwn(ALLOWED, value)
}
function options(args: string[]): {
  command: Command
  values: Map<string, string>
  flags: Set<string>
} {
  const [first, ...rest] = args
  if (!isCommand(first)) throw new InputError(usage)
  const allowed: readonly string[] = ALLOWED[first].values,
    switches: readonly string[] = ALLOWED[first].flags,
    values = new Map<string, string>(),
    flags = new Set<string>()
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index] ?? ''
    if (switches.includes(flag) && !flags.has(flag)) {
      flags.add(flag)
      continue
    }
    const value = rest[index + 1]
    if (
      !allowed.includes(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new InputError(usage)
    values.set(flag, value)
    index += 1
  }
  return { command: first, values, flags }
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
function run(command: Command, values: ReadonlyMap<string, string>, flags: ReadonlySet<string>) {
  const remote = values.get('--remote') ?? 'origin'
  switch (command) {
    case 'projections': {
      const tree = resolve(values.get('--tree') ?? process.cwd())
      regenerateProjections(tree)
      return { tree, checkAgents: 'pass' }
    }
    case 'remove':
      return removeWorktree({
        root: resolve(values.get('--root') ?? mainCheckout()),
        tree: resolve(required(values, '--tree')),
        force: flags.has('--force'),
      })
    case 'prepare':
      return prepareWorktree({
        root: resolve(values.get('--root') ?? mainCheckout()),
        tree: resolve(required(values, '--tree')),
        binding: cardBinding(values),
        remote,
        evidence: values.get('--evidence'),
      })
    case 'swap':
      return swapWorktree({
        root: resolve(values.get('--root') ?? mainCheckout()),
        old: resolve(required(values, '--old')),
        tree: resolve(required(values, '--tree')),
        binding: cardBinding(values),
        remote,
      })
  }
}

try {
  const { command, values, flags } = options(process.argv.slice(2))
  const result = run(command, values, flags)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  // Without --force, remove only lists what removal would delete.
  if ('removed' in result && !result.removed) process.exitCode = 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read the card or run a step. API output omitted.'
  const code = error instanceof IntegrationError ? error.code : 'input-error'
  process.stderr.write(`${JSON.stringify({ kind: 'worktree-error', code, message })}\n`)
  process.exitCode = 2
}
