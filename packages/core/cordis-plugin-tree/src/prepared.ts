import type { Plugin } from '@deepseek-ai/cordis'
import type { AssemblyDeclaration, ComposedRow, PreparedPluginTree } from './types.ts'

export interface PreparedRow {
  readonly row: ComposedRow
  readonly plugin: Plugin<unknown>
  readonly declaration: AssemblyDeclaration
}
export interface PreparedState {
  readonly rows: readonly PreparedRow[]
  readonly externalServices: readonly string[]
}
const states = new WeakMap<PreparedPluginTree, PreparedState>()
export function rememberPrepared(value: PreparedPluginTree, state: PreparedState): void {
  states.set(value, state)
}
export function preparedState(value: PreparedPluginTree): PreparedState | undefined {
  return states.get(value)
}
