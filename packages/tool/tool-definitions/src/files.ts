import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  describedAdoption,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createAuthor } from './author.ts'
import { filesCommands } from './commands.ts'
import type { FilesAuthorEnvironment } from './environment.ts'
import { editFiles } from './files-edits.ts'
import {
  placedFiles,
  placePath,
  RELATIVE_PATH_DIAGNOSTIC,
  workingDirectoryOf,
  type PathNotes,
  type WorkingDirectory,
} from './files-paths.ts'
import { parseConstruction, type Arguments, type Field } from './protocol.ts'
import { confirmation, identityText, writeEffectOf } from './text.ts'

export const resultMaximumField: Field = {
  name: 'resultMaxBytes',
  kind: 'positive',
  required: true,
  description: 'Required positive safe integer for the complete returned UTF-8 text.',
}
const workingDirectoryField: Field = {
  name: 'cwd',
  kind: 'string',
  description:
    'Optional absolute workspace root. Relative request paths resolve against it before the facility call.',
}
export function createFilesAuthor(
  construction: JsonValue,
): ReturnType<
  ToolImplementationModule<FilesAuthorEnvironment, ToolMessageContentBlock>['createAuthor']
> {
  const parsed = parseConstruction(construction, [resultMaximumField, workingDirectoryField])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  const cwd = parsed.ok.optionalText('cwd')
  const directory = cwd === undefined ? undefined : workingDirectoryOf(cwd)
  if (cwd !== undefined && directory === undefined)
    return fail({ field: 'construction', reason: 'invalid-field:cwd' })
  return succeed(
    createAuthor<FilesAuthorEnvironment>(
      'Files',
      'Read, search, and modify files in the authorized execution environment. Relative paths, including ".", resolve against the workspace root.',
      filesCommands,
      ['files'],
      maximum,
      'Paths are absolute or relative to the workspace root, the same directory where Shell starts. Without a configured workspace root, use absolute paths. Resolution grants no access: a path outside the authorized files is still refused. Images and attachments are unsupported in this delivery. Text is UTF-8 with original line endings. Patch preflight changes nothing. Unknown batches must be recovered by their original identity, never resubmitted. A version is an observation, not authorization. Every final text has resultMaxBytes as its byte bound. Truncation preserves head and tail when the bound can hold its marker.',
      (command, args, environment) => executeFiles(command, args, environment, maximum, directory),
    ),
  )
}
export const filesToolModule: ToolImplementationModule<
  FilesAuthorEnvironment,
  ToolMessageContentBlock
> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Files',
    revision: '2',
    changes:
      'One declaration with the command in the call, the workspace root in the description, write with parents and help by command name.',
    commands: filesCommands,
  }),
  createAuthor: createFilesAuthor,
}

