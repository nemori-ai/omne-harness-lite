#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IntegrationError } from '../integration/parse.ts'
import { readBaseline, renderBaselineBlock } from './baseline.ts'
import { runGhRead } from './github-read.ts'
import { InputError, issueNumberArgument, parseConfig } from './protocol.ts'
import { readJson, repositoryFile } from './repository-files.ts'

const usage = 'Usage: baseline-cli.ts read <Issue number> --out <file> [--config <file>]'

function options(args: readonly string[]): { issue: number; out: string; config: string } {
  const [command, number, ...rest] = args
  const issue = number === undefined ? undefined : issueNumberArgument(number)
  if (command !== 'read' || issue === undefined) throw new InputError(usage)
  const values = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index] ?? '',
      value = rest[index + 1]
    if (
      !['--out', '--config'].includes(key) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(key)
    )
      throw new InputError(usage)
    values.set(key, value)
  }
  const out = values.get('--out')
  if (out === undefined) throw new InputError(usage)
  return {
    issue,
    out: resolve(out),
    config: values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json'),
  }
}
/**
 * Reads the contract baseline registered in the comments of a baseline card and writes the
 * merged `json omne-contract-baseline:v1` block to `--out`, for `omne-contract-api --baseline`.
 * Only GET requests. Standard output is the JSON result. Exit 0 when the file is written, 1 when
 * the registrations are refused (no file), 2 on bad arguments or a failed read.
 */
function main(args: readonly string[]): number {
  const { issue, out, config } = options(args)
  const read = readBaseline({
    repository: parseConfig(readJson(config)).repository,
    issue,
    call: runGhRead,
  })
  if (read.kind === 'refused') {
    process.stdout.write(`${JSON.stringify({ issue, ...read }, null, 2)}\n`)
    for (const problem of read.problems)
      process.stderr.write(
        `baseline: ${problem.code}${problem.comment === null ? '' : ` ${problem.comment}`}: ${problem.message}\n`,
      )
    return 1
  }
  writeFileSync(out, renderBaselineBlock(read.baseline))
  process.stdout.write(`${JSON.stringify({ issue, out, ...read }, null, 2)}\n`)
  return 0
}
try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read the configuration or GitHub. API output omitted.'
  process.stderr.write(`${JSON.stringify({ kind: 'baseline-error', message })}\n`)
  process.exitCode = 2
}
