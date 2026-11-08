import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  describedAdoption,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createAuthor } from './author.ts'
import { shellCommands } from './commands.ts'
import type { ShellAuthorEnvironment } from './environment.ts'
import { resultMaximumField } from './files.ts'
import { parseConstruction, type Arguments, type Field } from './protocol.ts'
import { collectProcess } from './shell-output.ts'
import { confirmation } from './text.ts'

const constructionFields: readonly Field[] = [
  resultMaximumField,
  {
    name: 'executable',
    kind: 'string',
    required: true,
    description: 'Explicit shell executable for one-shot commands.',
  },
  {
    name: 'argsPrefix',
    kind: 'strings',
    required: true,
    description: 'Arguments before the script, for example ["-c"].',
  },
  {
    name: 'cwd',
    kind: 'string',
    required: true,
    description: 'Explicit initial working directory.',
  },
  {
    name: 'env',
    kind: 'env',
    required: true,
    description: 'Explicit initial environment. The host environment is never inherited.',
  },
]
export function createShellAuthor(
  construction: JsonValue,
): ReturnType<
  ToolImplementationModule<ShellAuthorEnvironment, ToolMessageContentBlock>['createAuthor']
> {
  const parsed = parseConstruction(construction, constructionFields)
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const config = parsed.ok
  const maximum = config.number('resultMaxBytes', 0)
  return succeed(
    createAuthor<ShellAuthorEnvironment>(
      'Shell',
      'Run shell commands and manage persistent terminals in the authorized execution environment. The info command names the platform and shell and lists terminals and retained processes.',
      shellCommands,
      ['command', 'terminal'],
      maximum,
      'run_in_background=true is unsupported and starts nothing. Sessions require session retention and a fresh authorized attachment for each call. Invalid or closed terminal references never fall back to one-shot execution. cwd and env execution overrides apply to one call. Only the current ProcessHandle receives stop on cancellation. unconfirmed does not mean stopped. Placement facts come from the injected environment. Facility discards and tool byte truncation are reported separately. Windows terminal output uses observation windows: even foreground bytes not yet read may appear later; an empty script does not guarantee draining; close may release undelivered idle bytes. completed does not prove shell exit or business success. Process lifetime, one-shot execution: a process left running in the background by a one-shot command (for example cmd &) stays running after the call returns as a retained process; info lists retained processes; it runs until it exits, is stopped explicitly, or the execution environment closes its retention scope; a process is stopped when it cannot be retained; the residue line gives the reason. Background execution: run_in_background is not supported now: a one-shot command waits until the main process exits and output is quiet. Terminals: background tasks in a terminal live as long as the terminal; close_session stops every process in the terminal. Long-running services: a service that must run long and is not managed by this tool belongs to the host service manager (for example systemd-run --user); starting it is an external effect of the command itself.',
      (command, args, environment, execution) =>
        executeShell(command, args, environment, execution, config),
    ),
  )
}
export const shellToolModule: ToolImplementationModule<
  ShellAuthorEnvironment,
  ToolMessageContentBlock
> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Shell',
    revision: '2',
    changes:
      'One declaration with the command in the call, the shell and start directory in the description and help by command name.',
    commands: shellCommands,
  }),
  createAuthor: createShellAuthor,
}

