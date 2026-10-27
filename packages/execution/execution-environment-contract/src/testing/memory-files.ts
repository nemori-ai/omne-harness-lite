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

/** What a path names: the object, its parent directory for a create, or why there is none. */
type Resolution =
  | { readonly kind: 'object'; readonly entry: Entry }
  | { readonly kind: 'parent'; readonly parent: Directory; readonly name: string }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'refused'; readonly reason: 'invalidInput' | 'notAuthorized' }
type ObjectResolution = Extract<Resolution, { kind: 'object' | 'unresolved' | 'refused' }>
type ParentResolution = Extract<Resolution, { kind: 'parent' | 'notFound' | 'refused' }>

/** Final segments that do not name a new entry. */
const NOT_A_NAME: ReadonlySet<string> = new Set(['', '.', '..'])

const handleKey = (handle: HandleGeneration) =>
  JSON.stringify([handle.object.token, handle.generation])

const isCount = (value: number) => Number.isSafeInteger(value) && value >= 0
/** A byte offset, a byte limit or a list offset: absent, or a non-negative safe integer. */
const isOptionalCount = (value: number | undefined) => value === undefined || isCount(value)
/** A list limit: absent, or a positive safe integer. */
const isOptionalLimit = (value: number | undefined) =>
  value === undefined || (isCount(value) && value > 0)

const byName = ([a]: readonly [string, Entry], [b]: readonly [string, Entry]) => (a < b ? -1 : 1)

/** Script setup only: a seed path is plain segments, no `''`, `.`, `..` or NUL; otherwise it throws. */
function seedPath(path: string): Readonly<{ parents: readonly string[]; name: string }> {
  const parents = path.split('/')
  const name = parents.pop()
  if (name === undefined || path.includes('\0') || [...parents, name].some(s => NOT_A_NAME.has(s)))
    throw new TypeError(`memory file system: bad seed path ${JSON.stringify(path)}`)
  return { parents, name }
}

