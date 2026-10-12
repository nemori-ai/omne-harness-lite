import { formatKeyValue, formatNumberedLines, formatTable } from '@omne-harness-lite/unix-format'
import { argumentSchemas } from './arguments.ts'
import type { FileCall } from './mutations.ts'
import { facilityFailure, label, rejected, success } from './result.ts'
import { utf8 } from './values.ts'
export async function readFile(input: unknown, call: FileCall) {
  const args = argumentSchemas.read.parse(input)
  const limit = args.limitBytes ?? call.options.maxReadBytes
  if (limit > call.options.maxReadBytes) return rejected('capacity:readBytes')
  const value = await call.files.read({
    path: call.resolve(args.path),
    offsetBytes: args.offsetBytes ?? 0,
    limitBytes: limit,
  })
  if (value.kind !== 'read') return facilityFailure(value)
  const metadata = {
    path: label(value.path),
    offset_bytes: String(value.offsetBytes),
    next_offset_bytes: String(value.nextOffsetBytes),
    eof: String(value.eof),
    version: label(value.version),
  }
  if (args.encoding === 'base64')
    return success(
      'File byte range read.',
      metadata,
      `BASE64:\n${Buffer.from(value.data).toString('base64')}`,
    )
  const text = utf8(value.data)
  if (text === undefined) return rejected('encoding:invalidUtf8', formatKeyValue(metadata))
  const lines = text === '' ? [] : text.split('\n')
  return success(
    'File text range read.',
    {
      ...metadata,
      numbering: value.offsetBytes === 0 ? 'file lines from 1' : 'fragment-local lines from 1',
      final_newline: String(text.endsWith('\n')),
    },
    formatNumberedLines(lines, { maxWidth: 0 }),
  )
}
export async function listFiles(input: unknown, call: FileCall) {
  const args = argumentSchemas.list.parse(input),
    limit = args.limit ?? call.options.maxPageEntries
  if (limit > call.options.maxPageEntries) return rejected('capacity:pageEntries')
  const value = await call.files.list({
    path: call.resolve(args.path),
    offset: args.offset ?? 0,
    limit,
  })
  if (value.kind !== 'listed') return facilityFailure(value)
  return success(
    'Directory page read.',
    { next_offset: value.nextOffset === undefined ? 'none' : String(value.nextOffset) },
    formatTable(
      ['TYPE', 'BYTES', 'PATH', 'VERSION'],
      value.values.map(entry => [
        entry.type,
        String(entry.sizeBytes),
        label(entry.path),
        label(entry.version),
      ]),
      { maxWidth: 0 },
    ),
  )
}
export async function findFiles(input: unknown, call: FileCall) {
  const args = argumentSchemas.find.parse(input),
    limit = args.limit ?? call.options.maxPageEntries
  if (limit > call.options.maxPageEntries) return rejected('capacity:pageEntries')
  const value = await call.files.search({
    path: call.resolve(args.root),
    match: args.mode,
    pattern: args.pattern,
    recursive: args.recursive,
    offset: args.offset ?? 0,
    limit,
  })
  if (value.kind !== 'found') return facilityFailure(value)
  return success(
    'Search page read.',
    {
      next_offset: value.nextOffset === undefined ? 'none' : String(value.nextOffset),
      truncated: String(value.truncated),
      match: args.mode,
    },
    formatTable(
      ['PATH', 'OFFSET_BYTES'],
      value.values.map(entry => [
        label(entry.path),
        entry.offsetBytes === undefined ? '-' : String(entry.offsetBytes),
      ]),
      { maxWidth: 0 },
    ),
  )
}
async function contentObservation(
  call: FileCall,
  path: string,
): Promise<Readonly<Record<string, string>>> {
  const read = await call.files.read({
    path,
    offsetBytes: 0,
    limitBytes: Math.min(4096, call.options.maxReadBytes),
  })
  if (read.kind !== 'read') return { content_observation: `unavailable:${read.reason}` }
  let binary = read.data.includes(0)
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(read.data, { stream: !read.eof })
  } catch {
    binary = true
  }
  return {
    binary_sample: String(binary),
    sampled_bytes: String(read.data.byteLength),
    sample_complete: String(read.eof),
    classification: 'NUL or invalid UTF-8 in observed sample; not a MIME guarantee',
  }
}
export async function fileInfo(input: unknown, call: FileCall) {
  const args = argumentSchemas.info.parse(input)
  const value = await call.files.stat(call.resolve(args.path))
  if (value.kind !== 'stat') return facilityFailure(value)
  const entry = value.value
  const content = entry.type === 'file' ? await contentObservation(call, entry.path) : {}
  return success('File metadata read.', {
    path: label(entry.path),
    type: entry.type,
    bytes: String(entry.sizeBytes),
    modified_ms: String(entry.modifiedMs),
    version: label(entry.version),
    version_kind: 'metadata identity; not an atomic external-write guard',
    ...content,
  })
}
export async function transferFile(command: 'move' | 'copy', input: unknown, call: FileCall) {
  const args = argumentSchemas[command].parse(input)
  const outcome = await call.files[command]({
    source: call.resolve(args.from),
    target: call.resolve(args.to),
    replace: args.replace,
    ...(args.expectedVersion === undefined ? {} : { expectedVersion: args.expectedVersion }),
  })
  if (outcome.kind === 'rejected') return facilityFailure(outcome)
  return success(command === 'move' ? 'Path move confirmed.' : 'File copy confirmed.', {
    source: label(outcome.source),
    target: label(outcome.target),
  })
}
export async function deleteFile(input: unknown, call: FileCall) {
  const args = argumentSchemas.delete.parse(input)
  const value = await call.files.remove({
    path: call.resolve(args.path),
    recursive: args.recursive,
    ...(args.expectedVersion === undefined ? {} : { expectedVersion: args.expectedVersion }),
  })
  return value.kind === 'rejected'
    ? facilityFailure(value)
    : success('Path removal confirmed.', { path: label(value.path) })
}
export async function mkdir(input: unknown, call: FileCall) {
  const args = argumentSchemas.mkdir.parse(input)
  const value = await call.files.mkdir({ path: call.resolve(args.path), parents: args.parents })
  return value.kind === 'rejected'
    ? facilityFailure(value)
    : success('Directory creation confirmed.', { path: label(value.path) })
}
