import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolSettingsDeclaration } from '@omne-harness/tool-contract'
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
import {
  adoption as vocabulary,
  parseConstruction,
  tree,
  type Arguments,
  type Field,
} from './protocol.ts'
import { collectProcess } from './shell-output.ts'
import {
  OutputStage,
  STAGING_BATCH_MS,
  STAGING_MAX_BYTES,
  STAGING_START_AFTER_MS,
} from './shell-staging.ts'
import { textBody } from './returns.ts'
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
    name: 'env',
    kind: 'env',
    required: true,
    description: 'Explicit initial environment. The host environment is never inherited.',
  },
]
/** The setting the request source reads before admission: when a call that may go to the background moves there. */
export const SHELL_BACKGROUND_AFTER_SETTING = 'backgroundAfterMs'
/** The setting the request source reads before admission: how long the foreground waits at most. */
export const SHELL_FOREGROUND_SETTING = 'foregroundMs'
export const SHELL_BACKGROUND_AFTER_DEFAULT_MS = 60_000

const shellSettings: ToolSettingsDeclaration = {
  schema: {
    vocabulary,
    schema: tree({
      type: 'object',
      additionalProperties: false,
      properties: {
        [SHELL_BACKGROUND_AFTER_SETTING]: { type: 'integer', minimum: 0 },
        [SHELL_FOREGROUND_SETTING]: { type: 'integer', minimum: 1 },
      },
    }),
    descriptions: [
      {
        path: SHELL_BACKGROUND_AFTER_SETTING,
        text: 'Milliseconds a one-shot execute waits in the foreground before it moves to the background. Only a call that may go to the background moves.',
      },
      {
        path: SHELL_FOREGROUND_SETTING,
        text: 'Milliseconds the foreground waits for any execute at most. Absent means no limit.',
      },
    ],
  },
  defaults: tree({ [SHELL_BACKGROUND_AFTER_SETTING]: SHELL_BACKGROUND_AFTER_DEFAULT_MS }),
  items: [
    {
      path: [SHELL_BACKGROUND_AFTER_SETTING],
      category: 'preference',
      sensitive: false,
      presentation: {
        title: 'Move to background after',
        description:
          'How long a one-shot command waits in the foreground before it moves to the background by itself.',
        impact: 'The next call reads the new value; a call already admitted keeps its own.',
        clear: 'The default of one minute applies again.',
        adoption: 'next-read',
        unit: 'ms',
      },
    },
    {
      path: [SHELL_FOREGROUND_SETTING],
      category: 'preference',
      sensitive: false,
      presentation: {
        title: 'Foreground time limit',
        description:
          'How long the foreground waits for any Shell execute at most. When it passes, the call that may go to the background moves there; any other call ends as interrupted.',
        impact: 'The next call reads the new value; a call already admitted keeps its own.',
        clear: 'The foreground waits without a limit again.',
        adoption: 'next-read',
        unit: 'ms',
      },
    },
  ],
}

const BACKGROUND_LINES = shellCommands
  .flatMap(command =>
    command.background === undefined
      ? []
      : [`background=${command.name} unless=${JSON.stringify(command.background.unless)}\n`],
  )
  .join('')

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
      'Sessions require session retention and a fresh authorized attachment for each call. Invalid or closed terminal references never fall back to one-shot execution. cwd and env execution overrides apply to one call. Only the current ProcessHandle receives stop on cancellation. unconfirmed does not mean stopped. Placement facts come from the injected environment. Facility discards and tool byte truncation are reported separately. A terminal completed means the foreground segment ended; it does not prove shell exit or business success. Process lifetime, one-shot execution: a process left running in the background by a one-shot command (for example cmd &) stays running after the call returns as a retained process; info lists retained processes; it runs until it exits, is stopped explicitly, or the execution environment closes its retention scope; a process is stopped when it cannot be retained; the residue line gives the reason. Intent: every execute call carries intent, one line that says why you run it; it decides nothing and names the call later, and a call without it is refused and does not run. Background execution: run_in_background=true runs a one-shot execute in the background: the call returns a placeholder at once and the outcome comes back later as a system reminder; a terminal execution cannot run in the background; a one-shot execute that runs longer than the backgroundAfterMs setting (one minute by default) moves to the background by itself and returns a placeholder; otherwise a one-shot command waits until the main process exits and output is quiet. Terminals: background tasks in a terminal live as long as the terminal; close_session stops every process in the terminal. Long-running services: a service that must run long and is not managed by this tool belongs to the host service manager (for example systemd-run --user); starting it is an external effect of the command itself.',
      (command, args, environment, execution) =>
        executeShell(command, args, environment, execution, config),
      shellSettings,
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
    revision: '4',
    returns: 'Published raw value, model body and system offloading policy.',
    changes:
      'A command and a new terminal start in the working directory of the call, taken from its environment; the construction names no directory.',
    commands: shellCommands,
  }),
  createAuthor: createShellAuthor,
}

