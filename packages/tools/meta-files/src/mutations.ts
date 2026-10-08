import type { FileFacility, FileBatchEntry } from '@omne-harness-lite/execution-environments'
import type { InvocationDependencies } from '@omne-harness-lite/tool-execution-runtime'
import type { FilesOptions } from './types.ts'
import { argumentSchemas, type PatchFile, type Edit } from './arguments.ts'
import { contentBytes, readWhole, utf8 } from './values.ts'
import { applyEdits, unifiedDiff } from './edits.ts'
import {
  batchReply,
  facilityFailure,
  label,
  recognitionReply,
  rejected,
  success,
} from './result.ts'

export interface FileCall {
  readonly files: FileFacility
  readonly resolve: (path: string) => string
  readonly deps: InvocationDependencies
  readonly options: FilesOptions
}
async function prepare(call: FileCall, target: PatchFile) {
  if (target.edits.length > call.options.maxEditsPerFile)
    return { error: rejected('capacity:edits', 'No target changes were submitted.') }
  const path = call.resolve(target.path)
  const original = await readWhole(call.files, path, call.options.maxReadBytes)
  if ('error' in original) return original
  if (original.ok.version !== target.expectedVersion)
    return {
      error: rejected('facility:conflict', 'Precheck failed. No target changes were submitted.'),
    }
  const before = utf8(original.ok.data)
  if (before === undefined) return { error: rejected('encoding:invalidUtf8') }
  const edited = applyEdits(before, target.edits)
  if ('reason' in edited)
    return { error: rejected(edited.reason, 'Precheck failed. No target changes were submitted.') }
  const data = contentBytes(edited.text, 'utf8')
  if (!data) return { error: rejected('encoding:invalidUtf8') }
  if (data.byteLength > call.options.maxWriteBytes)
    return { error: rejected('capacity:writeBytes') }
  const rendered = unifiedDiff(path, before, edited.text, call.options)
  if ('reason' in rendered)
    return {
      error: rejected(rendered.reason, 'Precheck failed. No target changes were submitted.'),
    }
  return {
    entry: { path, data, expectedVersion: target.expectedVersion } satisfies FileBatchEntry,
    diff: rendered.diff,
  }
}
export async function editFile(input: unknown, call: FileCall) {
  const args = argumentSchemas.edit.parse(input)
  const part: Edit = { match: args.match, replacement: args.replacement }
  const prepared = await prepare(call, {
    path: args.path,
    expectedVersion: args.expectedVersion,
    edits: [part],
  })
  if ('error' in prepared) return prepared.error
  if (call.deps.signal.aborted) return rejected('interrupted', 'No target changes were submitted.')
  const outcome = await call.files.write({
    ...prepared.entry,
    mode: 'replace',
    expectedVersion: args.expectedVersion,
  })
  if (outcome.kind === 'rejected') return facilityFailure(outcome)
  if (outcome.kind !== 'written') return batchReply(outcome, prepared.diff)
  return success(
    'Edit confirmed.',
    { path: label(outcome.path), version: label(outcome.version) },
    `CONFIRMED DIFF:\n${prepared.diff}`,
  )
}
export async function patchFiles(input: unknown, call: FileCall) {
  const args = argumentSchemas.patch.parse(input)
  if (args.recovery !== undefined) {
    const outcome = await call.files.recoverBatch(args.recovery)
    return outcome.kind === 'recognized' ? recognitionReply(outcome) : facilityFailure(outcome)
  }
  if (!args.files) return rejected('arguments:invalid')
  return submitPatch(args.files, call)
}
async function submitPatch(targets: readonly PatchFile[], call: FileCall) {
  if (targets.length > call.options.maxPatchFiles)
    return rejected('capacity:patchFiles', 'No target changes were submitted.')
  const paths = targets.map(value => call.resolve(value.path))
  if (new Set(paths).size !== paths.length)
    return rejected('patch:duplicatePath', 'No target changes were submitted.')
  const entries: FileBatchEntry[] = [],
    diffs: string[] = []
  for (const file of targets) {
    if (call.deps.signal.aborted)
      return rejected('interrupted', 'No target changes were submitted.')
    const prepared = await prepare(call, file)
    if ('error' in prepared) return prepared.error
    entries.push(prepared.entry)
    diffs.push(prepared.diff)
  }
  if (call.deps.signal.aborted) return rejected('interrupted', 'No target changes were submitted.')
  const outcome = await call.files.commitBatch({ entries })
  return outcome.kind === 'rejected'
    ? facilityFailure(outcome)
    : batchReply(outcome, diffs.join('\n'))
}
export async function writeFile(input: unknown, call: FileCall) {
  const args = argumentSchemas.write.parse(input)
  // Reject oversized strings before allocating decoded bytes.
  if (args.content.length > call.options.maxWriteBytes * 2) return rejected('capacity:writeBytes')
  const data = contentBytes(args.content, args.encoding)
  if (!data) return rejected('encoding:invalidContent')
  if (data.byteLength > call.options.maxWriteBytes) return rejected('capacity:writeBytes')
  const path = call.resolve(args.path)
  if (call.deps.signal.aborted) return rejected('interrupted', 'No target changes were submitted.')
  const outcome = await call.files.write({
    path,
    data,
    mode: args.mode,
    ...(args.expectedVersion === undefined ? {} : { expectedVersion: args.expectedVersion }),
  })
  if (outcome.kind === 'rejected') return facilityFailure(outcome)
  if (outcome.kind !== 'written') return batchReply(outcome, '')
  return success('File write confirmed.', {
    path: label(outcome.path),
    bytes: String(data.byteLength),
    version: label(outcome.version),
  })
}
