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
import { parseConstruction, type Arguments, type Field } from './protocol.ts'
import { confirmation, identityText, writeEffectOf } from './text.ts'

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
  const parsed = parseConstruction(construction, [resultMaximumField])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  return succeed(
    createAuthor<FilesAuthorEnvironment>(
      'Files',
      'Read, search, and modify files in the authorized execution environment.',
      filesCommands,
      ['files'],
      maximum,
      'Images and attachments are unsupported in this delivery. Text is UTF-8 with original line endings. Patch preflight changes nothing. Unknown batches must be recovered by their original identity, never resubmitted. A version is an observation, not authorization. Every final text has resultMaxBytes as its byte bound. Truncation preserves head and tail when the bound can hold its marker.',
      (command, args, environment) => executeFiles(command, args, environment, maximum),
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
    revision: '1',
    changes: 'Bound files facade, exact UTF-8 edits and one preflighted batch submission.',
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
): Promise<string> {
  const files = environment.files
  const path = args.text('path')
  const header = `path=${JSON.stringify(path)}`
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
    write: async () =>
      confirmation(
        await files.write({
          path,
          bytes: new TextEncoder().encode(args.text('text')),
          mode: args.text('mode') === 'create' ? 'create' : 'replace',
          ...expected(args),
        }),
        value => `${header} ${identityText(value)} write_effect=${writeEffectOf(value)}`,
      ),
    edit: () =>
      editFiles(
        files,
        [{ path, old_text: args.text('old_text'), new_text: args.text('new_text') }],
        false,
      ),
    patch: () => editFiles(files, args.edits(), true),
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
    info: () => fileInfo(files, path, maximum),
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
  return operations[command]?.() ?? 'rejected reason=unknown-command'
}
async function fileInfo(
  files: FilesAuthorEnvironment['files'],
  path: string,
  maximum: number,
): Promise<string> {
  const result = await files.stat({ path })
  if (result.kind !== 'done') return confirmation(result, () => '')
  const value = result.value
  const header = `path=${JSON.stringify(path)} ${identityText(value)}\ntype=${value.type} size_bytes=${value.sizeBytes} modified_ms=${value.modifiedMs}`
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
