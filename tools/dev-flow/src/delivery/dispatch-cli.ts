#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IntegrationError, json } from '../integration/parse.ts'
import { parseTaskBinding } from './binding.ts'
import {
  bindCard,
  cardAdmission,
  dispatchComment,
  dispatchDecision,
  DISPATCH_PLACEHOLDER,
  parseDispatchSpec,
  planDispatch,
  postDispatch,
  taskBaseInputs,
} from './dispatch.ts'
import { runGhCommand } from './github-read.ts'
import { InputError, parseConfig, text } from './protocol.ts'
import { readJson, repositoryFile } from './repository-files.ts'

const usage = `Usage:
  dispatch-cli.ts post --spec <spec.json> --text <prose.md> [--out <binding.json>] [--root <checkout>] [--dry-run]
  dispatch-cli.ts bind --binding <binding.json> [--worktree <path>] [--config <file>] [--dry-run]`

const ALLOWED = {
  post: ['--spec', '--text', '--out', '--root'],
  bind: ['--binding', '--worktree', '--config'],
} as const
type Command = keyof typeof ALLOWED
function options(args: string[]): {
  command: Command
  values: Map<string, string>
  dryRun: boolean
} {
  const [first, ...rest] = args
  if (first !== 'post' && first !== 'bind') throw new InputError(usage)
  const allowed: readonly string[] = ALLOWED[first],
    values = new Map<string, string>()
  let dryRun = false
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index] ?? ''
    if (flag === '--dry-run' && !dryRun) {
      dryRun = true
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
  return { command: first, values, dryRun }
}
function required(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag)
  if (value === undefined) throw new InputError(usage)
  return value
}

function post(values: ReadonlyMap<string, string>, dryRun: boolean): number {
  const spec = parseDispatchSpec(readJson(required(values, '--spec'))),
    prose = readFileSync(required(values, '--text'), 'utf8'),
    root = resolve(values.get('--root') ?? process.cwd())
  const { policy, config, lines } = taskBaseInputs(root, spec.taskBase)
  const actor = text(
    (runGhCommand(['api', '--method', 'GET', 'user'], 15_000) as Record<string, unknown>).login,
    'user.login',
  )
  const plan = planDispatch({
    spec,
    config,
    capture: cardAdmission(config, spec.issue, runGhCommand),
    lines,
    policy,
    actor,
  })
  if (dryRun) {
    const { binding, decision } = dispatchDecision(plan, DISPATCH_PLACEHOLDER, spec.basis)
    process.stdout.write(
      `${JSON.stringify({ applied: false, binding, comment: dispatchComment(prose, decision) }, null, 2)}\n`,
    )
    return 0
  }
  const result = postDispatch({
    repository: config.repository,
    plan,
    basis: spec.basis,
    prose,
    call: runGhCommand,
  })
  const out = values.get('--out')
  if (out !== undefined) writeFileSync(out, `${JSON.stringify(result.binding, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ applied: true, ...result }, null, 2)}\n`)
  return result.verified ? 0 : 1
}
function bind(values: ReadonlyMap<string, string>, dryRun: boolean): number {
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
    dryRun,
    call: runGhCommand,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result.applied && result.verified !== true ? 1 : 0
}

try {
  const { command, values, dryRun } = options(process.argv.slice(2))
  process.exitCode = command === 'post' ? post(values, dryRun) : bind(values, dryRun)
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read an input, the checkout or GitHub. API output omitted.'
  const code = error instanceof IntegrationError ? error.code : 'input-error'
  process.stderr.write(`${JSON.stringify({ kind: 'dispatch-error', code, message })}\n`)
  process.exitCode = 2
}