function page(args: Arguments) {
  return {
    ...(args.has('offset') ? { offset: args.number('offset', 0) } : {}),
    ...(args.has('limit') ? { limit: args.number('limit', 1) } : {}),
  }
}
function expected(args: Arguments) {
  const version = args.optionalText('expected_version')
  return version === undefined ? {} : { expectedVersion: version }
}
async function executeFiles(
  command: string,
  args: Arguments,
  environment: FilesAuthorEnvironment,
  maximum: number,
  directory: WorkingDirectory | undefined,
): Promise<string> {
  const notes: PathNotes = { relativeRefused: false }
  const text = await executeCommand(
    command,
    args,
    placedFiles(environment.files, directory, notes),
    maximum,
    directory,
  )
  return notes.relativeRefused
    ? `${text}
${RELATIVE_PATH_DIAGNOSTIC}`
    : text
}
async function executeCommand(
  command: string,
  args: Arguments,
  files: FilesAuthorEnvironment['files'],
  maximum: number,
  directory: WorkingDirectory | undefined,
): Promise<string> {
  const path = args.text('path')
  const resolved = placePath(path, directory)
  const header = `path=${JSON.stringify(path)}${resolved === path ? '' : ` resolved_path=${JSON.stringify(resolved)}`}`
  const operations: Record<string, () => Promise<string> | string> = {
    open: () =>
      `rejected reason=unsupported ${header}\nImage attachments are reserved for a later delivery.`,
    read: async () => {
      const offset = args.number('offset_bytes', 0)
      const result = await files.read({
        path,
        offsetBytes: offset,
        limitBytes: args.number('limit_bytes', maximum),
      })
      if (result.kind !== 'done') return confirmation(result, () => '')
      try {
        const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          result.value.bytes,
        )
        return confirmation(
          result,
          value =>
            `${header} ${identityText(value)}\noffset_bytes=${offset} next_offset_bytes=${value.nextOffsetBytes} eof=${value.eof}\n${content}`,
        )
      } catch {
        return `rejected reason=unsupported ${header} invalid UTF-8 page; use UTF-8 byte boundaries`
      }
    },
    write: async () => {
      const parent = args.flag('parents') ? parentOf(path) : undefined
      if (parent !== undefined) {
        const made = await files.mkdir({ path: parent, parents: true })
        // `conflict` means the directory is there already; the write itself reports any other.
        if (made.kind !== 'done' && !(made.kind === 'rejected' && made.reason === 'conflict'))
          return confirmation(made, () => '')
      }
      return confirmation(
        await files.write({
          path,
          bytes: new TextEncoder().encode(args.text('text')),
          mode: args.text('mode') === 'create' ? 'create' : 'replace',
          ...expected(args),
        }),
        value => `${header} ${identityText(value)} write_effect=${writeEffectOf(value)}`,
      )
    },
    edit: () =>
      editFiles(
        files,
        [{ path, old_text: args.text('old_text'), new_text: args.text('new_text') }],
        false,
      ),
    patch: () =>
      editFiles(
        files,
        args.edits().map(edit => ({ ...edit, path: placePath(edit.path, directory) })),
        true,
      ),
    list: async () => {
      const listed = await files.list({ path, ...page(args) })
      if (listed.kind !== 'done') return confirmation(listed, () => '')
      const entries: string[] = []
      for (const entry of listed.value.entries) {
        const name = 'name' in entry ? entry.name : undefined
        if (
          typeof name !== 'string' ||
          name === '' ||
          name === '.' ||
          name === '..' ||
          /[/\\]/u.test(name)
        )
          return 'unavailable reason=entry-name-unavailable no entries returned'
        entries.push(
          `${JSON.stringify(name)}\t${entry.type}\t${entry.sizeBytes}\t${identityText(entry)}`,
        )
      }
      return confirmation(
        listed,
        value =>
          `${header} ${identityText(value.directory)}\nnext_offset=${value.nextOffset ?? 'end'}\n${entries.join('\n')}`,
      )
    },
    find: async () =>
      confirmation(
        await files.search({
          path,
          pattern: new TextEncoder().encode(args.text('pattern')),
          match: args.text('match') === 'name' ? 'name' : 'content',
          recursive: args.flag('recursive'),
          ...page(args),
        }),
        value =>
          `${header} match=${args.text('match')} ${identityText(value.root)}\nnext_offset=${value.nextOffset ?? 'end'} facility_truncated=${value.truncated}\n${value.hits.map(hit => `${JSON.stringify(hit.path)} offset_bytes=${hit.offsetBytes ?? 'none'} object=${JSON.stringify(hit.object)}`).join('\n')}`,
      ),
    info: () => fileInfo(files, path, header, maximum),
    mkdir: async () =>
      confirmation(
        await files.mkdir({ path, parents: args.flag('parents') }),
        value => `${header} ${identityText(value)}`,
      ),
    delete: async () =>
      confirmation(
        await files.remove({ path, recursive: args.flag('recursive'), ...expected(args) }),
        value => `${header} removed=${JSON.stringify(value.removed)}`,
      ),
    move: () => transfer('move'),
    copy: () => transfer('copy'),
  }
  async function transfer(operation: 'move' | 'copy') {
    return confirmation(
      await files[operation]({
        path,
        target: { path: args.text('target') },
        replace: args.flag('replace'),
        ...expected(args),
      }),
      value =>
        `${header} target=${JSON.stringify(args.text('target'))} source=${JSON.stringify(value.source)} ${identityText(value.target)}`,
    )
  }
  const operation = operations[command]
  // The command table and this table name the same commands, so a miss is a defect, not a result.
  if (operation === undefined) throw new Error(`Files has no operation for command ${command}`)
  return operation()
}
/** The directory part of a request path, or undefined when it names no directory to create. */
function parentOf(path: string): string | undefined {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const parent = path.slice(0, cut)
  return cut <= 0 || parent.endsWith(':') ? undefined : parent
}
async function fileInfo(
  files: FilesAuthorEnvironment['files'],
  path: string,
  pathHeader: string,
  maximum: number,
): Promise<string> {
  const result = await files.stat({ path })
  if (result.kind !== 'done') return confirmation(result, () => '')
  const value = result.value
  const header = `${pathHeader} ${identityText(value)}\ntype=${value.type} size_bytes=${value.sizeBytes} modified_ms=${value.modifiedMs}`
  if (value.type !== 'file') return `done\n${header}\nbinary=not-sampled`
  const sample = await files.read({ path, offsetBytes: 0, limitBytes: Math.min(4096, maximum) })
  return `done stat\n${header}\n${confirmation(sample, observed => {
    if (observed.version !== value.version || observed.object.token !== value.object.token)
      return 'binary=unknown sample-version-conflict'
    let binary = observed.bytes.includes(0)
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(observed.bytes, { stream: !observed.eof })
    } catch {
      binary = true
    }
    return `binary_sample=${binary ? 'binary-observed' : 'no-binary-observed'} sample_bytes=${observed.bytes.byteLength} sample_eof=${observed.eof} (bounded observation, not a whole-file guarantee)`
  })}`
}
