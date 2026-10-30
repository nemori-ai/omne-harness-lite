#!/usr/bin/env node
import { parseCliOptions } from './cli-options.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IntegrationError, json } from '../integration/parse.ts'
import { parseTaskBinding } from './binding.ts'
import {
  bindCard,
  cardAdmission,
  dispatchComment,
  dispatchDecision,
  dispatchProse,
  DISPATCH_PLACEHOLDER,
  parseDispatchSpec,
  planDispatch,
  postDispatch,
  recordPosted,
  taskBaseInputs,
} from './dispatch.ts'
import { runGhCommand } from './github-read.ts'
import { InputError, parseConfig, record, text } from './protocol.ts'
import { readJson, repositoryFile } from './repository-files.ts'

const usage = `Usage:
  dispatch-cli.ts post --spec <spec.json> --text <prose.md> [--out <binding.json>] [--root <checkout>] [--dry-run] [--force]
  dispatch-cli.ts bind --binding <binding.json> [--worktree <path>] [--config <file>] [--dry-run]`

const ALLOWED = {
  post: { values: ['--spec', '--text', '--out', '--root'], flags: ['--dry-run', '--force'] },
  bind: { values: ['--binding', '--worktree', '--config'], flags: ['--dry-run'] },
} as const
type Command = keyof typeof ALLOWED
function options(args: string[]): {
  command: Command
  values: Map<string, string>
  flags: Set<string>
} {
  const [first, ...rest] = args
  if (first !== 'post' && first !== 'bind') throw new InputError(usage)
  const { values, flags } = parseCliOptions(rest, ALLOWED[first], usage)
  return { command: first, values, flags }
}
function required(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag)
  if (value === undefined) throw new InputError(usage)
  return value
}

function post(values: ReadonlyMap<string, string>, flags: ReadonlySet<string>): number {
  // Refuse an empty text before any GitHub call: nothing is written for it.
  const prose = dispatchProse(readFileSync(required(values, '--text'), 'utf8'))
  const spec = parseDispatchSpec(readJson(required(values, '--spec'))),
    root = resolve(values.get('--root') ?? process.cwd())
  const { policy, config, lines } = taskBaseInputs(root, spec.taskBase)
  const actor = text(
    record(runGhCommand(['api', '--method', 'GET', 'user'], 15_000), 'user').login,
    'user.login',
  )
  const plan = planDispatch({
    spec,
    config,
    capture: cardAdmission(config, spec.issue, runGhCommand),
    lines,
    policy,
    actor,
    force: flags.has('--force'),
  })
  // The card body edits of a new revision: printed by a dry run, written by a formal post.
  const cardEdits =
    plan.revise === undefined
      ? undefined
      : { from: plan.revise.from, to: plan.revise.to, edits: plan.revise.edits }
  if (flags.has('--dry-run')) {
    const { binding, decision } = dispatchDecision(plan, DISPATCH_PLACEHOLDER, spec.basis)
    const comment = dispatchComment(prose, decision)
    process.stdout.write(
      `${JSON.stringify({ applied: false, cardEdits, binding, comment }, null, 2)}\n`,
    )
    return 0
  }
  const out = values.get('--out')
  const result = postDispatch({
    repository: config.repository,
    plan,
    basis: spec.basis,
    prose,
    call: runGhCommand,
    // Keep the dispatch before the readback: a failed readback must not lose the URL.
    onPosted: posted => recordPosted(posted, out, line => process.stderr.write(line)),
  })
  process.stdout.write(`${JSON.stringify({ applied: true, cardEdits, ...result }, null, 2)}\n`)
  return result.verified ? 0 : 1
}
function bind(values: ReadonlyMap<string, string>, flags: ReadonlySet<string>): number {
  const path = required(values, '--binding')
  const binding = parseTaskBinding(json(readFileSync(path, 'utf8'), path))
  if (binding.schemaVersion !== 2)
    throw new InputError('bind writes version 2 bindings only; dispatch a new attempt with post')
  const config = parseConfig(
    readJson(values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json')),
  )
  const result = bindCard({
    repository: config.repository,
    binding,
    worktree: values.get('--worktree'),
    dryRun: flags.has('--dry-run'),
    call: runGhCommand,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result.applied && !result.verified ? 1 : 0
}

try {
  const { command, values, flags } = options(process.argv.slice(2))
  process.exitCode = command === 'post' ? post(values, flags) : bind(values, flags)
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read an input, the checkout or GitHub. API output omitted.'
  const code = error instanceof IntegrationError ? error.code : 'input-error'
  process.stderr.write(`${JSON.stringify({ kind: 'dispatch-error', code, message })}\n`)
  process.exitCode = 2
}
