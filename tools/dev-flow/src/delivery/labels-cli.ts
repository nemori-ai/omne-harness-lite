#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { IntegrationError } from '../integration/parse.ts'
import { runGhRead } from './github-read.ts'
import { syncLabels } from './labels.ts'
import { LINES_PATH, parseDeliveryLines } from './lines.ts'
import { InputError, parseConfig } from './protocol.ts'

const usage = 'Usage: labels-cli.ts --issue <number> [--apply] [--config <file>] [--lines <file>]'
const repositoryFile = (path: string) =>
  fileURLToPath(new URL(`../../../../${path}`, import.meta.url))

function options(args: string[]): { issue: number; apply: boolean; config: string; lines: string } {
  const values = new Map<string, string>()
  let apply = false
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--apply' && !apply) {
      apply = true
      continue
    }
    const value = args[index + 1]
    if (
      flag === undefined ||
      !['--issue', '--config', '--lines'].includes(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new InputError(usage)
    values.set(flag, value)
    index += 1
  }
  const issue = Number(values.get('--issue'))
  if (!Number.isSafeInteger(issue) || issue < 1) throw new InputError(usage)
  return {
    issue,
    apply,
    config: values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json'),
    lines: values.get('--lines') ?? repositoryFile(LINES_PATH),
  }
}
const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
try {
  const args = options(process.argv.slice(2))
  const result = syncLabels({
    repository: parseConfig(json(args.config)).repository,
    number: args.issue,
    apply: args.apply,
    lines: parseDeliveryLines(json(args.lines)),
    call: runGhRead,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.verified === false) process.exitCode = 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read the card, the rules or GitHub. API output omitted.'
  process.stderr.write(`${JSON.stringify({ kind: 'labels-error', message })}\n`)
  process.exitCode = 2
}