/**
 * An in-memory file facility for tests. It plays a placement that claims the isolation
 * `filesystem-root`: the double makes its grant root when it is built, the whole tree is inside it,
 * and no request or lease carries the root. Paths are relative to the root and resolve object by
 * object, as on a real file system: a missing or file segment before `..` leaves the path
 * unresolved, and `..` above the root is refused. The double has no symbolic links, so it does not
 * prove a real grant-root check. Not durable; never assemble in production.
 *
 * To put it in a lease, give the scripted provider `facilities` that include `'files'`,
 * `isolation: ['filesystem-root']` and `lease: { files: fs.facility }`. A given `lease` replaces the
 * whole default facility table. The caller writes the provider's `retire` script and calls
 * `fs.close()` in it.
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
  for (const path of options.directories ?? []) {
    const { parents, name } = seedPath(path)
    seedDirectory([...parents, name])
  }
  for (const [path, content] of Object.entries(options.files ?? {})) {
    const { parents, name } = seedPath(path)
    const parent = seedDirectory(parents)
    if (parent.entries.has(name))
      throw new TypeError(`memory file system: ${JSON.stringify(path)} is given twice`)
    const seed = typeof content === 'string' ? new TextEncoder().encode(content) : content
    parent.entries.set(name, makeFile(seed))
  }

  /** Walks the tree one segment at a time from the grant root. `..` goes back to the real parent. */
  function walk(segments: readonly string[]): ObjectResolution {
    let current: Entry = root
    const parents: Directory[] = []
    for (const segment of segments) {
      if (current.type === 'file') return { kind: 'unresolved' }
      if (segment === '' || segment === '.') continue
      if (segment === '..') {
        const up = parents.pop()
        if (!up) return { kind: 'refused', reason: 'notAuthorized' }
        current = up
        continue
      }
      const child = current.entries.get(segment)
      if (!child) return { kind: 'unresolved' }
      parents.push(current)
      current = child
    }
    return { kind: 'object', entry: current }
  }

  /** The one path resolver. `object` resolves the whole path; `parent` resolves all but the new name. */
  function resolve(path: string, mode: 'object'): ObjectResolution
  function resolve(path: string, mode: 'parent'): ParentResolution
  function resolve(path: string, mode: 'object' | 'parent'): Resolution {
    if (path.startsWith('/') || path.includes('\0'))
      return { kind: 'refused', reason: 'invalidInput' }
    const segments = path.split('/')
    if (mode === 'object') return walk(segments)
    const name = segments.pop() ?? ''
    if (NOT_A_NAME.has(name)) return { kind: 'refused', reason: 'invalidInput' }
    const parent = walk(segments)
    if (parent.kind === 'refused') return parent
    if (parent.kind === 'unresolved' || parent.entry.type !== 'directory')
      return { kind: 'notFound' }
    return { kind: 'parent', parent: parent.entry, name }
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
  const isNamed = (entry: Entry, named: ObjectToken) => entry.token.token === named.token

  type Target = Readonly<{ requestId: string; path: string; named: ObjectToken | null }>
  /** The object a request names, after the path and `named` checks in the order of the contract table. */
  function useObject(request: Target) {
    const found = resolve(request.path, 'object')
    if (found.kind === 'refused') return refuse(request.requestId, found.reason)
    if (request.named === null) return refuse(request.requestId, 'notAuthorized')
    if (found.kind === 'unresolved')
      return { kind: 'unresolved', requestId: request.requestId } as const
    if (!isNamed(found.entry, request.named)) return refuse(request.requestId, 'conflict')
    return found
  }
  /** The parent directory and new name of a create; `named` is the parent. */
  function useParent(request: Target) {
    const found = resolve(request.path, 'parent')
    if (found.kind === 'refused') return refuse(request.requestId, found.reason)
    if (request.named === null) return refuse(request.requestId, 'notAuthorized')
    if (found.kind === 'notFound') return refuse(request.requestId, 'notFound')
    if (!isNamed(found.parent, request.named)) return refuse(request.requestId, 'conflict')
    return found
  }

  type WriteRequest = Parameters<FileSystemFacility<P>['write']>[0]
  function replaceWrite(request: WriteRequest) {
    const found = useObject(request)
    if (found.kind !== 'object') return found
    const { entry } = found
    if (entry.type !== 'file') return unsupported(request.requestId)
    if (request.expectedVersion !== undefined && request.expectedVersion !== `v${entry.revision}`)
      return refuse(request.requestId, 'conflict')
    entry.bytes = request.bytes.slice()
    entry.revision++
    entry.modifiedMs = ++clock
    return { kind: 'done', requestId: request.requestId, value: identity(entry) } as const
  }
  function createWrite(request: WriteRequest) {
    if (request.expectedVersion !== undefined) return refuse(request.requestId, 'invalidInput')
    const found = useParent(request)
    if (found.kind !== 'parent') return found
    const { parent, name } = found
    if (parent.entries.has(name)) return refuse(request.requestId, 'conflict')
    const file = makeFile(request.bytes)
    parent.entries.set(name, file)
    parent.revision++
    parent.modifiedMs = file.modifiedMs
    return { kind: 'done', requestId: request.requestId, value: identity(file) } as const
  }

  const facility: FileSystemFacility<P> = {
    async read(request) {
      const refused = enter('read', request.requestId, request.path)
      if (refused) return refused
      const found = useObject(request)
      if (found.kind !== 'object') return found
      const { entry } = found
      if (entry.type !== 'file') return unsupported(request.requestId)
      if (!isOptionalCount(request.offsetBytes) || !isOptionalCount(request.limitBytes))
        return refuse(request.requestId, 'invalidInput')
      const offset = Math.min(request.offsetBytes ?? 0, entry.bytes.length)
      const bytes = entry.bytes.subarray(offset).slice(0, request.limitBytes)
      const next = offset + bytes.length
      const value = { ...identity(entry), bytes, nextOffsetBytes: next }
      return {
        kind: 'done',
        requestId: request.requestId,
        value: { ...value, eof: next === entry.bytes.length },
      }
    },
    async stat(request) {
      const refused = enter('stat', request.requestId, request.path)
      if (refused) return refused
      const found = useObject(request)
      if (found.kind !== 'object') return found
      return { kind: 'done', requestId: request.requestId, value: information(found.entry) }
    },
    async write(request) {
      const refused = enter('write', request.requestId, request.path)
      if (refused) return refused
      return request.mode === 'replace' ? replaceWrite(request) : createWrite(request)
    },
    async close(request) {
      const refused = enter('close', request.requestId, request.path)
      if (refused) return refused
      const found = useObject(request)
      if (found.kind === 'unresolved') return refuse(request.requestId, 'conflict')
      if (found.kind !== 'object') return found
      const { handle } = request
      if (!isNamed(found.entry, handle.object) || !issued.has(handleKey(handle)))
        return refuse(request.requestId, 'invalidInput')
      const closedHandle = { object: { token: handle.object.token }, generation: handle.generation }
      return { kind: 'done', requestId: request.requestId, value: { handle: closedHandle } }
    },
    async list(request) {
      const refused = enter('list', request.requestId, request.path)
      if (refused) return refused
      const found = useObject(request)
      if (found.kind !== 'object') return found
      const { entry } = found
      if (entry.type !== 'directory') return unsupported(request.requestId)
      if (!isOptionalCount(request.offset) || !isOptionalLimit(request.limit))
        return refuse(request.requestId, 'invalidInput')
      const children = [...entry.entries].sort(byName)
      const offset = request.offset ?? 0
      const end = Math.min(children.length, offset + (request.limit ?? children.length))
      const entries = children.slice(offset, end).map(([, child]) => information(child))
      const more = end < children.length ? { nextOffset: end } : {}
      const value = { directory: identity(entry), entries, ...more }
      return { kind: 'done', requestId: request.requestId, value }
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
      const found = resolve(path, 'object')
      return found.kind === 'object' ? { token: found.entry.token.token } : undefined
    },
    peek(path) {
      const found = resolve(path, 'object')
      return found.kind === 'object' && found.entry.type === 'file'
        ? found.entry.bytes.slice()
        : undefined
    },
    calls,
    close() {
      closed = true
    },
  }
}
