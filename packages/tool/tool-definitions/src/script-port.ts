import type { Outcome } from '@omne-harness/operation-result'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { contextPort } from './context-port.ts'

/** Where one call of a script tool runs its script: what the assembly knows and the tool's own files do not say. */
export type ScriptPlace = Readonly<{
  /** The directory the files of the tool lie in on this machine. */
  directory: string
  /** The environment the script starts with, whole: the host's is never inherited. */
  env: Readonly<Record<string, string>>
  /** The most bytes of output kept in the result. */
  resultMaxBytes: number
  /** Where a program lies on this machine, as the environment above finds it; undefined when it does not. */
  program(name: string): string | undefined
}>

export interface ScriptHost {
  place(): Promise<Outcome<ScriptPlace, Readonly<{ reason: string }>>>
}

const port = contextPort<ScriptHost>()

export function scriptHostOf(context: ToolExecutionContext): ScriptHost | undefined {
  return port.of(context)
}

export function attachScriptHost(scope: ToolExecutionScope, host: ScriptHost): ToolExecutionScope {
  return port.attach(scope, host)
}
