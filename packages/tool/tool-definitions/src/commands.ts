import type { Command, Field } from './protocol.ts'

const path: Field = {
  name: 'path',
  kind: 'string',
  required: true,
  description:
    'Absolute path, or a path relative to the workspace root, such as "." or "sub/file.txt".',
}
const old: Field = {
  name: 'old_text',
  kind: 'string',
  required: true,
  description: 'Exact nonempty original text. Exactly one match is required.',
}
const replacement: Field = {
  name: 'new_text',
  kind: 'text',
  required: true,
  description: 'Replacement text. Original line endings remain unchanged elsewhere.',
}
const version: Field = {
  name: 'expected_version',
  kind: 'string',
  description: 'Optional observed version condition. A version grants no access.',
}
const offset: Field = {
  name: 'offset',
  kind: 'offset',
  description: 'Zero-based facility page offset. Omit to start at zero.',
}
const limit: Field = {
  name: 'limit',
  kind: 'positive',
  description: 'Maximum entries or hits. Omit to let the facility choose a page.',
}
const recursive: Field = {
  name: 'recursive',
  kind: 'boolean',
  description: 'Include descendants. Omit for false.',
}
const terminal: Field = {
  name: 'terminal',
  kind: 'terminal',
  description:
    'Copy the complete terminal id and generation. An invalid reference never falls back to one-shot execution.',
}
const env: Field = {
  name: 'env',
  kind: 'env',
  description: 'Explicit string environment entries. Execution overrides apply to this call only.',
}
const cwd: Field = {
  name: 'cwd',
  kind: 'string',
  description:
    'Directory for this call. Omit to use the configured directory or current terminal directory.',
}
/** `help` names its topic in `name`, so no field of a command is called `command` (flat calls). */
function withHelp(commands: readonly Command[]): readonly Command[] {
  return [
    ...commands,
    {
      name: 'help',
      summary: 'Show the full usage of one command, or list the commands and the rules.',
      fields: [
        {
          name: 'name',
          kind: 'string',
          choices: commands.map(command => command.name),
          description: 'The command to explain. Omit to list all commands and the rules.',
        },
      ],
    },
  ]
}

export const filesCommands: readonly Command[] = withHelp([
  {
    name: 'read',
    summary: 'Read a UTF-8 text page with version and byte offsets.',
    fields: [
      path,
      {
        name: 'offset_bytes',
        kind: 'offset',
        description: 'Byte offset. Omit for zero. Start and end must preserve UTF-8 boundaries.',
      },
      {
        name: 'limit_bytes',
        kind: 'positive',
        description: 'Maximum bytes requested. Omit to use resultMaxBytes.',
      },
    ],
  },
  {
    name: 'open',
    summary: 'Open a file as an attachment; images are unsupported in this delivery.',
    fields: [path],
  },
  {
    name: 'write',
    summary: 'Create or replace complete UTF-8 file bytes.',
    fields: [
      path,
      {
        name: 'text',
        kind: 'text',
        required: true,
        description: 'Complete UTF-8 text. No newline conversion occurs.',
      },
      {
        name: 'mode',
        kind: 'string',
        required: true,
        choices: ['create', 'replace'],
        description: 'Create a new file or replace an existing file.',
      },
      {
        name: 'parents',
        kind: 'boolean',
        description: 'Create missing parent directories first. Omit for false.',
      },
      version,
    ],
  },
  {
    name: 'edit',
    summary: 'Replace exactly one original match and return a diff.',
    fields: [path, old, replacement],
  },
  {
    name: 'patch',
    summary: 'Preflight all exact edits before one batch submission.',
    fields: [
      {
        name: 'edits',
        kind: 'edits',
        required: true,
        description:
          'Nonempty list of {path,old_text,new_text}. Paths are absolute or relative to the workspace root. Match against original files. Duplicate or overlapping ranges are rejected.',
      },
    ],
  },
  { name: 'list', summary: 'List actual entry names and metadata.', fields: [path, offset, limit] },
  {
    name: 'find',
    summary: 'Find names or file content with facility pagination.',
    fields: [
      path,
      {
        name: 'pattern',
        kind: 'string',
        required: true,
        description: 'UTF-8 search pattern passed to the facility.',
      },
      {
        name: 'match',
        kind: 'string',
        required: true,
        choices: ['name', 'content'],
        description: 'Select name matching or content matching.',
      },
      recursive,
      offset,
      limit,
    ],
  },
  { name: 'info', summary: 'Observe metadata and a bounded binary sample.', fields: [path] },
  ...['move', 'copy'].map(name => ({
    name,
    summary: `${name === 'move' ? 'Move' : 'Copy'} a path to an authorized destination.`,
    fields: [
      path,
      {
        name: 'target',
        kind: 'string',
        required: true,
        description:
          'Destination path, absolute or relative to the workspace root. The host names its authorized parent.',
      } satisfies Field,
      {
        name: 'replace',
        kind: 'boolean',
        description: 'Allow destination replacement. Omit for false.',
      } satisfies Field,
      version,
    ],
  })),
  { name: 'delete', summary: 'Remove the selected path.', fields: [path, recursive, version] },
  {
    name: 'mkdir',
    summary: 'Create a directory.',
    fields: [
      path,
      { name: 'parents', kind: 'boolean', description: 'Create missing parents. Omit for false.' },
    ],
  },
])

export const shellCommands: readonly Command[] = withHelp([
  {
    name: 'create_session',
    summary: 'Create a persistent terminal for subsequent calls in the current session.',
    fields: [
      cwd,
      env,
      {
        name: 'columns',
        kind: 'positive',
        description: 'Terminal columns. Supply together with rows.',
      },
      {
        name: 'rows',
        kind: 'positive',
        description: 'Terminal rows. Supply together with columns.',
      },
    ],
  },
  {
    name: 'execute',
    summary: 'Execute a script once or in the exact referenced terminal.',
    fields: [
      {
        name: 'script',
        kind: 'text',
        required: true,
        description: 'Script passed to the configured shell or terminal.',
      },
      terminal,
      cwd,
      env,
      { name: 'stdin', kind: 'text', description: 'Optional UTF-8 standard input.' },
      {
        name: 'run_in_background',
        kind: 'boolean',
        description: 'true is unsupported and starts nothing in this delivery.',
      },
    ],
  },
  {
    name: 'close_session',
    summary: 'Close the exact referenced terminal and report confirmation.',
    fields: [{ ...terminal, required: true }],
  },
  {
    name: 'info',
    summary:
      'Show the current execution environment, live terminal sessions and retained processes.',
    fields: [],
  },
])
