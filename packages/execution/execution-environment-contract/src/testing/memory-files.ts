import type {
  FacilityOperation,
  FacilityReason,
  FileIdentity,
  FileInformation,
  FileSystemFacility,
  HandleGeneration,
  ObjectToken,
} from '../index.ts'

export type MemoryFileSystemOptions = Readonly<{
  /** Files under the grant root, keyed by path relative to it. Parent directories are created. */
  files?: Readonly<Record<string, string | Uint8Array>>
  /** Empty directories under the grant root. */
  directories?: readonly string[]
}>

export type MemoryFileSystem<P = unknown> = Readonly<{
  durability: 'none'
  /** The facility to put in a scripted lease: `lease: { files: fs.facility }`. */
  facility: FileSystemFacility<P>
  /** The object a relative path names now, for the caller's `named`. `''` names the grant root. */
  objectToken(path: string): ObjectToken | undefined
  /** A copy of the current bytes of a file, or `undefined`. Not a facility call. */
  peek(path: string): Uint8Array | undefined
  calls: readonly Readonly<{ operation: FacilityOperation<'files'>; path: string }>[]
  /** After `close`, every operation answers `rejected/closed` and changes nothing. */
  close(): void
}>

type Entry = {
  readonly token: ObjectToken
  revision: number
  generation: number
  modifiedMs: number
} & (
  | { readonly type: 'file'; bytes: Uint8Array }
  | { readonly type: 'directory'; readonly entries: Map<string, Entry> }
)
type Directory = Extract<Entry, { type: 'directory' }>

type Resolved =
  | { readonly kind: 'path'; readonly segments: readonly string[] }
  | { readonly kind: 'refused'; readonly reason: FacilityReason }

/** Splits a path relative to the grant root. `..` that climbs above the root is refused. */
function resolvePath(path: string): Resolved {
  if (path.startsWith('/') || path.includes('\0'))
    return { kind: 'refused', reason: 'invalidInput' }
  const segments: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part !== '..') segments.push(part)
    else if (segments.pop() === undefined) return { kind: 'refused', reason: 'notAuthorized' }
  }
  return { kind: 'path', segments }
}

const handleKey = (handle: HandleGeneration) =>
  JSON.stringify([handle.object.token, handle.generation])

/** A byte offset, a byte limit, a list offset or a list limit. */
const isCount = (value: number) => Number.isSafeInteger(value) && value >= 0

/**
 * An in-memory file facility for tests. The whole tree is inside the grant root, which the double
 * makes when it is built; no request or lease carries the root. It has no symbolic links, so it does
 * not prove a real grant-root check. Not durable; never assemble in production.
 */
