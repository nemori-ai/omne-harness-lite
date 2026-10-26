#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { IntegrationError } from '../integration/parse.ts'
import { runGhCommand } from './github-read.ts'
import { LINES_PATH, parseDeliveryLines } from './lines.ts'
import { InputError, issueNumberArgument, parseConfig } from './protocol.ts'
import { readJson, repositoryFile } from './repository-files.ts'
import { fileScope, issueScope, scopeOverlap } from './scope-overlap.ts'

const usage =
  'Usage: scope-cli.ts <Issue number | binding file>... [--include-closed] [--config <file>] [--lines <file>]'

type Input = { kind: 'issue'; number: number } | { kind: 'file'; path: string }
function options(args: string[]): {
  inputs: Input[]
  config: string
  lines: string
  includeClosed: boolean
} {
  const values = new Map<string, string>(),
    inputs: Input[] = []
  let includeClosed = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (arg === '--include-closed' && !includeClosed) includeClosed = true
    else if (arg === '--config' || arg === '--lines') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || values.has(arg))
        throw new InputError(usage)
      values.set(arg, value)
      index += 1
    } else if (arg.startsWith('--') || arg === '') throw new InputError(usage)
    else if (/^#?[1-9]\d*$/.test(arg)) {
      const number = issueNumberArgument(arg)
      if (number === undefined) throw new InputError(usage)
      inputs.push({ kind: 'issue', number })
    } else inputs.push({ kind: 'file', path: arg })
  }
  if (inputs.length === 0) throw new InputError(usage)
  return {
    inputs,
    config: values.get('--config') ?? repositoryFile('docs/engineering/github-delivery.json'),
    lines: values.get('--lines') ?? repositoryFile(LINES_PATH),
    includeClosed,
  }
}
try {
  const args = options(process.argv.slice(2)),
    repository = parseConfig(readJson(args.config)).repository,
    table = parseDeliveryLines(readJson(args.lines))
  const cards = args.inputs.map(input =>
    input.kind === 'issue'
      ? issueScope(repository, input.number, runGhCommand)
      : fileScope(input.path, readFileSync(input.path, 'utf8')),
  )
  const result = scopeOverlap(cards, table, { includeClosed: args.includeClosed })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  for (const conflict of result.conflicts)
    process.stderr.write(
      `scope-overlap: ${conflict.first} ${conflict.firstPath} <-> ${conflict.second} ${conflict.secondPath}\n`,
    )
  if (result.conflicts.length > 0) process.exitCode = 1
} catch (error) {
  const message =
    error instanceof InputError || error instanceof IntegrationError
      ? error.message
      : 'Cannot read a card, a binding file, the line table or GitHub. API output omitted.'
  process.stderr.write(`${JSON.stringify({ kind: 'scope-error', message })}\n`)
  process.exitCode = 2
}
