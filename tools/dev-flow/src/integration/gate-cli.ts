#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { runGhCommand } from '../delivery/github-read.ts'
import { InputError, parseConfig } from '../delivery/protocol.ts'
import { readJson, repositoryFile } from '../delivery/repository-files.ts'
import { waitGate } from './gate.ts'
import { IntegrationError } from './parse.ts'

const usage =
  'Usage: gate-cli.ts wait --run <run id> --note <file> [--environments <name,...>] [--interval <seconds>] [--timeout <minutes>] [--config <file>]'

function options(args: string[]): Map<string, string> {
  const [first, ...rest] = args
  if (first !== 'wait') throw new InputError(usage)
  const allowed = ['--run', '--note', '--environments', '--interval', '--timeout', '--config'],
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
  return values
}
function positive(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!/^[1-9]\d*$/.test(value)) throw new InputError(usage)
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new InputError(usage)
  return number
}

try {
  const values = options(process.argv.slice(2))
  const run = positive(values.get('--run'), 0),
    notePath = values.get('--note')
  if (run === 0 || notePath === undefined) throw new InputError(usage)
  const config = parseConfig(
    readJson(values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json')),
  )
  const result = await waitGate({
    repository: config.repository,
    run,
    note: readFileSync(notePath, 'utf8'),
    // Only the publish confirmation by default; other approval environments are named explicitly.
    environments: (values.get('--environments') ?? 'publish')
      .split(',')
      .map(name => name.trim())
      .filter(name => name !== ''),
    call: runGhCommand,
    sleep: ms => delay(ms),
    now: () => Date.now(),
    intervalMs: positive(values.get('--interval'), 10) * 1000,
    timeoutMs: positive(values.get('--timeout'), 90) * 60_000,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.conclusion === 'success' ? 0 : 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read the run or approve it. API output omitted.'
  process.stderr.write(`${JSON.stringify({ kind: 'gate-error', message })}\n`)
  process.exitCode = 2
}