async function executeShell(
  command: string,
  args: Arguments,
  environment: ShellAuthorEnvironment,
  execution: ToolExecutionContext,
  config: Arguments,
): Promise<string> {
  if (execution.signal.aborted) return 'rejected reason=cancelled zero starts'
  const terminal = args.terminal()
  switch (command) {
    case 'info':
      return `done placement\nos=${JSON.stringify(environment.facts.os)} release=${JSON.stringify(environment.facts.release)} architecture=${JSON.stringify(environment.facts.architecture)} facilities=${JSON.stringify(environment.facts.facilities)}\nshell=${JSON.stringify([config.text('executable'), ...config.strings('argsPrefix')])} cwd=${JSON.stringify(config.text('cwd'))}\nprocess_containment=${environment.command.containment ?? 'undeclared'}\n${await terminalLines(environment)}${await retainedProcessLines(environment)}`
    case 'create_session': {
      if (environment.terminal.retention === undefined)
        return 'rejected reason=unavailable session retention unavailable zero starts'
      if (args.has('columns') !== args.has('rows'))
        return 'rejected reason=invalidInput columns and rows must be supplied together'
      return confirmation(
        await environment.terminal.create({
          retain: 'session',
          cwd: args.optionalText('cwd') ?? config.text('cwd'),
          env: { ...config.env('env'), ...args.env('env') },
          ...(args.has('columns')
            ? { geometry: { columns: args.number('columns', 0), rows: args.number('rows', 0) } }
            : {}),
        }),
        value => `terminal=${JSON.stringify(value.terminal)}`,
      )
    }
    case 'close_session': {
      if (terminal === undefined) return 'rejected reason=invalidInput terminal required'
      const denied = await attachTerminal(environment, terminal)
      if (denied !== undefined) return denied
      if (execution.signal.aborted) return 'rejected reason=cancelled'
      return confirmation(
        await environment.terminal.close({ terminal }),
        value => `terminal=${JSON.stringify(terminal)} close=${value.status}`,
      )
    }
    case 'execute':
      return executeScript(args, environment, execution, config)
    default:
      // The command table names exactly these commands, so a miss is a defect, not a result.
      throw new Error(`Shell has no operation for command ${command}`)
  }
}

async function terminalLines(environment: ShellAuthorEnvironment): Promise<string> {
  const terminals = confirmation(await environment.terminal.list({}), value =>
    value
      .map(
        item =>
          `terminal=${JSON.stringify(item.terminal)} state=${item.state} observed_cwd=${JSON.stringify(item.observedCwd)}`,
      )
      .join('\n'),
  )
  return terminals.endsWith('\n') ? terminals : `${terminals}\n`
}

/** An unreadable list is reported as unavailable; it is never written as none. */
async function retainedProcessLines(environment: ShellAuthorEnvironment): Promise<string> {
  const retention = environment.command.retention
  if (retention === undefined) return 'retained_processes=unavailable'
  const listed = await retention.list({})
  if (listed.kind !== 'done')
    return `retained_processes=unavailable reason=${listed.kind === 'rejected' ? listed.reason : listed.kind}`
  if (listed.value.length === 0) return 'retained_processes=none'
  return listed.value
    .map(
      item =>
        `retained_process=${JSON.stringify(item.process)} state=${item.state} processes=${item.processes} origin=${JSON.stringify(item.origin)} handed_over_at=${new Date(item.handedOverAtMs).toISOString()}`,
    )
    .join('\n')
}

async function executeScript(
  args: Arguments,
  environment: ShellAuthorEnvironment,
  execution: ToolExecutionContext,
  config: Arguments,
): Promise<string> {
  const terminal = args.terminal()
  if (args.flag('run_in_background'))
    return 'rejected reason=unsupported background execution starts nothing'
  if (terminal !== undefined) {
    const denied = await attachTerminal(environment, terminal)
    if (denied !== undefined) return denied
    if (execution.signal.aborted) return 'rejected reason=cancelled zero starts'
  }
  const input = args.optionalText('stdin')
  const stdin = input === undefined ? {} : { stdin: new TextEncoder().encode(input) }
  const started =
    terminal === undefined
      ? await environment.command.start({
          executable: config.text('executable'),
          args: [...config.strings('argsPrefix'), args.text('script')],
          cwd: args.optionalText('cwd') ?? config.text('cwd'),
          env: { ...config.env('env'), ...args.env('env') },
          outputMode: 'separate',
          ...stdin,
        })
      : await environment.terminal.execute({
          terminal,
          script: args.text('script'),
          ...(args.has('cwd') ? { cwd: args.text('cwd') } : {}),
          ...(args.has('env') ? { env: args.env('env') } : {}),
          ...stdin,
        })
  return started.kind === 'done'
    ? collectProcess(started.value, execution.signal, config.number('resultMaxBytes', 0))
    : confirmation(started, () => '')
}

async function attachTerminal(
  environment: ShellAuthorEnvironment,
  terminal: Parameters<ShellAuthorEnvironment['terminal']['execute']>[0]['terminal'],
): Promise<string | undefined> {
  const retention = environment.terminal.retention
  if (retention === undefined)
    return 'rejected reason=unavailable session attachment unavailable zero starts'
  const attached = await retention.attach({ terminal })
  return attached.kind === 'done' ? undefined : confirmation(attached, () => '')
}