const NO_DIRECTORY =
  'rejected reason=unavailable this call has no working directory; pass cwd zero starts'

/** Where a command or a new terminal starts: the directory the call names, else that of the call. */
const startDirectory = (args: Arguments, environment: ShellAuthorEnvironment): string | undefined =>
  args.optionalText('cwd') ?? environment.directory
const shownDirectory = (environment: ShellAuthorEnvironment): string =>
  JSON.stringify(environment.directory ?? null)

async function createTerminal(
  args: Arguments,
  environment: ShellAuthorEnvironment,
  config: Arguments,
): Promise<string> {
  if (environment.terminal.retention === undefined)
    return 'rejected reason=unavailable session retention unavailable zero starts'
  if (args.has('columns') !== args.has('rows'))
    return 'rejected reason=invalidInput columns and rows must be supplied together'
  const cwd = startDirectory(args, environment)
  if (cwd === undefined) return NO_DIRECTORY
  return confirmation(
    await environment.terminal.create({
      retain: 'scope',
      cwd,
      env: { ...config.env('env'), ...args.env('env') },
      ...(args.has('columns')
        ? { geometry: { columns: args.number('columns', 0), rows: args.number('rows', 0) } }
        : {}),
    }),
    value => `terminal=${JSON.stringify(value.terminal)}`,
  )
}

/** A one-shot command. Null: nothing names a directory to start it in, so it does not start. */
function startOnce(
  args: Arguments,
  environment: ShellAuthorEnvironment,
  config: Arguments,
  stdin: Readonly<{ stdin?: Uint8Array }>,
) {
  const cwd = startDirectory(args, environment)
  if (cwd === undefined) return null
  return environment.command.start({
    executable: config.text('executable'),
    args: [...config.strings('argsPrefix'), args.text('script')],
    cwd,
    env: { ...config.env('env'), ...args.env('env') },
    outputMode: 'separate',
    ...stdin,
  })
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
      return `done placement\nos=${JSON.stringify(environment.facts.os)} release=${JSON.stringify(environment.facts.release)} architecture=${JSON.stringify(environment.facts.architecture)} facilities=${JSON.stringify(environment.facts.facilities)}\nshell=${JSON.stringify([config.text('executable'), ...config.strings('argsPrefix')])} cwd=${shownDirectory(environment)}\nprocess_containment=${environment.command.containment ?? 'undeclared'}\n${BACKGROUND_LINES}${await terminalLines(environment)}${await retainedProcessLines(environment)}`
    case 'create_session':
      return createTerminal(args, environment, config)
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
  if (terminal !== undefined) {
    const denied = await attachTerminal(environment, terminal)
    if (denied !== undefined) return denied
    if (execution.signal.aborted) return 'rejected reason=cancelled zero starts'
  }
  const input = args.optionalText('stdin')
  const stdin = input === undefined ? {} : { stdin: new TextEncoder().encode(input) }
  const started =
    terminal === undefined
      ? await startOnce(args, environment, config, stdin)
      : await environment.terminal.execute({
          terminal,
          script: args.text('script'),
          ...(args.has('cwd') ? { cwd: args.text('cwd') } : {}),
          ...(args.has('env') ? { env: args.env('env') } : {}),
          ...stdin,
        })
  if (started === null) return NO_DIRECTORY
  if (started.kind !== 'done') return confirmation(started, () => '')
  const stage = new OutputStage({
    writer: execution.body,
    representation: textBody,
    startAfterMs: STAGING_START_AFTER_MS,
    batchMs: STAGING_BATCH_MS,
    maxBytes: STAGING_MAX_BYTES,
  })
  return collectProcess(started.value, execution.signal, config.number('resultMaxBytes', 0), stage)
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
