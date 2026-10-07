import type { FileFacility, CommandFacility } from './facilities.ts'
import { type Check, shape, text, offset, flag, reference, bytes } from './facility-input.ts'
import { isCommandProcess } from './process-data.ts'
const texts: Check = value => Array.isArray(value) && value.every(text)
const oneOf =
  (values: readonly string[]): Check =>
  value =>
    typeof value === 'string' && values.includes(value)
const failures = [
  'invalidInput',
  'notAuthorized',
  'closed',
  'notFound',
  'unavailable',
  'effectUnknown',
  'conflict',
  'busy',
  'capacity',
  'unsupported',
]
const rejected: Check = value =>
  shape(value, { kind: v => v === 'rejected', reason: oneOf(failures) }, ['kind', 'reason'])
const info: Check = value =>
  shape(
    value,
    {
      path: text,
      type: oneOf(['file', 'directory', 'symlink']),
      sizeBytes: offset,
      modifiedMs: v => typeof v === 'number' && Number.isFinite(v),
      version: text,
    },
    ['path', 'type', 'sizeBytes', 'modifiedMs', 'version'],
  )
const hit: Check = value => shape(value, { path: text, offsetBytes: offset }, ['path'])
const terminalInfo: Check = value =>
  shape(
    value,
    {
      terminal: reference,
      state: oneOf(['idle', 'running', 'invalid', 'closed']),
      observedCwd: text,
    },
    ['terminal', 'state', 'observedCwd'],
  )
const arrayOf =
  (check: Check): Check =>
  value =>
    Array.isArray(value) && value.every(check)
function result(
  kind: string,
  fields: Readonly<Record<string, Check>>,
  required: readonly string[],
): Check {
  return value => shape(value, { kind: v => v === kind, ...fields }, ['kind', ...required])
}
const batch: Check = value =>
  result('committed', { batch: reference, published: texts }, ['batch', 'published'])(value) ||
  result(
    'unknown',
    {
      batch: reference,
      published: texts,
      reason: oneOf(['effectUnknown', 'conflict', 'closed', 'unavailable']),
    },
    ['batch', 'published', 'reason'],
  )(value)
const fileResults: Record<keyof FileFacility, Check> = {
  read: result(
    'read',
    {
      path: text,
      data: bytes,
      offsetBytes: offset,
      nextOffsetBytes: offset,
      eof: flag,
      version: text,
    },
    ['path', 'data', 'offsetBytes', 'nextOffsetBytes', 'eof', 'version'],
  ),
  write: value =>
    result('written', { path: text, version: text }, ['path', 'version'])(value) || batch(value),
  stat: result('stat', { value: info }, ['value']),
  list: result('listed', { values: arrayOf(info), nextOffset: offset }, ['values']),
  search: result('found', { values: arrayOf(hit), nextOffset: offset, truncated: flag }, [
    'values',
    'truncated',
  ]),
  move: result('moved', { source: text, target: text }, ['source', 'target']),
  copy: result('copied', { source: text, target: text }, ['source', 'target']),
  remove: result('removed', { path: text }, ['path']),
  mkdir: result('created', { path: text }, ['path']),
  commitBatch: batch,
  recoverBatch: result(
    'recognized',
    {
      batch: reference,
      state: oneOf(['complete', 'partial', 'interrupted', 'conflict', 'pending']),
      matchingPrepared: texts,
      published: texts,
      conflicting: texts,
    },
    ['batch', 'state', 'matchingPrepared', 'published', 'conflicting'],
  ),
}
const commandResults: Record<Exclude<keyof CommandFacility, 'start' | 'executeTerminal'>, Check> = {
  createTerminal: result('created', { terminal: reference }, ['terminal']),
  closeTerminal: result('closed', { status: oneOf(['confirmed', 'unconfirmed']) }, ['status']),
  terminals: result('terminals', { values: arrayOf(terminalInfo) }, ['values']),
}
/** Returned data has independent ownership. Process handles retain their original controls. */
export function captureFileResult<M extends keyof FileFacility>(
  method: M,
  input: unknown,
): Awaited<ReturnType<FileFacility[M]>> | undefined {
  try {
    const owned: unknown = structuredClone(input)
    return rejected(owned) || fileResults[method](owned)
      ? (owned as Awaited<ReturnType<FileFacility[M]>>)
      : undefined
  } catch {
    return undefined
  }
}
export function captureCommandResult<M extends keyof CommandFacility>(
  method: M,
  input: unknown,
): Awaited<ReturnType<CommandFacility[M]>> | undefined {
  try {
    if (method === 'start' || method === 'executeTerminal') {
      if (
        shape(input, { kind: v => v === 'started', process: isCommandProcess }, ['kind', 'process'])
      )
        return input as Awaited<ReturnType<CommandFacility[M]>>
      return rejected(input)
        ? (structuredClone(input) as Awaited<ReturnType<CommandFacility[M]>>)
        : undefined
    }
    const owned: unknown = structuredClone(input)
    return rejected(owned) || commandResults[method as keyof typeof commandResults](owned)
      ? (owned as Awaited<ReturnType<CommandFacility[M]>>)
      : undefined
  } catch {
    return undefined
  }
}
