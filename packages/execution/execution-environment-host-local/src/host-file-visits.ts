import { reject } from './host-paths.ts'
import { dirname, normalize } from 'node:path'
import type {
  FacilityResult,
  FilesScope,
  FileSystemFacility,
} from '@omne-harness/execution-environment-contract'

/** A rooted successful operation already proved its path has no redirected intermediate segment. */
export function attestFileDirectories(
  files: FileSystemFacility<unknown>,
  scope: FilesScope,
): FileSystemFacility<unknown> {
  const under = (effect: 'read' | 'write', path: string) =>
    scope[effect] === undefined ? [] : [normalize(path)]
  const add = <T>(answer: FacilityResult<T>, paths: readonly string[]): FacilityResult<T> =>
    answer.kind === 'done' && paths.length > 0
      ? {
          ...answer,
          verifiedDirectories: [
            ...new Set([...paths, ...(answer.verifiedDirectories ?? [])]),
          ].sort(),
        }
      : answer
  const run = async <T>(answer: Promise<FacilityResult<T>>, paths: readonly string[]) =>
    add(await answer, paths)
  return {
    ...files,
    read: request => run(files.read(request), under('read', dirname(request.path))),
    async stat(request) {
      const path = request.path
      const answer = await files.stat(request)
      return add(
        answer,
        under(
          'read',
          answer.kind === 'done' && answer.value.type === 'directory' ? path : dirname(path),
        ),
      )
    },
    write: request => run(files.write(request), under('write', dirname(request.path))),
    list: request => run(files.list(request), under('read', request.path)),
    search: request => run(files.search(request), under('read', request.path)),
    mkdir: request => run(files.mkdir(request), under('write', request.path)),
    remove: request => run(files.remove(request), under('write', dirname(request.path))),
    move: request =>
      run(files.move(request), [
        ...under('write', dirname(request.path)),
        ...under('write', dirname(request.target.path)),
      ]),
    copy: request =>
      run(files.copy(request), [
        ...under('read', dirname(request.path)),
        ...under('write', dirname(request.target.path)),
      ]),
    async commitBatch(request) {
      const answer = await files.commitBatch(request)
      return add(
        answer,
        answer.kind === 'done'
          ? answer.value.published.flatMap(path => under('write', dirname(path)))
          : [],
      )
    },
  }
}

export function createHostFileFacade(
  operations: FileSystemFacility<unknown>,
  scope: FilesScope,
  sealed: () => boolean,
): FileSystemFacility<unknown> {
  const unlessSealed =
    <Q extends { readonly requestId: string }, T>(
      run: (request: Q) => Promise<FacilityResult<T>>,
    ) =>
    async (request: Q): Promise<FacilityResult<T>> =>
      sealed() ? reject(request.requestId, 'closed') : run(request)
  return attestFileDirectories(
    {
      read: unlessSealed(operations.read),
      stat: unlessSealed(operations.stat),
      write: unlessSealed(operations.write),
      close: unlessSealed(operations.close),
      list: unlessSealed(operations.list),
      search: unlessSealed(operations.search),
      mkdir: unlessSealed(operations.mkdir),
      remove: unlessSealed(operations.remove),
      move: unlessSealed(operations.move),
      copy: unlessSealed(operations.copy),
      commitBatch: unlessSealed(operations.commitBatch),
      recoverBatch: unlessSealed(operations.recoverBatch),
    },
    scope,
  )
}
