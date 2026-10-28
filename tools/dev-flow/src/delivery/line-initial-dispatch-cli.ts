#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { IntegrationError } from '../integration/parse.ts'
import { collaborationJson } from './collaboration-json.ts'
import {
  generateInitialDispatch,
  initialDispatchFields,
  INITIAL_DISPATCH_TEMPLATE,
  parseInitialDispatchInput,
  parseRehearsalEvidence,
  validateInitialDispatch,
} from './line-initial-dispatch.ts'
import { InputError } from './protocol.ts'

export const initialDispatchUsage = `Usage:
  line-initial-dispatch-cli.ts fields
  line-initial-dispatch-cli.ts render --input FILE [--root OUTPUT_CHECKOUT]
  line-initial-dispatch-cli.ts validate --input FILE --rehearsal-evidence FILE [--root OUTPUT_CHECKOUT]
The template in this checkout supplies the message structure. Input is schemaVersion=1,
milestone, line slug, revision, and every named string field from fields.
Output is tmp/milestone-N/dispatch/LINE-rREVISION.md. Same bytes reuse the file;
changed bytes require a new revision. Rehearsal evidence is schemaVersion=1,
messageSha256 of the rendered message, and commands[] with command, optional
executed, exitCode and outputSummary. validate checks structure, exact bytes and that
every command in a shell code block of the message has an evidence entry.
The reduce owner must verify the returned guards before VALIDATED.
This command never opens a window, sends a message, claims a task, or executes commands.`

/** A source checkout is the supported executable artifact; the template is read from it. */
function toolRoot(): string {
  const directory = dirname(fileURLToPath(import.meta.url))
  if (!directory.endsWith('/tools/dev-flow/src/delivery'))
    throw new InputError('initial-dispatch-source-runtime-required')
  return resolve(directory, '../../../..')
}

export function initialDispatchMain(args: string[], templateRoot = toolRoot()): number {
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
    options: {
      input: { type: 'string' },
      root: { type: 'string' },
      'rehearsal-evidence': { type: 'string' },
    },
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
  const evidencePath = parsed.values['rehearsal-evidence']
  const input = parseInitialDispatchInput(
    collaborationJson(readFileSync(parsed.values.input, 'utf8')),
  )
  const root = resolve(parsed.values.root ?? process.cwd())
  if (command === 'render') {
    if (evidencePath !== undefined) throw new InputError('initial-dispatch-render-options')
    process.stdout.write(JSON.stringify(generateInitialDispatch(root, template, input)) + '\n')
    return 0
  }
  if (evidencePath === undefined)
    throw new InputError('initial-dispatch-rehearsal-evidence-required')
  const evidence = parseRehearsalEvidence(collaborationJson(readFileSync(evidencePath, 'utf8')))
  process.stdout.write(
    JSON.stringify(validateInitialDispatch(root, template, input, evidence)) + '\n',
  )
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
