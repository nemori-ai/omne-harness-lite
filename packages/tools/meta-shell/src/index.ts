import { createParameterJudge } from '@omne-harness-lite/tool-definition'
import { shellDefinition } from './definition.ts'
import { shellExecutor } from './executor.ts'
import { SHELL_CONTEXT_KEY, type ShellOptions, type ShellTool } from './types.ts'
export { SHELL_CONTEXT_KEY }
export type {
  ShellInitialContext,
  ShellOptions,
  ShellTool,
  ShellOutput,
  ShellExecutionResult,
  ShellSessionResult,
  ShellBusinessFailure,
  ShellContextFailureReason,
  ShellFailureReason,
  ShellClosureResult,
  ShellResultPayload,
} from './types.ts'

export function createShellTool(options: ShellOptions): ShellTool {
  if (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1)
    throw new TypeError('A positive output byte limit is required')
  if (
    !options.shell.executable ||
    options.shell.executable.includes('\0') ||
    options.shell.args.some(arg => typeof arg !== 'string' || arg.includes('\0'))
  )
    throw new TypeError('Explicit shell executable and arguments are required')
  if (options.contextKey !== undefined && !options.contextKey)
    throw new TypeError('A nonempty context key is required')
  const captured: ShellOptions = {
    ...options,
    shell: { executable: options.shell.executable, args: [...options.shell.args] },
  }
  const parameters = options.parameters ?? createParameterJudge()
  const definition = shellDefinition(captured, parameters)
  return Object.freeze({ definition, executor: shellExecutor(definition, parameters, captured) })
}
