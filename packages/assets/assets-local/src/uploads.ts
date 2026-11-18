import { type Dirent } from 'node:fs'
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  capabilityId,
  digestBytes,
  type CapabilityId,
  type CategoryView,
  type PackageManifest,
  type PackageReader,
  type PackageRejection,
} from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'
import { digest, equal } from './encoding.ts'
import { declarationRejection } from './packages.ts'

/** How long an untouched upload is kept, how many a tenant may have open, and how big one part is. */
export type UploadPolicy = Readonly<{ idleMs: number; maxOpen: number; partBytes: number }>
export type UploadEntry = Readonly<{ path: string; bytes: number }>

export type UploadBegin =
  | Readonly<{ kind: 'accepted'; partBytes: number; received: readonly UploadEntry[] }>
  | Readonly<{ kind: 'unknown-category' | 'operation-conflict' | 'busy' | 'unavailable' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
export type UploadResume =
  | Readonly<{ kind: 'accepted'; partBytes: number; received: readonly UploadEntry[] }>
  | Readonly<{ kind: 'operation-conflict' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'absent' }>
export type UploadAppend =
  | Readonly<{ kind: 'received'; bytes: number }>
  | Readonly<{ kind: 'absent' | 'unavailable' }>
  | Readonly<{ kind: 'invalid'; reason: 'undeclared-path' | 'beyond-declared' }>
export type UploadReader =
  | Readonly<{ kind: 'ready'; capability: CapabilityId; from: PackageReader }>
  | Readonly<{ kind: 'incomplete'; missing: readonly string[] }>
  | Readonly<{ kind: 'absent' | 'unavailable' }>

type BeginRequest = Readonly<{
  operationId: string
  capability: CapabilityId
  entries: readonly UploadEntry[]
}>

/** A directory sent in parts before it is published; it is no asset record, so nothing sees it. */
export interface LocalUploads {
  begin(input: BeginRequest): Promise<UploadBegin>
  /** `begin` without making anything or keeping it alive: one that is not there answers absent. */
  resume(input: BeginRequest): Promise<UploadResume>
  append(
    input: Readonly<{ operationId: string; path: string; offset: number; bytes: Uint8Array }>,
  ): Promise<UploadAppend>
  reader(operationId: string): Promise<UploadReader>
  discard(operationId: string): Promise<void>
  /** Removes every upload idle longer than the policy allows; answers how many. */
  sweep(): Promise<number>
}

type Declaration = Readonly<{
  operationId: string
  category: string
  name: string
  entries: readonly UploadEntry[]
}>

const UPLOADS = '.uploads'
const DECLARED = 'declared.json'
const FILES = 'files'

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 0
    throw error
  }
}

function rejectionReason(rejection: PackageRejection): string {
  if (rejection.kind === 'limit-exceeded') return `limit-exceeded:${rejection.limit}`
  return rejection.kind === 'invalid-package' ? rejection.reason : rejection.kind
}

function declarationOf(text: string): Declaration | undefined {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null) return undefined
  const { operationId, category, name, entries } = value as Record<string, unknown>
  if (
    typeof operationId !== 'string' ||
    typeof category !== 'string' ||
    typeof name !== 'string' ||
    !Array.isArray(entries)
  )
    return undefined
  return { operationId, category, name, entries: entries as UploadEntry[] }
}

/** One queue per upload: its appends, its reads and its sweep never interleave. */
function serialized() {
  const tails = new Map<string, Promise<unknown>>()
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const run = (tails.get(key) ?? Promise.resolve()).then(task, task)
    const tail = run.catch(() => undefined)
    tails.set(key, tail)
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return run
  }
}

function stagedReader(files: string, manifest: PackageManifest): PackageReader {
  return {
    manifest: async () => succeed(manifest),
    async open(path, expected) {
      const entry = manifest.entries.find(one => one.path === path && one.digest === expected)
      if (entry === undefined) return fail('entry-not-found')
      try {
        const read = await readFile(join(files, entry.path))
        const bytes = new Uint8Array(read.buffer, read.byteOffset, read.byteLength)
        return digestBytes(bytes) === expected ? succeed(bytes) : fail('material-unavailable')
      } catch {
        return fail('material-unavailable')
      }
    },
  }
}

type Staging = Readonly<{
  base: string
  categories: Pick<CategoryView, 'lookup'>
  policy: UploadPolicy
  clock: () => number
  queue: ReturnType<typeof serialized>
}>

const placeOf = (operationId: string) => digest(operationId)

