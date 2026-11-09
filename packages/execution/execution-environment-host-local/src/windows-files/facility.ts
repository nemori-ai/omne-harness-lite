import { randomUUID } from 'node:crypto'
import { access, lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import type {
  FileIdentity,
  FileInformation,
  FileRequest,
  FileSystemFacility,
  HandleGeneration,
  ObjectToken,
  ProviderFacts,
} from '@omne-harness/execution-environment-contract'
import type { HostFilesLimits } from '../host-file-tree.ts'
import { fail, failed, ok, reject, unknown, type Outcome } from '../host-paths.ts'
import { windowsPathSegments, windowsSegmentsBelow } from '../root-segments.ts'
import { frameworkAssembly } from '../windows-native/compile.ts'
import { getWindowsFilesHelper } from './helper.ts'
import type { ChangeInput, Final, Metadata, NativeInput, RunInput, Start } from './protocol.ts'

const invoke = (input: NativeInput, boundMs?: number) =>
  getWindowsFilesHelper().request(input, boundMs)

/** How the last segment of `path` is opened: see `Final`. */
function finalOf(path: string): Final {
  const follow = path.split(/[\\/]/u).findLast(part => part !== '') === '.'
  return { directory: follow || /[\\/]$/u.test(path), follow }
}

/**
 * The helper reads its frames with the .NET JSON serializer, which turns an unpaired surrogate into
 * U+FFFD. A path with one would name another object, so it is unsupported, with or without a root.
 */
const carried = (path: string): boolean => path.isWellFormed()

/**
 * The start of a path when no files root is configured: the root of its drive. A form outside the
 * supported range answers `unsupported`; a `..` answers `notAuthorized`, as it does below a root.
 */
function driveStart(path: string): Outcome<Start> {
  if (!carried(path)) return fail('unsupported')
  const parsed = windowsPathSegments(path)
  if (!parsed.ok) return fail(parsed.refusal === 'parent' ? 'notAuthorized' : 'unsupported')
  const root = `${parsed.drive}\\`
  return ok({ root, expectedRoot: '', segments: parsed.segments, rooted: false })
}

/**
 * The token and metadata of the object that `path` names, read by the files helper from the drive
 * root. Ancestor links are followed and the last segment is not, as `lstat` does on POSIX.
 */
export async function windowsObjectInfo(
  path: string,
  boundMs?: number,
): Promise<Outcome<Metadata>> {
  const start = driveStart(path)
  if (!start.ok) return start
  const found = await invoke({ ...start.value, ...finalOf(path), operation: 'identify' }, boundMs)
  return typeof found === 'string' ? fail(found) : ok(found.info)
}

/**
 * Checks the Windows files prerequisite: the .NET Framework compiler exists, and the files helper
 * starts and creates, reads, lists and removes a file handle-relative in an owned temporary
 * directory below `directory`.
 */
export async function probeWindowsFilesPrerequisite(
  directory = tmpdir(),
): Promise<ProviderFacts['prerequisites']> {
  if (process.platform !== 'win32') return 'unsatisfied'
  try {
    await access(frameworkAssembly('csc.exe'))
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'unsatisfied'
      : 'unknown'
  }
  let made: string
  try {
    made = await mkdtemp(win32.join(directory, 'omne-files-probe-'))
  } catch {
    return 'unknown'
  }
  let reading: ProviderFacts['prerequisites'] = 'unknown'
  try {
    const root = await realpath(made)
    const identity = await windowsObjectInfo(root, 10_000)
    reading = identity.ok ? await probeWindowsDirectory(root, identity.value.token) : 'unknown'
  } catch {
    reading = 'unknown'
  } finally {
    try {
      await rm(made, { recursive: true, force: true })
    } catch {
      reading = 'unknown'
    }
  }
  return reading
}

async function probeWindowsDirectory(
  root: string,
  expectedRoot: string,
): Promise<ProviderFacts['prerequisites']> {
  const probe = (input: NativeInput) => invoke(input, 10_000)
  const bytes = Buffer.from('omne-file-probe').toString('base64')
  const endpoint = { root, expectedRoot, segments: ['probe'], rooted: true, named: expectedRoot }
  const created = await probe({
    ...endpoint,
    operation: 'write',
    create: true,
    version: null,
    trailingSlash: false,
    bytes,
  })
  if (typeof created === 'string') return created === 'unsupported' ? 'unsatisfied' : 'unknown'
  const query: RunInput = {
    ...endpoint,
    named: created.info.token,
    operation: 'read',
    offset: 0,
    limit: 64,
    pattern: '',
    content: false,
    recursive: false,
    entryBudget: 4,
    byteBudget: 64,
    fileBytes: 64,
    path: win32.join(root, 'probe'),
    directory: false,
    follow: false,
  }
  const read = await probe(query)
  if (typeof read === 'string' || read.bytes !== bytes) return 'unknown'
  const listed = await probe({
    ...query,
    operation: 'list',
    segments: [],
    named: expectedRoot,
    path: root,
  })
  if (
    typeof listed === 'string' ||
    listed.entries.length !== 1 ||
    listed.entries[0]?.name !== 'probe' ||
    listed.entries[0].token !== created.info.token
  )
    return 'unknown'
  const removed = await probe({
    ...endpoint,
    named: created.info.token,
    operation: 'remove',
    recursive: false,
    version: null,
    targetRoot: root,
    expectedTargetRoot: expectedRoot,
    targetSegments: [],
    targetNamed: '',
    replace: false,
  })
  if (typeof removed === 'string') return 'unknown'
  try {
    await lstat(win32.join(root, 'probe'))
    return 'unknown'
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'satisfied'
      : 'unknown'
  }
}

function snapshot<R extends FileRequest<unknown>>(request: R): R {
  return {
    ...request,
    named: request.named === null ? null : { ...request.named },
    binding: { ...request.binding },
  }
}

/**
 * The token of a files root, read by the files helper at the first use. One engine binds one root
 * identity; a failed binding is tried again without replacing a known root.
 */
export function createWindowsRootIdentity(root: string): () => Promise<string | undefined> {
  let binding: Promise<string | undefined> | undefined
  return async () => {
    binding ??= windowsObjectInfo(root).then(
      found => (found.ok ? found.value.token : undefined),
      () => undefined,
    )
    const pending = binding
    const found = await pending
    if (found === undefined && binding === pending) binding = undefined
    return found
  }
}

/**
 * The Windows files backend. Every operation runs in the files helper, with or without a files
 * root: below a root, the helper walks from the root's handle; without one, from the handle of the
 * drive root.
 */
export function createWindowsFiles(
  options: Readonly<{
    root?: string
    rootIdentity?: () => Promise<string | undefined>
    limits: HostFilesLimits
    issue(object: ObjectToken): HandleGeneration
  }>,
): Pick<
  FileSystemFacility<unknown>,
  'read' | 'stat' | 'list' | 'search' | 'mkdir' | 'remove' | 'move' | 'write' | 'copy'
> {
  const configured = options.root
  const rootIdentity =
    options.rootIdentity ??
    (configured === undefined ? undefined : createWindowsRootIdentity(configured))
  const identity = (info: Metadata): FileIdentity => {
    const object = { token: info.token }
    return { object, version: info.version, handle: options.issue(object) }
  }
  const information = (info: Metadata): FileInformation => ({
    ...identity(info),
    type: info.type,
    sizeBytes: info.size,
    modifiedMs: info.modified,
  })
  /**
   * Where `path` starts and the segments it walks. Below a root, a path outside it, with a `..` or
   * in a refused form is `notAuthorized`. Nothing is opened yet.
   */
  const locate = async (path: string): Promise<Outcome<Start>> => {
    if (configured === undefined) return driveStart(path)
    if (!carried(path)) return fail('unsupported')
    const segments = await windowsSegmentsBelow(configured, path)
    if (segments === undefined) return fail('notAuthorized')
    return ok({ root: configured, expectedRoot: '', segments, rooted: true })
  }
  /** `located` with the recorded token of the files root; `unavailable` when it cannot be bound. */
  const bound = async (located: Start): Promise<Outcome<Start>> => {
    if (!located.rooted || rootIdentity === undefined) return ok(located)
    const token = await rootIdentity()
    return token === undefined ? fail('unavailable') : ok({ ...located, expectedRoot: token })
  }
  const change = async (
    request: Parameters<FileSystemFacility<unknown>['remove']>[0],
    operation: ChangeInput['operation'],
    target?: Parameters<FileSystemFacility<unknown>['move']>[0]['target'],
    replace = false,
  ) => {
    if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
    if (
      ![request.path, ...(target === undefined ? [] : [target.path])].every(
        path => win32.isAbsolute(path) && !path.includes('\0'),
      )
    )
      return reject(request.requestId, 'invalidInput')
    if (!request.named?.token || (target !== undefined && !target.named?.token))
      return reject(request.requestId, 'notAuthorized')
    const located = await locate(request.path)
    if (!located.ok) return failed(request.requestId, located.failure, 'notFound')
    const destination = target === undefined ? located : await locate(target.path)
    if (!destination.ok) return failed(request.requestId, destination.failure, 'notFound')
    const source = await bound(located.value)
    if (!source.ok) return failed(request.requestId, source.failure, 'notFound')
    const result = await invoke({
      ...source.value,
      named: request.named.token,
      operation,
      recursive: request.recursive,
      version: request.expectedVersion ?? null,
      targetRoot: destination.value.root,
      expectedTargetRoot: source.value.expectedRoot,
      targetSegments: destination.value.segments,
      targetNamed: target?.named?.token ?? '',
      replace,
    })
    return typeof result === 'string' ? failed(request.requestId, result, 'notFound') : result
  }
  const run = async (
    request: Parameters<FileSystemFacility<unknown>['stat']>[0],
    operation: RunInput['operation'],
    offset: number,
    limit: number,
    search?: Parameters<FileSystemFacility<unknown>['search']>[0],
  ) => {
    if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
    if (!win32.isAbsolute(request.path) || request.path.includes('\0'))
      return reject(request.requestId, 'invalidInput')
    if (!request.named?.token) return reject(request.requestId, 'notAuthorized')
    const missing = operation === 'search' ? 'notFound' : 'unresolved'
    const located = await locate(request.path)
    if (!located.ok) return failed(request.requestId, located.failure, missing)
    const start = await bound(located.value)
    if (!start.ok) return failed(request.requestId, start.failure, missing)
    const result = await invoke({
      ...start.value,
      ...finalOf(request.path),
      named: request.named.token,
      operation,
      offset,
      limit,
      pattern: Buffer.from(search?.pattern ?? []).toString('base64'),
      content: search?.match === 'content',
      recursive: search?.recursive ?? false,
      entryBudget: options.limits.searchEntryBudget,
      byteBudget: options.limits.searchByteBudget,
      fileBytes: options.limits.searchFileBytes,
      path: request.path,
    })
    return typeof result === 'string' ? failed(request.requestId, result, missing) : result
  }
  const facility: Pick<
    FileSystemFacility<unknown>,
    'read' | 'stat' | 'list' | 'search' | 'mkdir' | 'remove' | 'move' | 'write' | 'copy'
  > = {
    /**
     * Two helper requests: the first streams the source into a new object beside the target and
     * flushes it, the second publishes that object by the rules of a write. The helper refuses only
     * once the staged object is gone; a helper that answers nothing to the second request may leave
     * it, so that is unknown.
     */
    async copy(request) {
      request = {
        ...snapshot(request),
        target: {
          ...request.target,
          named: request.target.named === null ? null : { ...request.target.named },
        },
      }
      const { requestId } = request
      if (request.binding.kind !== 'host_machine') return reject(requestId, 'unsupported')
      if (
        ![request.path, request.target.path].every(
          path => win32.isAbsolute(path) && !path.includes('\0'),
        ) ||
        finalOf(request.target.path).directory
      )
        return reject(requestId, 'invalidInput')
      if (!request.named?.token || !request.target.named?.token)
        return reject(requestId, 'notAuthorized')
      const located = await locate(request.path)
      if (!located.ok) return failed(requestId, located.failure, 'notFound')
      const destination = await locate(request.target.path)
      if (!destination.ok) return failed(requestId, destination.failure, 'notFound')
      const source = await bound(located.value)
      if (!source.ok) return failed(requestId, source.failure, 'notFound')
      const target: Start = { ...destination.value, expectedRoot: source.value.expectedRoot }
      const temporary = `.omne-copy-${randomUUID()}`
      const staged = await invoke({
        ...source.value,
        ...finalOf(request.path),
        named: request.named.token,
        operation: 'copy',
        version: request.expectedVersion ?? null,
        targetRoot: target.root,
        expectedTargetRoot: target.expectedRoot,
        targetSegments: target.segments,
        targetNamed: request.target.named.token,
        replace: request.replace,
        temporary,
      })
      if (typeof staged === 'string') return failed(requestId, staged, 'notFound')
      if (staged.source === undefined || staged.target === undefined) return unknown(requestId)
      const published = await invoke({
        ...target,
        operation: 'publish',
        temporary,
        named: staged.info.token,
        targetNamed: request.target.named.token,
        version: staged.target?.version ?? null,
        create: staged.target === null,
      })
      if (published === 'unavailable') return unknown(requestId)
      if (typeof published === 'string') return failed(requestId, published, 'notFound')
      return {
        kind: 'done',
        requestId,
        value: {
          source: { token: staged.source.token },
          target: {
            ...identity(published.info),
            writeEffect: staged.target === null ? 'created' : 'replaced',
          },
        },
      }
    },
    async write(request) {
      request = { ...snapshot(request), bytes: Uint8Array.from(request.bytes) }
      if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
      if (
        !win32.isAbsolute(request.path) ||
        request.path.includes('\0') ||
        (request.mode === 'create' &&
          (request.expectedVersion !== undefined || finalOf(request.path).directory))
      )
        return reject(request.requestId, 'invalidInput')
      if (!request.named?.token) return reject(request.requestId, 'notAuthorized')
      const missing = request.mode === 'create' ? 'notFound' : 'unresolved'
      const located = await locate(request.path)
      if (!located.ok) return failed(request.requestId, located.failure, missing)
      const source = await bound(located.value)
      if (!source.ok) return failed(request.requestId, source.failure, missing)
      const result = await invoke({
        ...source.value,
        named: request.named.token,
        operation: 'write',
        version: request.expectedVersion ?? null,
        trailingSlash: finalOf(request.path).directory,
        create: request.mode === 'create',
        bytes: Buffer.from(request.bytes).toString('base64'),
      })
      if (typeof result === 'string') return failed(request.requestId, result, missing)
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          ...identity(result.info),
          writeEffect: request.mode === 'create' ? 'created' : 'replaced',
        },
      }
    },
    async read(request) {
      request = snapshot(request)
      const offset = request.offsetBytes ?? 0,
        limit = request.limitBytes ?? -1
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (request.limitBytes !== undefined && (!Number.isSafeInteger(limit) || limit < 0))
      )
        return reject(request.requestId, 'invalidInput')
      const result = await run(request, 'read', offset, limit)
      if ('kind' in result) return result
      const bytes = Uint8Array.from(Buffer.from(result.bytes, 'base64'))
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          ...identity(result.info),
          bytes,
          nextOffsetBytes: offset + bytes.length,
          eof: result.eof,
        },
      }
    },
    async stat(request) {
      request = snapshot(request)
      const result = await run(request, 'stat', 0, 0)
      if ('kind' in result) return result
      return { kind: 'done', requestId: request.requestId, value: information(result.info) }
    },
    async list(request) {
      request = snapshot(request)
      const offset = request.offset ?? 0,
        limit = request.limit ?? options.limits.listPageLimit
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > options.limits.listPageLimit
      )
        return reject(request.requestId, 'invalidInput')
      try {
        const result = await run(request, 'list', offset, limit)
        if ('kind' in result) return result
        return {
          kind: 'done',
          requestId: request.requestId,
          value: {
            directory: identity(result.info),
            entries: result.entries.map(entry => ({ ...information(entry), name: entry.name })),
            ...(result.next < 0 ? {} : { nextOffset: result.next }),
          },
        }
      } catch {
        return unknown(request.requestId)
      }
    },
    async search(request) {
      request = { ...snapshot(request), pattern: Uint8Array.from(request.pattern) }
      const offset = request.offset ?? 0,
        limit = request.limit ?? options.limits.listPageLimit
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > options.limits.listPageLimit ||
        request.pattern.byteLength === 0
      )
        return reject(request.requestId, 'invalidInput')
      const result = await run(
        { ...request, named: request.named === null ? null : { ...request.named } },
        'search',
        offset,
        limit,
        { ...request, pattern: Uint8Array.from(request.pattern) },
      )
      if ('kind' in result) return result
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          root: identity(result.info),
          hits: result.hits.map(found => ({
            path: found.path,
            object: { token: found.token },
            ...(found.offsetBytes < 0 ? {} : { offsetBytes: found.offsetBytes }),
          })),
          truncated: result.truncated,
          ...(result.next < 0 ? {} : { nextOffset: result.next }),
        },
      }
    },
    async mkdir(request) {
      request = snapshot(request)
      const result = await change({ ...request, recursive: request.parents }, 'mkdir')
      return 'kind' in result
        ? result
        : { kind: 'done', requestId: request.requestId, value: identity(result.info) }
    },
    async remove(request) {
      request = snapshot(request)
      const result = await change(request, 'remove')
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: { removed: { token: result.info.token } },
          }
    },
    async move(request) {
      request = {
        ...snapshot(request),
        target: {
          path: request.target.path,
          named: request.target.named === null ? null : { ...request.target.named },
        },
      }
      const result = await change(
        { ...request, recursive: false },
        'move',
        request.target,
        request.replace,
      )
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: { source: { token: result.info.token }, target: identity(result.info) },
          }
    },
  }
  return facility
}
