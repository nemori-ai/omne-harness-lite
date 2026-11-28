import type { Command, Field } from './protocol.ts'
import type { ProgramSide } from './program-side.ts'

const CLOSED: ProgramSide = { kind: 'closed' }
const integer = { type: 'integer' }
const text = { type: 'string' }
const flag = { type: 'boolean' }
const fileType = { enum: ['file', 'directory', 'symlink'] }
type Data = Extract<ProgramSide, { kind: 'data' }>
const value = (required: readonly string[], properties: object): Data => ({
  kind: 'data',
  external: false,
  schema: { type: 'object', required, properties },
})
const WRITTEN = value(['version', 'effect'], { version: text, effect: text })

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
function withHelp(commands: readonly Command[]): readonly Command[] {
  return [
    ...commands,
    {
      name: 'help',
      readOnly: true,
      summary: 'Show the full usage of one command, or list the commands and the rules.',
      program: CLOSED,
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
    readOnly: true,
    summary: 'Read a UTF-8 text page with version and byte offsets.',
    program: value(['text', 'offset_bytes', 'next_offset_bytes', 'eof', 'version'], {
      text,
      offset_bytes: integer,
      next_offset_bytes: integer,
      eof: flag,
      version: text,
    }),
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
    readOnly: true,
    summary: 'Open one static PNG, JPEG or WebP picture so the model sees it.',
    program: CLOSED,
    fields: [path],
  },
  {
    name: 'write',
    summary: 'Create or replace complete UTF-8 file bytes.',
    program: WRITTEN,
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
    program: WRITTEN,
    fields: [path, old, replacement],
  },
  {
    name: 'patch',
    summary: 'Preflight all exact edits before one batch submission.',
    program: value(['published'], { published: { type: 'array', items: text } }),
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
  {
    name: 'list',
    readOnly: true,
    summary: 'List actual entry names and metadata.',
    fields: [path, offset, limit],
    program: value(['entries', 'next_offset'], {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'type', 'size_bytes'],
          properties: { name: text, type: fileType, size_bytes: integer },
        },
      },
      next_offset: { type: ['integer', 'null'] },
    }),
  },
  {
    name: 'find',
    readOnly: true,
    summary: 'Find names or file content with facility pagination.',
    program: value(['hits', 'next_offset', 'truncated'], {
      hits: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'offset_bytes'],
          properties: { path: text, offset_bytes: { type: ['integer', 'null'] } },
        },
      },
      next_offset: { type: ['integer', 'null'] },
      truncated: flag,
    }),
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
  {
    name: 'info',
    readOnly: true,
    summary: 'Observe metadata and a bounded binary sample.',
    fields: [path],
    program: value(['type', 'size_bytes', 'modified_ms', 'version'], {
      type: fileType,
      size_bytes: integer,
      modified_ms: { type: 'number' },
      version: text,
    }),
  },
  ...['move', 'copy'].map(name => ({
    name,
    summary: `${name === 'move' ? 'Move' : 'Copy'} a path to an authorized destination.`,
    program: value(['version'], { version: text }),
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
  {
    name: 'delete',
    summary: 'Remove the selected path.',
    fields: [path, recursive, version],
    program: value(['removed'], { removed: flag }),
  },
  {
    name: 'mkdir',
    summary: 'Create a directory.',
    program: value(['version'], { version: text }),
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
    program: CLOSED,
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
    program: {
      ...value(['exit_code', 'signal', 'stdout', 'stderr', 'duration_ms'], {
        exit_code: { type: ['integer', 'null'] },
        signal: { type: ['string', 'null'] },
        stdout: text,
        stderr: text,
        duration_ms: { type: 'number' },
      }),
      unless: ['terminal'],
    },
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
        description:
          'true starts a one-shot execution in the background and returns a placeholder at once; not with terminal.',
      },
    ],
    background: { unless: ['terminal'] },
  },
  {
    name: 'close_session',
    summary: 'Close the exact referenced terminal and report confirmation.',
    program: CLOSED,
    fields: [{ ...terminal, required: true }],
  },
  {
    name: 'info',
    readOnly: true,
    summary:
      'Show the current execution environment, live terminal sessions and retained processes.',
    program: CLOSED,
    fields: [],
  },
])

export const screenCommands: readonly Command[] = withHelp([
  {
    name: 'screens',
    readOnly: true,
    summary: 'List the screens of the machine: identifier, name, pixels, scale and place.',
    fields: [],
  },
  {
    name: 'capture',
    readOnly: true,
    summary: 'Take a picture of one screen so the model sees it.',
    fields: [
      {
        name: 'screen',
        kind: 'string',
        description:
          'The identifier of a screen, as screens lists it. Omit for the primary screen.',
      },
      {
        name: 'region',
        kind: 'region',
        description:
          'A rectangle of the screen to take instead of all of it, in its physical pixels as screens gives them: { x, y, width, height }. Take one to see small things larger.',
      },
    ],
  },
])

export const codeCommands: readonly Command[] = [
  {
    name: 'execute',
    summary: 'Run one TypeScript program and return its result.',
    fields: [
      {
        name: 'code',
        kind: 'text',
        description:
          'The body of an async function, in TypeScript. Top-level await and return work. Send real line breaks. Give code or path, not both.',
      },
      {
        name: 'path',
        kind: 'string',
        description:
          'The path of a file that holds such a body. The file is read once, now; later changes do not reach this run.',
      },
      {
        name: 'input',
        kind: 'json',
        description:
          'Optional JSON value, given as the value itself (an object as an object, not as a string that holds JSON). The program reads it as the constant input.',
      },
    ],
  },
  {
    name: 'help',
    readOnly: true,
    summary: 'Show how to write a program: the rules and the limits here.',
    fields: [],
  },
]
