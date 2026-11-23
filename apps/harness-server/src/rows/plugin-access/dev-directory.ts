import { createHash } from 'node:crypto'
import { watch, type FSWatcher } from 'node:fs'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { MANIFEST_FILE, judgePackage, readManifest } from '@omne-harness/plugin-protocol'
import type {
  PluginSource,
  SourceFile,
  SourcePlugin,
  SourceRead,
} from '@omne-harness/plugin-access'

export type DevDirectorySource = PluginSource & {
  /** Resolves once the scans started so far have ended. */
  settled(): Promise<void>
  close(): void
}

type Held = Readonly<{ plugin: SourcePlugin; directory: string }>
type Scan = ReadonlyMap<string, Held>

/** A burst of file events is one change: the directory is scanned once it has been quiet this long. */
const QUIET_MS = 150
/** Where the directory cannot be watched, it is scanned this often instead. */
const POLL_MS = 1_000
const ABSENT_PLUGIN: SourceRead = Object.freeze({ kind: 'absent', what: 'plugin' })
const ABSENT_FILE: SourceRead = Object.freeze({ kind: 'absent', what: 'file' })

const hidden = (name: string): boolean => name.startsWith('.')

const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex')

async function filesUnder(directory: string): Promise<readonly SourceFile[]> {
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
        const content = await readFile(join(directory, ...segments))
        return { path: segments.join('/'), digest: sha256(content), bytes: content.byteLength }
      }),
  )
  return files.sort((left, right) => (left.path < right.path ? -1 : 1))
}

/** The version is the digest of the content: of each file's path and digest, in the order of the paths. */
const versionOf = (files: readonly SourceFile[]): string =>
  sha256(files.map(file => `${file.path}\0${file.digest}\n`).join('')).slice(0, 16)

async function heldIn(directory: string, name: string): Promise<Held | string> {
  const files = await filesUnder(directory)
  if (!files.some(file => file.path === MANIFEST_FILE)) return `it has no ${MANIFEST_FILE}`
  const manifestText = await readFile(join(directory, MANIFEST_FILE), 'utf8')
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

/** What one scan found: the plugins that hold, and why each other directory is left out. */
async function scan(root: string): Promise<Scanned> {
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
    const found = await heldIn(join(root, entry.name), entry.name).catch(String)
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

async function readHeld(
  held: Held,
  path: string,
  offset: number,
  limit: number,
): Promise<SourceRead> {
  const listed = held.plugin.files.find(file => file.path === path)
  if (listed === undefined) return ABSENT_FILE
  const inside = await realpath(held.directory)
  const real = await realpath(join(held.directory, ...path.split('/'))).catch(() => undefined)
  if (real === undefined) return ABSENT_PLUGIN
  if (!real.startsWith(inside + sep)) return ABSENT_FILE
  const content = await readFile(real)
  if (sha256(content) !== listed.digest) return ABSENT_PLUGIN
  const part = new Uint8Array(content.subarray(offset, offset + limit))
  const end = Math.min(offset, content.byteLength) + part.byteLength
  return {
    kind: 'read',
    part,
    next: end < content.byteLength ? end : null,
    bytes: content.byteLength,
  }
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
  input: Readonly<{ root: string | undefined; warn: (line: string) => void }>,
): DevDirectorySource {
  const { root, warn } = input
  if (root === undefined) return EMPTY
  const listeners = new Set<() => void>()
  let last: Scan = new Map()
  let warned = new Map<string, string>()
  let signature: string | undefined
  let readable = true
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
      const found = await scan(root)
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
  const soon = (): void => {
    clearTimeout(quiet)
    quiet = setTimeout(() => void rescan(), QUIET_MS)
  }
  try {
    watcher = watch(root, { recursive: true }, soon)
    watcher.on('error', error =>
      warn(`the plugin dev directory stopped being watched: ${String(error)}`),
    )
  } catch (error) {
    warn(
      `the plugin dev directory ${root} cannot be watched, it is scanned each second: ${String(error)}`,
    )
    poll = setInterval(() => void rescan(), POLL_MS)
  }
  void rescan()

  return {
    async list() {
      const held = await rescan()
      if (!readable) return { kind: 'unavailable' }
      return { kind: 'read', offered: [...held.values()].map(each => each.plugin) }
    },
    async read(_principal, at) {
      const held = (await queue).get(at.name)
      if (held === undefined || held.plugin.version !== at.version) return ABSENT_PLUGIN
      return readHeld(held, at.path, at.offset, at.limit).catch(() => ({
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
