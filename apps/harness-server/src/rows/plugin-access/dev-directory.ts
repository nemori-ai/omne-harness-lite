import { createHash } from 'node:crypto'
import { watch, type FSWatcher } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { MANIFEST_FILE, judgePackage, readManifest } from '@omne-harness/plugin-protocol'
import type {
  PluginSource,
  SourceFile,
  SourcePlugin,
  SourceRead,
} from '@omne-harness/plugin-access'
import { nodeFileIo, type FileIo } from './file-io.ts'

export type DevDirectorySource = PluginSource & {
  /** Resolves once the scans started so far have ended. */
  settled(): Promise<void>
  close(): void
}

type Held = Readonly<{ plugin: SourcePlugin; directory: string }>
type Scan = ReadonlyMap<string, Held>

const QUIET_MS = 150
/** A burst that does not end is not waited out: the directory is scanned this long after its first event at the latest. */
const MOST_WAIT_MS = 500
const POLL_MS = 1_000
type Absent = Extract<SourceRead, { kind: 'absent' }>
const ABSENT_PLUGIN: Absent = Object.freeze({ kind: 'absent', what: 'plugin' })
const ABSENT_FILE: Absent = Object.freeze({ kind: 'absent', what: 'file' })

const hidden = (name: string): boolean => name.startsWith('.')

const now = (): number =>
  /* wall-clock: operation-timing -- how long ago the directory was scanned, or a burst of file events began */ performance.now()

const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex')

type Known = Readonly<{ size: bigint; changed: bigint; digest: string; text: string | null }>

/** What is known of each file, for as long as its size and its time of change stay: a scan digests only what changed. */
type Reading = Readonly<{ io: FileIo; known: Map<string, Known> }>

async function knownOf(reading: Reading, path: string, keepText: boolean): Promise<Known> {
  const { size, mtimeNs: changed } = await stat(path, { bigint: true })
  const before = reading.known.get(path)
  if (before !== undefined && before.size === size && before.changed === changed) return before
  const now = { size, changed, ...(await reading.io.digest(path, keepText)) }
  reading.known.set(path, now)
  return now
}

async function filesUnder(reading: Reading, directory: string): Promise<readonly SourceFile[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter(entry => entry.isFile())
      .map(entry =>
        join(entry.parentPath, entry.name)
          .slice(directory.length + 1)
          .split(sep),
      )
      .filter(segments => !segments.some(hidden))
      .map(async segments => {
        const path = segments.join('/')
        const { digest, size } = await knownOf(
          reading,
          join(directory, ...segments),
          path === MANIFEST_FILE,
        )
        return { path, digest, bytes: Number(size) }
      }),
  )
  return files.sort((left, right) => (left.path < right.path ? -1 : 1))
}

/** The version is the digest of the content: of each file's path and digest, in the order of the paths. */
const versionOf = (files: readonly SourceFile[]): string =>
  sha256(files.map(file => `${file.path}\0${file.digest}\n`).join('')).slice(0, 16)

async function heldIn(reading: Reading, directory: string, name: string): Promise<Held | string> {
  const files = await filesUnder(reading, directory)
  if (!files.some(file => file.path === MANIFEST_FILE)) return `it has no ${MANIFEST_FILE}`
  const manifestText = (await knownOf(reading, join(directory, MANIFEST_FILE), true)).text ?? ''
  const read = readManifest(manifestText)
  if (read.kind !== 'read') return read.reason
  if (read.manifest.name !== name)
    return `its manifest names ${read.manifest.name}, not the directory ${name}`
  const judged = judgePackage(read.manifest, files)
  if (!judged.ok) return judged.reason
  const plugin = { version: versionOf(files), manifest: read.manifest, manifestText, files }
  return { plugin, directory }
}

type Scanned = Readonly<{ held: Scan; faults: Map<string, string>; readable: boolean }>

async function scan(reading: Reading, root: string): Promise<Scanned> {
  const held = new Map<string, Held>()
  const faults = new Map<string, string>()
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    faults.set(root, `the directory cannot be read: ${String(error)}`)
    return { held, faults, readable: false }
  }
  for (const entry of entries.filter(each => each.isDirectory() && !hidden(each.name))) {
    const found = await heldIn(reading, join(root, entry.name), entry.name).catch(String)
    if (typeof found === 'string') faults.set(entry.name, found)
    else held.set(entry.name, found)
  }
  return { held, faults, readable: true }
}

const signatureOf = (held: Scan): string =>
  [...held.keys()]
    .sort()
    .map(name => `${name}@${held.get(name)!.plugin.version}`)
    .join(',')

async function unchanged(
  reading: Reading,
  path: string,
  digest: string,
): Promise<bigint | undefined> {
  const known = reading.known.get(path)
  if (known === undefined || known.digest !== digest) return undefined
  const now = await stat(path, { bigint: true }).catch(() => undefined)
  return now !== undefined && now.size === known.size && now.mtimeNs === known.changed
    ? known.size
    : undefined
}

