import {
  judgeToolDefinition,
  type MultiCommandTool,
  type JsonSchema,
  type ParameterJudge,
} from '@omne-harness-lite/tool-definition'
import { SHELL_HELP, COMMAND_HELP } from './help.ts'
import type { ShellOptions } from './types.ts'

const cwd = {
  type: 'string',
  minLength: 1,
  description:
    'Directory for this call. Omit to preserve the terminal directory during session execution. Other commands use Runtime Context when omitted.',
}
const envs = {
  type: 'object',
  additionalProperties: { type: 'string' },
  description: 'Environment variable overrides. Each value must be a string.',
}
const session = {
  type: 'string',
  minLength: 1,
  description: 'Exact terminal_id returned by create_session.',
}
function schema(properties: JsonSchema, required: readonly string[] = []): JsonSchema {
  return { type: 'object', properties, required, additionalProperties: false }
}
export function shellDefinition(
  options: ShellOptions,
  parameters: ParameterJudge,
): MultiCommandTool {
  const definition: MultiCommandTool = {
    name: 'Shell',
    description:
      'Run shell commands in the selected execution environment. Use help for command parameters. Output updates are for the user. The final result supplies command output and exit status.',
    paradigm: 'multi',
    origin: { kind: 'authored' },
    allowBackground: true,
    settings: {
      targetEnvironment: {
        category: 'placement_identity',
        default: { bindingLayer: 'host_machine', facilities: ['command'] },
      },
      backgroundThreshold: {
        category: 'preference',
        default: options.backgroundThreshold ?? 'PT10M',
      },
    },
    permissions: { execute: { default: options.executePermission ?? 'ask' } },
    help: SHELL_HELP.replace(
      'The default threshold is 10 minutes.',
      `The declared waiting threshold is ${options.backgroundThreshold ?? 'PT10M'}.`,
    ),
    commands: {
      help: {
        description: 'Read tool help or command help.',
        input: schema({
          command: {
            type: 'string',
            enum: ['help', 'create_session', 'execute', 'close_session', 'info'],
            description: 'Command whose help you need. Omit for the overview.',
          },
        }),
        help: COMMAND_HELP.help,
      },
      create_session: {
        description: 'Create a persistent terminal session.',
        input: schema({ cwd, envs }),
        help: COMMAND_HELP.create_session,
      },
      execute: {
        description: 'Execute a command once or in a terminal session.',
        input: schema(
          {
            command: {
              type: 'string',
              minLength: 1,
              description: 'Shell command text. Shell syntax belongs in this string.',
            },
            session_id: session,
            cwd,
            envs,
            run_in_background: {
              type: 'boolean',
              description:
                'Ask the upper caller to continue without waiting. The tool execution remains independent.',
            },
          },
          ['command'],
        ),
        help: COMMAND_HELP.execute,
      },
      close_session: {
        description: 'Close an original terminal session.',
        input: schema({ session_id: session }, ['session_id']),
        help: COMMAND_HELP.close_session,
      },
      info: {
        description:
          'Read system, architecture, shell version, and directory in the selected environment.',
        input: schema({}),
        help: COMMAND_HELP.info,
      },
    },
  }
  const valid = judgeToolDefinition(definition, parameters)
  if ('rejected' in valid) throw new TypeError(`Invalid Shell definition: ${valid.rejected}`)
  return definition
}
