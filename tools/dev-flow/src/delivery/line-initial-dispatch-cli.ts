#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { IntegrationError } from '../integration/parse.ts'
import { strictJson } from './strict-json.ts'
import {
  generateInitialDispatch,
  initialDispatchFields,
  INITIAL_DISPATCH_TEMPLATE,
  parseInitialDispatchInput,
  parseRehearsalEvidence,
  validateInitialDispatch,
} from './line-initial-dispatch.ts'
import { InputError } from './protocol.ts'
import { repositoryFile } from './repository-files.ts'

export const initialDispatchUsage = `Usage:
  line-initial-dispatch-cli.ts fields
  line-initial-dispatch-cli.ts render --input FILE [--root OUTPUT_CHECKOUT]
  line-initial-dispatch-cli.ts validate --input FILE --rehearsal-evidence FILE [--root OUTPUT_CHECKOUT]
The template in this checkout supplies the message structure. Input is schemaVersion=1,
milestone, line slug, revision, and every named string field from fields.
Output is tmp/milestone-N/dispatch/LINE-rREVISION.md. Same bytes reuse the file;
changed bytes require a new revision. Rehearsal evidence is schemaVersion=1,
messageSha256 of the rendered message, and commands[] with command, optional
executed, exitCode and outputSummary; one entry per command. validate checks structure,
exact bytes, that every fenced code block is a closed sh, bash, shell or zsh block, and
that every command in those blocks has an evidence entry.
The reduce owner must verify the returned guards before VALIDATED.
This command never opens a window, sends a message, claims a task, or executes commands.`

const OPTIONS = {
  input: { type: 'string' },
  root: { type: 'string' },
  'rehearsal-evidence': { type: 'string' },
} as const
type Subcommand = 'fields' | 'render' | 'validate'
type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values']
const SUBCOMMAND_OPTIONS: Record<Subcommand, ReadonlySet<string>> = {
  fields: new Set(),
  render: new Set(['input', 'root']),
  validate: new Set(['input', 'rehearsal-evidence', 'root']),
}

function subcommand(value: string | undefined): Subcommand {
  if (value === 'fields' || value === 'render' || value === 'validate') return value
  throw new InputError(initialDispatchUsage)
}

/** Each option at most once, and only the options of the subcommand. */
function options(command: Subcommand, args: string[]): Values {
  const parsed = parseArgs({ args, strict: true, tokens: true, options: OPTIONS })
  const names = parsed.tokens.flatMap(token => (token.kind === 'option' ? [token.name] : []))
  if (new Set(names).size !== names.length)
    throw new InputError('initial-dispatch-duplicate-option')
  const refused = names.filter(name => !SUBCOMMAND_OPTIONS[command].has(name))
  if (refused.length > 0)
    throw new InputError(
      `initial-dispatch-options: ${command} does not accept ${refused.map(name => `--${name}`).join(', ')}`,
    )
  return parsed.values
}

function required(value: string | undefined, code: string): string {
  if (value === undefined) throw new InputError(code)
  return value
}

function jsonFile(path: string): unknown {
  return strictJson(readFileSync(path, 'utf8'), path)
}

function run(command: Subcommand, values: Values, template: string): unknown {
  if (command === 'fields') return { schemaVersion: 1, fields: initialDispatchFields(template) }
  const input = parseInitialDispatchInput(
    jsonFile(required(values.input, 'initial-dispatch-input-required')),
  )
  const root = resolve(values.root ?? process.cwd())
  if (command === 'render') return generateInitialDispatch(root, template, input)
  const evidence = parseRehearsalEvidence(
    jsonFile(
      required(values['rehearsal-evidence'], 'initial-dispatch-rehearsal-evidence-required'),
    ),
  )
  return validateInitialDispatch(root, template, input, evidence)
}

/** `templateRoot` defaults to the checkout that holds this tool. */
export function initialDispatchMain(args: string[], templateRoot?: string): number {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(initialDispatchUsage + '\n')
    return 0
  }
  const [first, ...rest] = args
  const command = subcommand(first)
  const values = options(command, rest)
  const templatePath =
    templateRoot === undefined
      ? repositoryFile(INITIAL_DISPATCH_TEMPLATE)
      : resolve(templateRoot, INITIAL_DISPATCH_TEMPLATE)
  const result = run(command, values, readFileSync(templatePath, 'utf8'))
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
