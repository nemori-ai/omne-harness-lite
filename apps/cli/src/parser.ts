import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import type { ActionIntent } from '@omne-harness-lite/governance-client-operations'
import type { Diagnostic } from './diagnostic.ts'
const require = createRequire(import.meta.url)
export interface Command {
  readonly command: readonly string[]
  readonly action: ActionIntent['action']
  readonly operation?: string
  readonly secretFields: readonly ('credential' | 'currentCredential' | 'newCredential')[]
  readonly refresh: boolean
  readonly allowedOptions: readonly string[]
  readonly payloadSource: 'none' | 'file-or-empty'
}
export const commands: readonly Command[] = require('../commands/governance.json')
const booleanOptions = new Set(['system-ca', 'refresh', 'help', 'version'])
const optionNames = new Set([...commands.flatMap(c => c.allowedOptions), 'help', 'version'])
const options = Object.fromEntries(
  [...optionNames].map(name => [
    name,
    { type: booleanOptions.has(name) ? ('boolean' as const) : ('string' as const) },
  ]),
)
export type Invocation =
  | { readonly kind: 'help'; readonly machine: false }
  | { readonly kind: 'version'; readonly machine: false }
  | {
      readonly kind: 'error'
      readonly machine: boolean
      readonly diagnostic: Diagnostic
      readonly command?: Command
    }
  | {
      readonly kind: 'command'
      readonly machine: boolean
      readonly command: Command
      readonly values: Readonly<Record<string, string | boolean | undefined>>
    }
/** Recover only presentation mode on a syntax error; this never authorizes a command. */
function machineMode(args: readonly string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') return args[i + 1] === 'machine'
    if (!arg.startsWith('-')) return arg === 'machine'
    if (arg.startsWith('--') && !arg.includes('=')) {
      const name = arg.slice(2)
      if (optionNames.has(name) && !booleanOptions.has(name)) i++
    }
  }
  return false
}
export function parseInvocation(args: readonly string[]): Invocation {
  let machine = machineMode(args)
  if (args.length === 0 || (args.length === 1 && args[0] === '--help'))
    return { kind: 'help', machine: false }
  if (args.length === 1 && args[0] === '--version') return { kind: 'version', machine: false }
  let command: Command | undefined
  try {
    const parsed = parseArgs({
      args: [...args],
      options,
      strict: true,
      allowPositionals: true,
      tokens: true,
    })
    const names = [...parsed.positionals]
    machine = names[0] === 'machine'
    if (machine) names.shift()
    command = commands.find(
      c => c.command.length === names.length && c.command.every((word, i) => word === names[i]),
    )
    if (command === undefined) return { kind: 'error', machine, diagnostic: 'invalid-command' }
    const seen = new Set<string>()
    for (const token of parsed.tokens) {
      if (token.kind !== 'option') continue
      if (!command.allowedOptions.includes(token.name) || seen.has(token.name))
        return { kind: 'error', machine, command, diagnostic: 'invalid-options' }
      seen.add(token.name)
    }
    if (command.action === 'configure') {
      if (
        !parsed.values['endpoint'] ||
        ['system-ca', 'ca-file', 'spki'].filter(k => parsed.values[k] !== undefined).length !== 1
      )
        return { kind: 'error', machine, command, diagnostic: 'invalid-options' }
    }
    return { kind: 'command', machine, command, values: Object.freeze({ ...parsed.values }) }
  } catch {
    return {
      kind: 'error',
      machine,
      diagnostic: 'invalid-options',
      ...(command === undefined ? {} : { command }),
    }
  }
}
export function secretOption(field: Command['secretFields'][number]): string {
  return field === 'credential'
    ? 'credential-file'
    : field === 'currentCredential'
      ? 'current-credential-file'
      : 'new-credential-file'
}
