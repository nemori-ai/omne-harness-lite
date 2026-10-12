import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type {
  CommandFacility,
  ProcessHandle,
  EnvironmentFacilities,
} from '@omne-harness-lite/execution-environments'
import type { InvocationDependencies } from '@omne-harness-lite/tool-execution-runtime'
import type {
  ToolReturn,
  MultiCommandTool,
  ParameterJudge,
} from '@omne-harness-lite/tool-definition'
import { SHELL_CONTEXT_KEY, type ShellOptions } from './types.ts'
import { initialContext, terminalReference } from './values.ts'
import { reply, failure } from './result.ts'
import { collectOutput } from './output.ts'

async function defaults(deps: InvocationDependencies, key: string) {
  const read = await deps.context.read([key])
  if (read.kind !== 'values') return { rejected: `context:${read.reason}` } as const
  if (read.values.length !== 1 || read.values[0]?.key !== key)
    return { rejected: 'context:missingValue' } as const
  const value = initialContext(read.values[0].value)
  return value ?? ({ rejected: 'context:invalidValue' } as const)
}
async function execution(
  process: ProcessHandle,
  deps: InvocationDependencies,
  options: ShellOptions,
  environment: EnvironmentFacilities,
) {
  let stopping: Promise<'confirmed' | 'unconfirmed'> | undefined
  const stopFailure = Promise.withResolvers<never>()
  const stop = () => {
    stopping ??= Promise.resolve().then(() => process.stop('graceful'))
    void stopping.then(undefined, stopFailure.reject)
  }
  deps.signal.addEventListener('abort', stop, { once: true })
  if (deps.signal.aborted) stop()
  try {
    const [output, outcome] = await Promise.race([
      Promise.all([collectOutput(process, deps, options.maxOutputBytes), process.result]),
      stopFailure.promise,
    ])
    const stopObservation = await stopping
    const successful =
      outcome.kind === 'completed' && 'code' in outcome.exit && outcome.exit.code === 0
    return reply(
      {
        kind: 'execution',
        environment: environment.description,
        outcome,
        output,
        ...(stopObservation === undefined ? {} : { stopObservation }),
      },
      !successful,
    )
  } finally {
    deps.signal.removeEventListener('abort', stop)
  }
}
async function createSession(
  args: JsonObject,
  deps: InvocationDependencies,
  options: ShellOptions,
  environment: EnvironmentFacilities,
  facility: CommandFacility,
) {
  const initial = await defaults(deps, options.contextKey ?? SHELL_CONTEXT_KEY)
  if ('rejected' in initial) return failure(initial.rejected)
  if (deps.signal.aborted) return failure('interrupted')
  const result = await facility.createTerminal({
    cwd: typeof args.cwd === 'string' ? args.cwd : initial.cwd,
    env: { ...initial.envs, ...(args.envs as Record<string, string> | undefined) },
  })
  if (result.kind !== 'created') return failure(`facility:${result.reason}`)
  const terminal_id = JSON.stringify(result.terminal)
  const view = await facility.terminals()
  if (view.kind !== 'terminals')
    return failure(`created:observation:${view.reason}`, { terminal_id })
  const observation = view.values.find(
    item =>
      item.terminal.id === result.terminal.id &&
      item.terminal.generation === result.terminal.generation,
  )
  if (!observation) return failure('created:observation:missing', { terminal_id })
  return reply({ kind: 'session', terminal_id, environment: environment.description, observation })
}
async function startCommand(
  args: JsonObject,
  deps: InvocationDependencies,
  options: ShellOptions,
  facility: CommandFacility,
) {
  if (typeof args.session_id === 'string') {
    const terminal = terminalReference(args.session_id)
    if (!terminal) return { kind: 'rejected', reason: 'arguments:invalidTerminal' } as const
    return facilityStart(
      await facility.executeTerminal({
        terminal,
        script: args.command as string,
        ...(typeof args.cwd === 'string' ? { cwd: args.cwd } : {}),
        ...(args.envs === undefined ? {} : { env: args.envs as Record<string, string> }),
      }),
    )
  }
  const initial = await defaults(deps, options.contextKey ?? SHELL_CONTEXT_KEY)
  if ('rejected' in initial) return { kind: 'rejected', reason: initial.rejected } as const
  if (deps.signal.aborted) return { kind: 'rejected', reason: 'interrupted' } as const
  return facilityStart(
    await facility.start({
      executable: options.shell.executable,
      args: [...options.shell.args, '-c', args.command as string],
      cwd: typeof args.cwd === 'string' ? args.cwd : initial.cwd,
      env: { ...initial.envs, ...(args.envs as Record<string, string> | undefined) },
    }),
  )
}
function facilityStart(result: Awaited<ReturnType<CommandFacility['start']>>) {
  return result.kind === 'started'
    ? result
    : ({ kind: 'rejected', reason: `facility:${result.reason}` } as const)
}
const infoCommand =
  'printf "system="; uname -s; printf "architecture="; uname -m; printf "shell_version=%s\\n" "${BASH_VERSION:-unknown}"; printf "cwd=%s\\n" "$PWD"'
async function closeSession(args: JsonObject, facility: CommandFacility) {
  const terminal = terminalReference(args.session_id)
  if (!terminal) return failure('arguments:invalidTerminal')
  const result = await facility.closeTerminal(terminal)
  return result.kind === 'closed'
    ? reply(
        { kind: 'closure', terminal_id: args.session_id as string, status: result.status },
        result.status !== 'confirmed',
      )
    : failure(`facility:${result.reason}`)
}
async function commandResult(
  command: string | undefined,
  args: JsonObject,
  deps: InvocationDependencies,
  options: ShellOptions,
  environment: EnvironmentFacilities,
  facility: CommandFacility,
) {
  if (command === 'create_session') return createSession(args, deps, options, environment, facility)
  if (command === 'close_session') return closeSession(args, facility)
  const started = await startCommand(
    command === 'info' ? { command: infoCommand } : args,
    deps,
    options,
    facility,
  )
  return started.kind === 'started'
    ? execution(started.process, deps, options, environment)
    : failure(started.reason)
}
export function shellExecutor(
  definition: MultiCommandTool,
  parameters: ParameterJudge,
  options: ShellOptions,
) {
  return async (
    input: import('@omne-harness-lite/content-blocks').JsonValue,
    deps: InvocationDependencies,
  ): Promise<ToolReturn> => {
    const judged = parameters.judgeCallArguments(definition, input)
    if (!('ok' in judged))
      return failure('invalid' in judged ? 'arguments:invalid' : 'arguments:unsupported')
    const { command, args } = judged.ok
    if (command === 'help')
      return typeof args.command === 'string'
        ? definition.commands[args.command]!.help!
        : definition.help!
    if (deps.signal.aborted) return failure('interrupted')
    const environment = deps.environment,
      facility = environment?.command
    if (!environment || !facility) return failure('facility:unavailable')
    return commandResult(command, args, deps, options, environment, facility)
  }
}