async function declared(dir: string): Promise<Declaration | undefined> {
  try {
    return declarationOf(await readFile(join(dir, DECLARED), 'utf8'))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

async function touch(staging: Staging, dir: string): Promise<void> {
  const seconds = staging.clock() / 1000
  await utimes(dir, seconds, seconds)
}

async function received(dir: string, entries: readonly UploadEntry[]): Promise<UploadEntry[]> {
  const files = join(dir, FILES)
  return Promise.all(
    entries.map(async entry => ({
      path: entry.path,
      bytes: await sizeOf(join(files, entry.path)),
    })),
  )
}

async function places(base: string): Promise<string[]> {
  let items: Dirent[]
  try {
    items = await readdir(base, { withFileTypes: true })
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
  return items.filter(item => item.isDirectory()).map(item => item.name)
}

async function sweepIdle(staging: Staging): Promise<number> {
  let removed = 0
  for (const place of await places(staging.base))
    removed += await staging.queue(place, async () => {
      const dir = join(staging.base, place)
      let touched: number
      try {
        touched = (await stat(dir)).mtimeMs
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return 0
        throw error
      }
      if (staging.clock() - touched <= staging.policy.idleMs) return 0
      await rm(dir, { recursive: true, force: true })
      return 1
    })
  return removed
}

async function make(staging: Staging, dir: string, declaration: Declaration): Promise<void> {
  await mkdir(join(dir, FILES), { recursive: true })
  const draft = join(dir, `${DECLARED}.draft`)
  await writeFile(draft, JSON.stringify(declaration))
  await rename(draft, join(dir, DECLARED))
  await touch(staging, dir)
}

function declarationOfRequest(request: BeginRequest): Declaration {
  return {
    operationId: request.operationId,
    category: request.capability.category,
    name: request.capability.name,
    entries: request.entries.map(({ path, bytes }) => ({ path, bytes })),
  }
}

async function standing(
  staging: Staging,
  declaration: Declaration,
  dir: string,
  keepAlive: boolean,
): Promise<UploadResume> {
  const known = await declared(dir)
  if (known === undefined) return { kind: 'absent' }
  if (!equal(known, declaration)) return { kind: 'operation-conflict' }
  if (keepAlive) await touch(staging, dir)
  return {
    kind: 'accepted',
    partBytes: staging.policy.partBytes,
    received: await received(dir, declaration.entries),
  }
}

async function resume(staging: Staging, request: BeginRequest): Promise<UploadResume> {
  const place = placeOf(request.operationId)
  const declaration = declarationOfRequest(request)
  return staging.queue(place, () =>
    standing(staging, declaration, join(staging.base, place), false),
  )
}

async function begin(staging: Staging, request: BeginRequest): Promise<UploadBegin> {
  const contract = staging.categories.lookup(request.capability.category)
  if (contract === undefined) return { kind: 'unknown-category' }
  if (contract.layout === undefined) return { kind: 'invalid', reason: 'not-a-directory-category' }
  const rejection = declarationRejection(request, contract.layout.limits)
  if (rejection !== undefined) return { kind: 'invalid', reason: rejectionReason(rejection) }
  const declaration = declarationOfRequest(request)
  const place = placeOf(request.operationId)
  const dir = join(staging.base, place)
  const opened = await staging.queue(place, () => standing(staging, declaration, dir, true))
  if (opened.kind !== 'absent') return opened
  const full = async () => (await places(staging.base)).length >= staging.policy.maxOpen
  if (await full()) await sweepIdle(staging)
  if (await full()) return { kind: 'busy' }
  return staging.queue(place, async () => {
    const made = await standing(staging, declaration, dir, true)
    if (made.kind !== 'absent') return made
    await make(staging, dir, declaration)
    return {
      kind: 'accepted',
      partBytes: staging.policy.partBytes,
      received: await received(dir, declaration.entries),
    }
  })
}

async function append(
  staging: Staging,
  request: Parameters<LocalUploads['append']>[0],
): Promise<UploadAppend> {
  const place = placeOf(request.operationId)
  const dir = join(staging.base, place)
  return staging.queue(place, async () => {
    const declaration = await declared(dir)
    if (declaration === undefined) return { kind: 'absent' }
    const entry = declaration.entries.find(one => one.path === request.path)
    if (entry === undefined) return { kind: 'invalid', reason: 'undeclared-path' }
    const target = join(dir, FILES, entry.path)
    const current = await sizeOf(target)
    if (request.offset !== current) return { kind: 'received', bytes: current }
    if (current + request.bytes.length > entry.bytes)
      return { kind: 'invalid', reason: 'beyond-declared' }
    await mkdir(dirname(target), { recursive: true })
    await appendFile(target, request.bytes)
    await touch(staging, dir)
    return { kind: 'received', bytes: current + request.bytes.length }
  })
}

async function reader(staging: Staging, operationId: string): Promise<UploadReader> {
  const place = placeOf(operationId)
  const dir = join(staging.base, place)
  return staging.queue(place, async () => {
    const declaration = await declared(dir)
    if (declaration === undefined) return { kind: 'absent' }
    const id = capabilityId(declaration.category, declaration.name)
    if (!id.ok) return { kind: 'unavailable' }
    const arrived = await received(dir, declaration.entries)
    const missing = declaration.entries
      .filter((entry, index) => arrived[index]?.bytes !== entry.bytes)
      .map(entry => entry.path)
    if (missing.length > 0) return { kind: 'incomplete', missing }
    const files = join(dir, FILES)
    const entries = await Promise.all(
      declaration.entries.map(async entry => ({
        ...entry,
        digest: digestBytes(await readFile(join(files, entry.path))),
      })),
    )
    return { kind: 'ready', capability: id.id, from: stagedReader(files, { entries }) }
  })
}

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)

export function createLocalUploads(input: {
  root: string | undefined
  categories: Pick<CategoryView, 'lookup'>
  policy: UploadPolicy
  clock?: (() => number) | undefined
}): LocalUploads {
  const staging: Staging | undefined =
    input.root === undefined
      ? undefined
      : {
          base: join(input.root, UPLOADS),
          categories: input.categories,
          policy: input.policy,
          clock: input.clock ?? Date.now,
          queue: serialized(),
        }
  const guarded =
    <A, T>(task: (staging: Staging, argument: A) => Promise<T>) =>
    async (argument: A): Promise<T | typeof UNAVAILABLE> => {
      if (staging === undefined) return UNAVAILABLE
      try {
        return await task(staging, argument)
      } catch {
        return UNAVAILABLE
      }
    }
  return {
    begin: guarded(begin),
    resume: guarded(resume),
    append: guarded(append),
    reader: guarded(reader),
    async discard(operationId) {
      if (staging === undefined) return
      const place = placeOf(operationId)
      await staging.queue(place, () =>
        rm(join(staging.base, place), { recursive: true, force: true }),
      )
    },
    sweep: async () => (staging === undefined ? 0 : sweepIdle(staging)),
  }
}
