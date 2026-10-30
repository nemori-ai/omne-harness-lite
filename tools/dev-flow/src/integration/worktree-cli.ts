#!/usr/bin/env node
import { parseCliOptions } from '../delivery/cli-options.ts'
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
  WorktreeStepError,
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
  const { values, flags } = parseCliOptions(rest, ALLOWED[first], usage)
  return { command: first, values, flags }
}
function required(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag)
  if (value === undefined) throw new InputError(usage)
  return value
}
/**
 * The phase the command is in. An error that is neither an input error nor an integration error
 * is reported with the phase name. `github` marks a phase whose error may carry the raw GitHub
 * API output, which is omitted.
 */
let phase: { name: string; github: boolean } = { name: 'read the arguments', github: false }
/** Runs `work` as the named phase. On an error the phase stays, so the report names it. */
function inPhase<T>(name: string, work: () => T, github = false): T {
  const previous = phase
  phase = { name, github }
  const result = work()
  phase = previous
  return result
}
/** The main checkout that owns the current directory's Git common directory. */
function mainCheckout(): string {
  return inPhase('find the main checkout', () => {
    const common = repository(process.cwd()).commonDir
    if (basename(common) !== '.git')
      throw new InputError('Cannot derive the main checkout; pass --root')
    return dirname(common)
  })
}
function cardBinding(values: ReadonlyMap<string, string>) {
  const number = issueNumberArgument(required(values, '--issue'))
  if (number === undefined) throw new InputError(usage)
  const config = inPhase('read the delivery config', () =>
    parseConfig(
      readJson(values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json')),
    ),
  )
  return inPhase(
    `read the binding of Issue #${number} from GitHub`,
    () => issueBinding(config.repository, number, runGhCommand),
    true,
  )
}
function run(command: Command, values: ReadonlyMap<string, string>, flags: ReadonlySet<string>) {
  const remote = values.get('--remote') ?? 'origin'
  switch (command) {
    case 'projections': {
      const tree = resolve(values.get('--tree') ?? process.cwd())
      inPhase('projections', () => regenerateProjections(tree))
      return { tree, checkAgents: 'pass' }
    }
    case 'remove': {
      const input = {
        root: resolve(values.get('--root') ?? mainCheckout()),
        tree: resolve(required(values, '--tree')),
        force: flags.has('--force'),
      }
      return inPhase('remove', () => removeWorktree(input))
    }
    case 'prepare': {
      const input = {
        root: resolve(values.get('--root') ?? mainCheckout()),
        tree: resolve(required(values, '--tree')),
        binding: cardBinding(values),
        remote,
        evidence: values.get('--evidence'),
      }
      return inPhase('prepare', () => prepareWorktree(input))
    }
    case 'swap': {
      const input = {
        root: resolve(values.get('--root') ?? mainCheckout()),
        old: resolve(required(values, '--old')),
        tree: resolve(required(values, '--tree')),
        binding: cardBinding(values),
        remote,
      }
      return inPhase('swap', () => swapWorktree(input))
    }
  }
}
/** The message of an error that is neither an input error nor an integration error. */
function unexpected(error: unknown): string {
  const type = error instanceof Error ? error.name : typeof error
  if (phase.github) return `${phase.name} failed (${type}). API output omitted.`
  const detail = error instanceof Error ? error.message : String(error)
  return `${phase.name} failed (${type}): ${detail}`
}

try {
  const { command, values, flags } = options(process.argv.slice(2))
  const result = run(command, values, flags)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  // Without --force, remove only lists what removal would delete. With --force, `removed` is
  // false when the directory is still on the disk, and the output gives the reason.
  if ('removed' in result && !result.removed) process.exitCode = 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : unexpected(error)
  const code = error instanceof IntegrationError ? error.code : 'input-error'
  // A step that failed after prepare or swap changed the disk also gives the finished steps,
  // the commands that continue the run, and the copy of the task directory.
  const steps =
    error instanceof WorktreeStepError
      ? { done: error.done, resume: error.resume, evidence: error.evidence ?? null }
      : {}
  process.stderr.write(`${JSON.stringify({ kind: 'worktree-error', code, message, ...steps })}\n`)
  process.exitCode = 2
}
