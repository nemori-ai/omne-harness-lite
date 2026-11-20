import {
  fileEffects,
  withinScope,
  type FileEffect,
  type FilesScope,
  type ScopedFileOperation,
} from '@omne-harness/execution-environment-contract'
import { placePath, type WorkingDirectory } from './files-paths.ts'
import type { Arguments } from './protocol.ts'

const OPERATIONS: Readonly<Record<string, ScopedFileOperation>> = {
  read: 'read',
  info: 'stat',
  list: 'list',
  find: 'search',
  write: 'write',
  mkdir: 'mkdir',
  delete: 'remove',
  edit: 'commitBatch',
  patch: 'commitBatch',
  move: 'move',
  copy: 'copy',
}

type Asked = Readonly<{ path: string; effect: FileEffect }>

function askedOf(command: string, args: Arguments, directory: WorkingDirectory | undefined) {
  const operation = OPERATIONS[command]
  if (operation === undefined) return []
  const effects: Readonly<{ path: FileEffect; target?: FileEffect }> = fileEffects[operation]
  const paths = command === 'patch' ? args.edits().map(edit => edit.path) : [args.text('path')]
  const asked: Asked[] = paths.map(path => ({
    path: placePath(path, directory),
    effect: effects.path,
  }))
  if (effects.target !== undefined)
    asked.push({ path: placePath(args.text('target'), directory), effect: effects.target })
  return asked
}

const REFUSED = /^rejected request="[^"]*" reason=notAuthorized/u

// The fence decides; a refusal outside the files this call may reach only says why, by `withinScope`.
export function explainedRefusal(
  text: string,
  input: Readonly<{
    command: string
    args: Arguments
    scope: FilesScope | undefined
    directory: WorkingDirectory | undefined
  }>,
): string {
  const { scope } = input
  if (scope === undefined || !REFUSED.test(text)) return text
  const outside = askedOf(input.command, input.args, input.directory).find(
    asked => !withinScope(scope, asked.effect, asked.path),
  )
  if (outside === undefined) return text
  const doing = outside.effect === 'read' ? 'reading' : 'writing'
  return text.replace(
    'reason=notAuthorized',
    `reason=outsideScope path=${JSON.stringify(outside.path)} effect=${outside.effect} the setting for files outside the workspace keeps this call from ${doing} there`,
  )
}
