import { posix, win32 } from 'node:path'
import type { FilesAuthorEnvironment } from './environment.ts'

type Files = FilesAuthorEnvironment['files']
type PathFlavor = typeof posix

export type WorkingDirectory = Readonly<{ path: string; flavor: PathFlavor }>

const windowsRoot = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/u
const driveRelative = /^[A-Za-z]:(?![\\/])/u

export function workingDirectoryOf(text: string): WorkingDirectory | undefined {
  if (windowsRoot.test(text)) return { path: text, flavor: win32 }
  if (text.startsWith('/')) return { path: text, flavor: posix }
  return undefined
}

function isRelative(path: string, flavor: PathFlavor): boolean {
  return !flavor.isAbsolute(path) && !(flavor === win32 && driveRelative.test(path))
}

function keepTrailingSeparator(given: string, resolved: string, flavor: PathFlavor): string {
  const separators = flavor === win32 ? /[\\/]$/u : /\/$/u
  return separators.test(given) && !separators.test(resolved) ? resolved + flavor.sep : resolved
}

export function placePath(path: string, directory: WorkingDirectory | undefined): string {
  if (directory === undefined || !isRelative(path, directory.flavor)) return path
  return keepTrailingSeparator(
    path,
    directory.flavor.resolve(directory.path, path),
    directory.flavor,
  )
}

export function looksRelative(path: string): boolean {
  return isRelative(path, posix) && isRelative(path, win32)
}

export type PathNotes = { relativeRefused: boolean }

export function placedFiles(
  files: Files,
  directory: WorkingDirectory | undefined,
  notes: PathNotes,
): Files {
  const place = (path: string) => placePath(path, directory)
  const watch = async <T extends { readonly kind: string }>(
    paths: readonly string[],
    result: Promise<T>,
  ): Promise<T> => {
    const answer = await result
    if (
      directory === undefined &&
      answer.kind === 'rejected' &&
      Reflect.get(answer, 'reason') === 'invalidInput' &&
      paths.some(looksRelative)
    )
      notes.relativeRefused = true
    return answer
  }
  return {
    read: request => watch([request.path], files.read({ ...request, path: place(request.path) })),
    stat: request => watch([request.path], files.stat({ ...request, path: place(request.path) })),
    write: request => watch([request.path], files.write({ ...request, path: place(request.path) })),
    close: request => files.close(request),
    list: request => watch([request.path], files.list({ ...request, path: place(request.path) })),
    search: request =>
      watch([request.path], files.search({ ...request, path: place(request.path) })),
    mkdir: request => watch([request.path], files.mkdir({ ...request, path: place(request.path) })),
    remove: request =>
      watch([request.path], files.remove({ ...request, path: place(request.path) })),
    move: request =>
      watch(
        [request.path, request.target.path],
        files.move({
          ...request,
          path: place(request.path),
          target: { ...request.target, path: place(request.target.path) },
        }),
      ),
    copy: request =>
      watch(
        [request.path, request.target.path],
        files.copy({
          ...request,
          path: place(request.path),
          target: { ...request.target, path: place(request.target.path) },
        }),
      ),
    commitBatch: request =>
      watch(
        request.entries.map(entry => entry.path),
        files.commitBatch({
          ...request,
          entries: request.entries.map(entry => ({ ...entry, path: place(entry.path) })),
        }),
      ),
    recoverBatch: request => files.recoverBatch(request),
  }
}

export const RELATIVE_PATH_DIAGNOSTIC =
  'Relative paths need a workspace root, and none is configured for Files. Use an absolute path.'
