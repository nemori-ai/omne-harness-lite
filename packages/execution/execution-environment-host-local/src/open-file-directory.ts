import { constants } from 'node:fs'
import { open, readlink, type FileHandle } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import type {
  FacilityResult,
  FileRequest,
  FilesScope,
  FileSystemFacility,
} from '@omne-harness/execution-environment-contract'
import { isHostPath, pathWithoutTrailingSlash, type CloseHandle } from './host-paths.ts'

/** Called only with the directory descriptor used by the original Linux operation. */
export async function openFileDirectory(
  handle: FileHandle,
  observe?: true,
): Promise<{ verifiedDirectories?: string[] }> {
  if (!observe) return {}
  try {
    const bytes = await readlink(`/proc/self/fd/${handle.fd}`, { encoding: 'buffer' })
    const path = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    if (isAbsolute(path) && !path.endsWith(' (deleted)')) return { verifiedDirectories: [path] }
  } catch {
    // A missing directory name does not change the original result.
  }
  return {}
}

export async function openDirectories(handles: Iterable<FileHandle>, observe?: true) {
  const directories = new Set<string>()
  if (observe) {
    for (const handle of handles) {
      const proof = await openFileDirectory(handle, observe)
      for (const directory of proof.verifiedDirectories ?? []) directories.add(directory)
    }
  }
  return directories.size ? { verifiedDirectories: [...directories].sort() } : {}
}

export function observeLinuxBasicFiles(
  files: FileSystemFacility<unknown>,
  scope: FilesScope,
  close: CloseHandle,
) {
  function pinned<Q extends FileRequest<unknown>, T extends object>(
    perform: (request: Q) => Promise<FacilityResult<T>>,
  ) {
    return async (request: Q): Promise<FacilityResult<T>> => {
      if (
        !request.observeDirectory ||
        request.binding.kind !== 'host_machine' ||
        !isHostPath(request.path)
      )
        return perform(request)
      request = {
        ...request,
        named: request.named && { ...request.named },
        binding: { ...request.binding },
        ...('bytes' in request && request.bytes instanceof Uint8Array
          ? { bytes: Uint8Array.from(request.bytes) }
          : {}),
      }
      const original = pathWithoutTrailingSlash(request.path)
      let parent: FileHandle
      try {
        parent = await open(dirname(original), constants.O_DIRECTORY | constants.O_RDONLY)
      } catch {
        return perform(request)
      }
      try {
        const directory = (await openFileDirectory(parent, true)).verifiedDirectories?.[0]
        if (!directory) return await perform(request)
        const name = basename(original) || '.'
        // Keeping the final "." makes lstat of the parent name the held directory, including on create.
        const path = `/proc/self/fd/${parent.fd}/./${name}${request.path.endsWith('/') ? '/' : ''}`
        const answer = await perform({ ...request, path })
        if (answer.kind !== 'done') return answer
        const entered =
          'type' in answer.value && answer.value.type === 'directory'
            ? join(directory, name)
            : directory
        return { ...answer, verifiedDirectories: [entered] }
      } finally {
        await close(parent)
      }
    }
  }
  if (scope.read === undefined) {
    files.read = pinned(files.read)
    files.stat = pinned(files.stat)
  }
  if (scope.write === undefined) files.write = pinned(files.write)
}
