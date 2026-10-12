import type { CommandFacility, FileFacility } from './facilities.ts'
import { captureCommandRequest } from './command-request.ts'

import {
  type Check,
  text,
  flag,
  positive,
  offset,
  bytes,
  shape,
  env,
  reference,
} from './facility-input.ts'
const sourceTarget = { source: text, target: text, replace: flag, expectedVersion: text }
const batchEntry: Check = value =>
  shape(value, { path: text, data: bytes, expectedVersion: v => v === null || text(v) }, [
    'path',
    'data',
    'expectedVersion',
  ])
const fileChecks: Record<keyof FileFacility, Check> = {
  read: value => shape(value, { path: text, offsetBytes: offset, limitBytes: positive }, ['path']),
  write: value =>
    shape(
      value,
      {
        path: text,
        data: bytes,
        mode: v => v === 'create' || v === 'replace',
        expectedVersion: text,
      },
      ['path', 'data', 'mode'],
    ),
  stat: text,
  list: value => shape(value, { path: text, offset, limit: positive }, ['path']),
  search: value =>
    shape(
      value,
      {
        path: text,
        pattern: text,
        match: v => v === 'name' || v === 'content',
        recursive: flag,
        offset,
        limit: positive,
      },
      ['path', 'pattern', 'match', 'recursive'],
    ),
  move: value => shape(value, sourceTarget, ['source', 'target', 'replace']),
  copy: value => shape(value, sourceTarget, ['source', 'target', 'replace']),
  remove: value =>
    shape(value, { path: text, recursive: flag, expectedVersion: text }, ['path', 'recursive']),
  mkdir: value => shape(value, { path: text, parents: flag }, ['path', 'parents']),
  commitBatch: value =>
    shape(value, { entries: v => Array.isArray(v) && v.length > 0 && v.every(batchEntry) }, [
      'entries',
    ]),
  recoverBatch: reference,
}
const commandChecks: Record<keyof CommandFacility, Check> = {
  start: value => captureCommandRequest(value) !== undefined,
  createTerminal: value => shape(value, { cwd: text, env }, ['cwd', 'env']),
  executeTerminal: value =>
    shape(value, { terminal: reference, script: text, cwd: text, env, stdin: bytes }, [
      'terminal',
      'script',
    ]),
  closeTerminal: reference,
  terminals: () => true,
}
export const commandFacilityMethods = Object.freeze(
  Object.keys(commandChecks) as (keyof CommandFacility)[],
)
export const fileFacilityMethods = Object.freeze(Object.keys(fileChecks) as (keyof FileFacility)[])

function captureArguments(
  input: readonly unknown[],
  check: Check,
  arity = 1,
): readonly unknown[] | undefined {
  try {
    const owned: unknown = structuredClone(input)
    if (!Array.isArray(owned) || owned.length !== arity) return undefined
    return arity === 0 || check(owned[0]) ? owned : undefined
  } catch {
    return undefined
  }
}
/** Owns arguments before authority waits. Provider capacity checks remain separate. */
export function captureFileArguments<M extends keyof FileFacility>(
  method: M,
  input: readonly unknown[],
): Parameters<FileFacility[M]> | undefined {
  return captureArguments(input, fileChecks[method]) as Parameters<FileFacility[M]> | undefined
}
export function captureCommandArguments<M extends keyof CommandFacility>(
  method: M,
  input: readonly unknown[],
): Parameters<CommandFacility[M]> | undefined {
  return captureArguments(input, commandChecks[method], method === 'terminals' ? 0 : 1) as
    Parameters<CommandFacility[M]> | undefined
}
