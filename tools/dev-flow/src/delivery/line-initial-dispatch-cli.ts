#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { IntegrationError } from '../integration/parse.ts'
import { collaborationToolRoot } from './collaboration-bootstrap.ts'
import { collaborationJson } from './collaboration-json.ts'
import {
  generateInitialDispatch,
  initialDispatchFields,
  INITIAL_DISPATCH_TEMPLATE,
  parseInitialDispatchInput,
  validateInitialDispatch,
} from './line-initial-dispatch.ts'
import { InputError } from './protocol.ts'

export const initialDispatchUsage = `Usage:
  line-initial-dispatch-cli.ts fields
  line-initial-dispatch-cli.ts render|validate --input FILE [--root OUTPUT_CHECKOUT]
The installed template supplies the message structure. Input is schemaVersion=1,
milestone, line slug, revision, and every named string field from fields.
Output is tmp/milestone-N/dispatch/LINE-rREVISION.md. Same bytes reuse the file;
changed bytes require a new revision. validate checks structure and exact bytes only.
The reduce owner must verify the returned authority/runtime/material guards before VALIDATED.
This command never opens a window, sends a message, claims a task, or executes input recipes.`

export function initialDispatchMain(
  args: string[],
  templateRoot = collaborationToolRoot(),
): number {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(initialDispatchUsage + '\n')
    return 0
  }
  const [command, ...rest] = args
  if (command !== 'fields' && command !== 'render' && command !== 'validate')
    throw new InputError(initialDispatchUsage)
  const parsed = parseArgs({
    args: rest,
    strict: true,
    tokens: true,
    options: { input: { type: 'string' }, root: { type: 'string' } },
  })
  const names = parsed.tokens.filter(token => token.kind === 'option').map(token => token.name)
  if (new Set(names).size !== names.length)
    throw new InputError('initial-dispatch-duplicate-option')
  const template = readFileSync(resolve(templateRoot, INITIAL_DISPATCH_TEMPLATE), 'utf8')
  if (command === 'fields') {
    if (names.length !== 0) throw new InputError('initial-dispatch-fields-options')
    process.stdout.write(
      JSON.stringify({ schemaVersion: 1, fields: initialDispatchFields(template) }) + '\n',
    )
    return 0
  }
  if (parsed.values.input === undefined) throw new InputError('initial-dispatch-input-required')
  const input = parseInitialDispatchInput(
    collaborationJson(readFileSync(parsed.values.input, 'utf8')),
  )
  const root = resolve(parsed.values.root ?? process.cwd())
  const result =
    command === 'render'
      ? generateInitialDispatch(root, template, input)
      : validateInitialDispatch(root, template, input)
  process.stdout.write(JSON.stringify(result) + '\n')
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = initialDispatchMain(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        kind: 'initial-dispatch-error',
        message:
          error instanceof InputError || error instanceof IntegrationError
            ? error.message
            : 'Cannot read input/template or write the temporary message.',
      }) + '\n',
    )
    process.exitCode = 2
  }
}
