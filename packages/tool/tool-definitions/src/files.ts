import type { FacilityResult, FileIdentity } from '@omne-harness/execution-environment-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  describedAdoption,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createAuthor, type CommandGates } from './author.ts'
import { filesCommands } from './commands.ts'
import type { FilesAuthorEnvironment } from './environment.ts'
import { editFiles } from './files-edits.ts'
import { openLimitFields, openLimits, openPicture, type OpenLimits } from './files-open.ts'
import { explainedRefusal } from './files-refusal.ts'
import { pictureResult } from './pictures.ts'
import {
  placedFiles,
  placePath,
  RELATIVE_PATH_DIAGNOSTIC,
  workingDirectoryOf,
  type PathNotes,
  type WorkingDirectory,
} from './files-paths.ts'
import { parseConstruction, type Arguments, type Field } from './protocol.ts'
import type { Answer } from './program-side.ts'
import { confirmation, identityText, writeEffectOf } from './text.ts'

/** The most one read takes, whatever the call asks: a page always fits the value a program is given. */
export const READ_PAGE_MAX_BYTES = 1024 * 1024
export const resultMaximumField: Field = {
  name: 'resultMaxBytes',
  kind: 'positive',
  required: true,
  description: 'Required positive safe integer for the complete returned UTF-8 text.',
}
export function createFilesAuthor(
  construction: JsonValue,
): ReturnType<
  ToolImplementationModule<FilesAuthorEnvironment, ToolMessageContentBlock>['createAuthor']
> {
  const parsed = parseConstruction(construction, [resultMaximumField, ...openLimitFields])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  const limits = openLimits((name, minimum) => parsed.ok.number(name, minimum))
  return succeed(
    createAuthor<FilesAuthorEnvironment>(
      'Files',
      'Read, search, and modify files in the authorized execution environment. Relative paths, including ".", resolve against the working directory of the session.',
      filesCommands,
      ['files'],
      maximum,
      'Paths are absolute or relative to the working directory of the session, the same directory where Shell starts. A call with no working directory takes absolute paths only. Resolution grants no access: a path outside the authorized files is still refused. open reads one static PNG, JPEG or WebP picture within the configured limits and returns it for the model to see; an animated, damaged or oversized picture is refused. Text is UTF-8 with original line endings. Patch preflight changes nothing. Unknown batches must be recovered by their original identity, never resubmitted. A version is an observation, not authorization. Every final text has resultMaxBytes as its byte bound. Truncation preserves head and tail when the bound can hold its marker.',
      (command, args, environment) => executeFiles(command, args, environment, maximum),
      {
        gates: FILES_GATES,
        structured: {
          open: {
            modalities: ['image'],
            execute: (args, environment) => openFile(args, environment, limits),
          },
        },
      },
    ),
  )
}

const FILES_GATES: CommandGates = {
  gates: [
    { id: 'read', title: '读', default: 'auto' },
    { id: 'write', title: '写', default: 'ask' },
  ],
  of: {
    help: 'read',
    read: 'read',
    open: 'read',
    list: 'read',
    find: 'read',
    info: 'read',
    write: 'write',
    edit: 'write',
    patch: 'write',
    move: 'write',
    copy: 'write',
    delete: 'write',
    mkdir: 'write',
  },
}
export const filesToolModule: ToolImplementationModule<
  FilesAuthorEnvironment,
  ToolMessageContentBlock
> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Files',
    revision: '4',
    returns: 'Published raw value, model body and system offloading policy.',
    changes:
      'Relative paths resolve against the working directory of the call, taken from its environment; the construction names no directory.',
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
/** Runs one command against files placed in the working directory; the note says a relative path had none. */
async function placed<T>(
  environment: FilesAuthorEnvironment,
  work: (
    files: FilesAuthorEnvironment['files'],
    directory: WorkingDirectory | undefined,
  ) => Promise<T>,
): Promise<Readonly<{ value: T; note: string }>> {
  // A directory that is not an absolute path resolves nothing: relative paths are refused as with none.
  const directory =
    environment.directory === undefined ? undefined : workingDirectoryOf(environment.directory)
  const notes: PathNotes = { relativeRefused: false }
  const value = await work(placedFiles(environment.files, directory, notes), directory)
  return { value, note: notes.relativeRefused ? `\n${RELATIVE_PATH_DIAGNOSTIC}` : '' }
}
const headerOf = (path: string, directory: WorkingDirectory | undefined): string => {
  const resolved = placePath(path, directory)
  return `path=${JSON.stringify(path)}${resolved === path ? '' : ` resolved_path=${JSON.stringify(resolved)}`}`
}
async function executeFiles(
  command: string,
  args: Arguments,
  environment: FilesAuthorEnvironment,
  maximum: number,
): Promise<Answer> {
  const { value, note } = await placed(environment, async (files, directory) => {
    const answer = await executeCommand(command, args, files, maximum, directory)
    const said = { command, args, scope: environment.scope, directory }
    return { ...answer, text: explainedRefusal(answer.text, said) }
  })
  return { ...value, text: `${value.text}${note}` }
}
async function openFile(args: Arguments, environment: FilesAuthorEnvironment, limits: OpenLimits) {
  const path = args.text('path')
  const { value: opened, note } = await placed(environment, async (files, directory) => {
    const header = headerOf(path, directory)
    const done = await openPicture(path, header, { files, media: environment.media }, limits)
    const said = { command: 'open', args, scope: environment.scope, directory }
    return { ...done, text: explainedRefusal(done.text, said) }
  })
  return pictureResult('Files.open', { ...opened, text: `${opened.text}${note}` }, 'text')
}
/** The answer of one facility request: the confirmation as text and, when it was done, a value. */
function answered<T>(
  result: FacilityResult<T>,
  render: (value: T) => string,
  data: (value: T) => unknown,
): Answer {
  const text = confirmation(result, render)
  return result.kind === 'done' ? { text, data: data(result.value) } : { text }
}
type Files = FilesAuthorEnvironment['files']
async function readPage(files: Files, args: Arguments, header: string, maximum: number) {
  const offset = args.number('offset_bytes', 0)
  const result = await files.read({
    path: args.text('path'),
    offsetBytes: offset,
    limitBytes: Math.min(args.number('limit_bytes', maximum), READ_PAGE_MAX_BYTES),
  })
  if (result.kind !== 'done') return { text: confirmation(result, () => '') }
  const page = result.value
  try {
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(page.bytes)
    return answered(
      result,
      value =>
        `${header} ${identityText(value)}\noffset_bytes=${offset} next_offset_bytes=${value.nextOffsetBytes} eof=${value.eof}\n${content}`,
      value => ({
        text: content,
        offset_bytes: offset,
        next_offset_bytes: value.nextOffsetBytes,
        eof: value.eof,
        version: value.version,
      }),
    )
  } catch {
    return {
      text: `rejected reason=unsupported ${header} invalid UTF-8 page; use UTF-8 byte boundaries`,
    }
  }
}
async function listEntries(files: Files, args: Arguments, header: string): Promise<Answer> {
  const listed = await files.list({ path: args.text('path'), ...page(args) })
  if (listed.kind !== 'done') return { text: confirmation(listed, () => '') }
  const lines: string[] = []
  const entries: unknown[] = []
  for (const entry of listed.value.entries) {
    const name = 'name' in entry ? entry.name : undefined
    if (
      typeof name !== 'string' ||
      name === '' ||
      name === '.' ||
      name === '..' ||
      /[/\\]/u.test(name)
    )
      return { text: 'unavailable reason=entry-name-unavailable no entries returned' }
    lines.push(`${JSON.stringify(name)}\t${entry.type}\t${entry.sizeBytes}\t${identityText(entry)}`)
    entries.push({ name, type: entry.type, size_bytes: entry.sizeBytes })
  }
  return answered(
    listed,
    value =>
      `${header} ${identityText(value.directory)}\nnext_offset=${value.nextOffset ?? 'end'}\n${lines.join('\n')}`,
    value => ({ entries, next_offset: value.nextOffset ?? null }),
  )
}
async function executeCommand(
  command: string,
  args: Arguments,
  files: Files,
  maximum: number,
  directory: WorkingDirectory | undefined,
): Promise<Answer> {
  const path = args.text('path')
  const header = headerOf(path, directory)
  const identified = (value: FileIdentity) => ({ version: value.version })
  const operations: Record<string, () => Promise<Answer>> = {
    read: async () => readPage(files, args, header, maximum),
    write: async () => {
      const parent = args.flag('parents') ? parentOf(path) : undefined
      if (parent !== undefined) {
        const made = await files.mkdir({ path: parent, parents: true })
        if (made.kind !== 'done' && !(made.kind === 'rejected' && made.reason === 'conflict'))
          return { text: confirmation(made, () => '') }
      }
      return answered(
        await files.write({
          path,
          bytes: new TextEncoder().encode(args.text('text')),
          mode: args.text('mode') === 'create' ? 'create' : 'replace',
          ...expected(args),
        }),
        value => `${header} ${identityText(value)} write_effect=${writeEffectOf(value)}`,
        value => ({ version: value.version, effect: writeEffectOf(value) }),
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
    list: () => listEntries(files, args, header),
    find: async () =>
      answered(
        await files.search({
          path,
          pattern: new TextEncoder().encode(args.text('pattern')),
          match: args.text('match') === 'name' ? 'name' : 'content',
          recursive: args.flag('recursive'),
          ...page(args),
        }),
        value =>
          `${header} match=${args.text('match')} ${identityText(value.root)}\nnext_offset=${value.nextOffset ?? 'end'} facility_truncated=${value.truncated}\n${value.hits.map(hit => `${JSON.stringify(hit.path)} offset_bytes=${hit.offsetBytes ?? 'none'} object=${JSON.stringify(hit.object)}`).join('\n')}`,
        value => ({
          hits: value.hits.map(hit => ({ path: hit.path, offset_bytes: hit.offsetBytes ?? null })),
          next_offset: value.nextOffset ?? null,
          truncated: value.truncated,
        }),
      ),
    info: () => fileInfo(files, path, header, maximum),
    mkdir: async () =>
      answered(
        await files.mkdir({ path, parents: args.flag('parents') }),
        value => `${header} ${identityText(value)}`,
        identified,
      ),
    delete: async () =>
      answered(
        await files.remove({ path, recursive: args.flag('recursive'), ...expected(args) }),
        value => `${header} removed=${JSON.stringify(value.removed)}`,
        () => ({ removed: true }),
      ),
    move: () => transfer('move'),
    copy: () => transfer('copy'),
  }
  async function transfer(operation: 'move' | 'copy') {
    return answered(
      await files[operation]({
        path,
        target: { path: args.text('target') },
        replace: args.flag('replace'),
        ...expected(args),
      }),
      value =>
        `${header} target=${JSON.stringify(args.text('target'))} source=${JSON.stringify(value.source)} ${identityText(value.target)}`,
      value => identified(value.target),
    )
  }
  const operation = operations[command]
  if (operation === undefined) throw new Error(`Files has no operation for command ${command}`)
  return operation()
}
function parentOf(path: string): string | undefined {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const parent = path.slice(0, cut)
  return cut <= 0 || parent.endsWith(':') ? undefined : parent
}
async function fileInfo(
  files: Files,
  path: string,
  pathHeader: string,
  maximum: number,
): Promise<Answer> {
  const result = await files.stat({ path })
  if (result.kind !== 'done') return { text: confirmation(result, () => '') }
  const value = result.value
  const data = {
    type: value.type,
    size_bytes: value.sizeBytes,
    modified_ms: value.modifiedMs,
    version: value.version,
  }
  const header = `${pathHeader} ${identityText(value)}\ntype=${value.type} size_bytes=${value.sizeBytes} modified_ms=${value.modifiedMs}`
  if (value.type !== 'file') return { text: `done\n${header}\nbinary=not-sampled`, data }
  const sample = await files.read({ path, offsetBytes: 0, limitBytes: Math.min(4096, maximum) })
  const sampled = confirmation(sample, observed => {
    if (observed.version !== value.version || observed.object.token !== value.object.token)
      return 'binary=unknown sample-version-conflict'
    let binary = observed.bytes.includes(0)
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(observed.bytes, { stream: !observed.eof })
    } catch {
      binary = true
    }
    return `binary_sample=${binary ? 'binary-observed' : 'no-binary-observed'} sample_bytes=${observed.bytes.byteLength} sample_eof=${observed.eof} (bounded observation, not a whole-file guarantee)`
  })
  return { text: `done stat\n${header}\n${sampled}`, data }
}