/** One part of a listed file, read from inside the plugin's directory: only that part is read, whatever the size of the file. */
async function readHeld(
  reading: Reading,
  held: Held,
  path: string,
  offset: number,
  limit: number,
): Promise<SourceRead> {
  const listed = held.plugin.files.find(file => file.path === path)
  if (listed === undefined) return ABSENT_FILE
  const file = join(held.directory, ...path.split('/'))
  const inside = await realpath(held.directory)
  const real = await realpath(file).catch(() => undefined)
  if (real === undefined) return ABSENT_PLUGIN
  if (!real.startsWith(inside + sep)) return ABSENT_FILE
  const size = await unchanged(reading, file, listed.digest)
  if (size === undefined) return ABSENT_PLUGIN
  const bytes = Number(size)
  const part = await reading.io.range(real, offset, Math.min(limit, Math.max(0, bytes - offset)))
  if ((await unchanged(reading, file, listed.digest)) === undefined) return ABSENT_PLUGIN
  const end = Math.min(offset, bytes) + part.byteLength
  return { kind: 'read', part, next: end < bytes ? end : null, bytes }
}

const EMPTY: DevDirectorySource = {
  list: async () => ({ kind: 'read', offered: [] }),
  read: async () => ABSENT_PLUGIN,
  subscribe: () => () => undefined,
  settled: async () => undefined,
  close: () => undefined,
}

/** The plugins of a directory the operator names: one per sub-directory, the same for every tenant. */
export function createDevDirectorySource(
  input: Readonly<{ root: string | undefined; warn: (line: string) => void; io?: FileIo }>,
): DevDirectorySource {
  const { root, warn } = input
  if (root === undefined) return EMPTY
  const reading: Reading = { io: input.io ?? nodeFileIo, known: new Map<string, Known>() }
  let events = 0
  let scanned = -1
  let scannedAt = 0
  let watching = false
  const listeners = new Set<() => void>()
  let last: Scan = new Map()
  let warned = new Map<string, string>()
  let signature: string | undefined
  let readable = true
  const fresh = (): boolean =>
    readable && scanned === events && (watching || now() - scannedAt < POLL_MS)
  let queue: Promise<Scan> = Promise.resolve(last)
  let quiet: ReturnType<typeof setTimeout> | undefined
  let watcher: FSWatcher | undefined
  let poll: ReturnType<typeof setInterval> | undefined

  const tell = (listener: () => void): void => {
    try {
      listener()
    } catch (error) {
      warn(`a listener of the plugin dev directory threw: ${String(error)}`)
    }
  }
  const rescan = (): Promise<Scan> => {
    queue = queue.then(async () => {
      const seen = events
      const found = await scan(reading, root)
      for (const path of reading.known.keys())
        if (!path.startsWith(root + sep)) reading.known.delete(path)
      scanned = seen
      scannedAt = now()
      for (const [name, fault] of found.faults)
        if (warned.get(name) !== fault)
          warn(`the plugin dev directory leaves out ${name}: ${fault}`)
      warned = found.faults
      last = found.held
      readable = found.readable
      const next = signatureOf(last)
      const before = signature
      signature = next
      if (before !== undefined && before !== next) for (const listener of listeners) tell(listener)
      return last
    })
    return queue
  }
  let began: number | undefined
  const soon = (): void => {
    events += 1
    const at = now()
    const first = (began ??= at)
    clearTimeout(quiet)
    quiet = setTimeout(
      () => {
        began = undefined
        void rescan()
      },
      Math.max(0, Math.min(QUIET_MS, first + MOST_WAIT_MS - at)),
    )
  }
  try {
    watcher = watch(root, { recursive: true }, soon)
    watching = true
    watcher.on('error', error => {
      watching = false
      warn(`the plugin dev directory stopped being watched: ${String(error)}`)
    })
  } catch (error) {
    warn(
      `the plugin dev directory ${root} cannot be watched, it is scanned each second: ${String(error)}`,
    )
    poll = setInterval(() => void rescan(), POLL_MS)
  }
  void rescan()

  return {
    async list() {
      const held = fresh() ? last : await rescan()
      if (!readable) return { kind: 'unavailable' }
      return { kind: 'read', offered: [...held.values()].map(each => each.plugin) }
    },
    async read(_principal, at) {
      const held = (await queue).get(at.name)
      if (held === undefined || held.plugin.version !== at.version) return ABSENT_PLUGIN
      return readHeld(reading, held, at.path, at.offset, at.limit).catch(() => ({
        kind: 'unavailable' as const,
      }))
    },
    subscribe(_tenant, listener) {
      const own = (): void => listener()
      listeners.add(own)
      return () => void listeners.delete(own)
    },
    async settled() {
      await queue
    },
    close() {
      clearTimeout(quiet)
      clearInterval(poll)
      watcher?.close()
      listeners.clear()
    },
  }
}