export function createMemoryFileSystem<P = unknown>(
  options: MemoryFileSystemOptions = {},
): MemoryFileSystem<P> {
  let clock = 0
  let tokens = 0
  let closed = false
  const issued = new Set<string>()
  const calls: { operation: FacilityOperation<'files'>; path: string }[] = []
  const newToken = (): ObjectToken => ({ token: `memory-${++tokens}` })
  const makeDirectory = (): Directory => ({
    type: 'directory',
    token: newToken(),
    revision: 1,
    generation: 0,
    modifiedMs: ++clock,
    entries: new Map(),
  })
  const makeFile = (bytes: Uint8Array): Entry => ({
    type: 'file',
    token: newToken(),
    revision: 1,
    generation: 0,
    modifiedMs: ++clock,
    bytes: bytes.slice(),
  })
  const root = makeDirectory()

  /** Script setup only: a bad path is a test error, so it throws. */
  function seedPath(path: string): readonly string[] {
    const resolved = resolvePath(path)
    if (resolved.kind === 'refused' || resolved.segments.length === 0)
      throw new TypeError(`memory file system: bad seed path ${JSON.stringify(path)}`)
    return resolved.segments
  }
  function seedDirectory(segments: readonly string[]): Directory {
    let current = root
    for (const name of segments) {
      const next = current.entries.get(name) ?? makeDirectory()
      if (next.type !== 'directory')
        throw new TypeError(`memory file system: ${JSON.stringify(name)} is a file`)
      current.entries.set(name, next)
      current = next
    }
    return current
  }
  for (const path of options.directories ?? []) seedDirectory(seedPath(path))
  for (const [path, content] of Object.entries(options.files ?? {})) {
    const segments = seedPath(path)
    const parent = seedDirectory(segments.slice(0, -1))
    const name = segments[segments.length - 1] ?? ''
    if (parent.entries.has(name))
      throw new TypeError(`memory file system: ${JSON.stringify(path)} is given twice`)
    parent.entries.set(
      name,
      makeFile(typeof content === 'string' ? new TextEncoder().encode(content) : content),
    )
  }

  function find(segments: readonly string[]): Entry | undefined {
    let entry: Entry = root
    for (const name of segments) {
      if (entry.type !== 'directory') return undefined
      const next = entry.entries.get(name)
      if (!next) return undefined
      entry = next
    }
    return entry
  }
  /** Every successful result carries a new handle generation of the object. */
  function identity(entry: Entry): FileIdentity {
    entry.generation++
    const handle = { object: { token: entry.token.token }, generation: String(entry.generation) }
    issued.add(handleKey(handle))
    return { object: { token: entry.token.token }, handle, version: `v${entry.revision}` }
  }
  function information(entry: Entry): FileInformation {
    return {
      ...identity(entry),
      type: entry.type,
      sizeBytes: entry.type === 'file' ? entry.bytes.length : 0,
      modifiedMs: entry.modifiedMs,
    }
  }
  const refuse = (requestId: string, reason: FacilityReason) =>
    ({ kind: 'rejected', requestId, reason }) as const
  const unsupported = (requestId: string) => refuse(requestId, 'unsupported')
  /** Refuses every operation after `close()`; otherwise records the call. */
  function enter(operation: FacilityOperation<'files'>, requestId: string, path: string) {
    if (closed) return refuse(requestId, 'closed')
    calls.push({ operation, path })
    return undefined
  }
  /** Path and `named` checks shared by every path operation, in the order of the contract table. */
  function admit(
    request: Readonly<{ requestId: string; path: string; named: ObjectToken | null }>,
  ):
    | {
        readonly kind: 'admitted'
        readonly segments: readonly string[]
        readonly named: ObjectToken
      }
    | ReturnType<typeof refuse> {
    const path = resolvePath(request.path)
    if (path.kind === 'refused') return refuse(request.requestId, path.reason)
    if (request.named === null) return refuse(request.requestId, 'notAuthorized')
    return { kind: 'admitted', segments: path.segments, named: request.named }
  }
  const isNamed = (entry: Entry, named: ObjectToken) => entry.token.token === named.token

  const facility: FileSystemFacility<P> = {
    async read(request) {
      const refused = enter('read', request.requestId, request.path)
      if (refused) return refused
      const path = admit(request)
      if (path.kind !== 'admitted') return path
      const offset = request.offsetBytes ?? 0
      const limit = request.limitBytes
      if (!isCount(offset) || (limit !== undefined && !isCount(limit)))
        return refuse(request.requestId, 'invalidInput')
      const entry = find(path.segments)
      if (!entry) return { kind: 'unresolved', requestId: request.requestId }
      if (!isNamed(entry, path.named)) return refuse(request.requestId, 'conflict')
      if (entry.type !== 'file') return refuse(request.requestId, 'unsupported')
      const slice = entry.bytes.slice(offset, limit === undefined ? undefined : offset + limit)
      const next = Math.min(offset, entry.bytes.length) + slice.length
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          ...identity(entry),
          bytes: slice,
          nextOffsetBytes: next,
          eof: next >= entry.bytes.length,
        },
      }
    },
    async stat(request) {
      const refused = enter('stat', request.requestId, request.path)
      if (refused) return refused
      const path = admit(request)
      if (path.kind !== 'admitted') return path
      const entry = find(path.segments)
      if (!entry) return { kind: 'unresolved', requestId: request.requestId }
      if (!isNamed(entry, path.named)) return refuse(request.requestId, 'conflict')
      return { kind: 'done', requestId: request.requestId, value: information(entry) }
    },
    async write(request) {
      const refused = enter('write', request.requestId, request.path)
      if (refused) return refused
      const path = admit(request)
      if (path.kind !== 'admitted') return path
      if (request.mode === 'replace') {
        const entry = find(path.segments)
        if (!entry) return { kind: 'unresolved', requestId: request.requestId }
        if (!isNamed(entry, path.named)) return refuse(request.requestId, 'conflict')
        if (entry.type !== 'file') return refuse(request.requestId, 'unsupported')
        if (
          request.expectedVersion !== undefined &&
          request.expectedVersion !== `v${entry.revision}`
        )
          return refuse(request.requestId, 'conflict')
        entry.bytes = request.bytes.slice()
        entry.revision++
        entry.modifiedMs = ++clock
        return { kind: 'done', requestId: request.requestId, value: identity(entry) }
      }
      const name = path.segments.at(-1)
      const last = request.path.split('/').at(-1)
      if (
        request.expectedVersion !== undefined ||
        name === undefined ||
        last === '' ||
        last === '.' ||
        last === '..'
      )
        return refuse(request.requestId, 'invalidInput')
      const parent = find(path.segments.slice(0, -1))
      if (parent?.type !== 'directory') return refuse(request.requestId, 'notFound')
      if (!isNamed(parent, path.named) || parent.entries.has(name))
        return refuse(request.requestId, 'conflict')
      const file = makeFile(request.bytes)
      parent.entries.set(name, file)
      parent.revision++
      parent.modifiedMs = file.modifiedMs
      return { kind: 'done', requestId: request.requestId, value: identity(file) }
    },
    async close(request) {
      const refused = enter('close', request.requestId, request.path)
      if (refused) return refused
      const path = admit(request)
      if (path.kind !== 'admitted') return path
      const { handle } = request
      if (handle.object.token !== path.named.token || !issued.has(handleKey(handle)))
        return refuse(request.requestId, 'invalidInput')
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          handle: { object: { token: handle.object.token }, generation: handle.generation },
        },
      }
    },
    async list(request) {
      const refused = enter('list', request.requestId, request.path)
      if (refused) return refused
      const path = admit(request)
      if (path.kind !== 'admitted') return path
      const offset = request.offset ?? 0
      const limit = request.limit
      if (!isCount(offset) || (limit !== undefined && !isCount(limit)))
        return refuse(request.requestId, 'invalidInput')
      const entry = find(path.segments)
      if (!entry) return { kind: 'unresolved', requestId: request.requestId }
      if (!isNamed(entry, path.named)) return refuse(request.requestId, 'conflict')
      if (entry.type !== 'directory') return refuse(request.requestId, 'unsupported')
      const names = [...entry.entries.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const end = limit === undefined ? names.length : Math.min(names.length, offset + limit)
      const page = names.slice(offset, end).flatMap(name => {
        const child = entry.entries.get(name)
        return child ? [information(child)] : []
      })
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          directory: identity(entry),
          entries: page,
          ...(end < names.length ? { nextOffset: end } : {}),
        },
      }
    },
    async search(request) {
      return enter('search', request.requestId, request.path) ?? unsupported(request.requestId)
    },
    async mkdir(request) {
      return enter('mkdir', request.requestId, request.path) ?? unsupported(request.requestId)
    },
    async remove(request) {
      return enter('remove', request.requestId, request.path) ?? unsupported(request.requestId)
    },
    async move(request) {
      return enter('move', request.requestId, request.path) ?? unsupported(request.requestId)
    },
    async copy(request) {
      return enter('copy', request.requestId, request.path) ?? unsupported(request.requestId)
    },
    async commitBatch(request) {
      return enter('commitBatch', request.requestId, '') ?? unsupported(request.requestId)
    },
    async recoverBatch(request) {
      return enter('recoverBatch', request.requestId, '') ?? unsupported(request.requestId)
    },
  }

  return {
    durability: 'none',
    facility,
    objectToken(path) {
      const resolved = resolvePath(path)
      const entry = resolved.kind === 'path' ? find(resolved.segments) : undefined
      return entry ? { token: entry.token.token } : undefined
    },
    peek(path) {
      const resolved = resolvePath(path)
      const entry = resolved.kind === 'path' ? find(resolved.segments) : undefined
      return entry?.type === 'file' ? entry.bytes.slice() : undefined
    },
    calls,
    close() {
      closed = true
    },
  }
}
