import { createRequire } from 'node:module'
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

/** Maps process arguments (without the executable and script) to one invocation. */
export function parseInvocation(_args: readonly string[]): Invocation {
  throw new Error('not-implemented')
}

/** Name of the option that carries the protected-file path for one secret field. */
export function secretOption(_field: Command['secretFields'][number]): string {
  throw new Error('not-implemented')
}
