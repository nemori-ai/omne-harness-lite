import childProcess from 'node:child_process'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import workerThreads from 'node:worker_threads'
import { afterAll } from 'vitest'
import { READ_SET_META, type ReadKind as Kind } from './read-sets.ts'

interface Recorded {
  readonly content: Set<string>
  readonly listing: Set<string>
  readonly presence: Set<string>
  readonly incomplete: Set<string>
}

interface Recorder {
  current: Recorded
}

type Fn = (this: unknown, ...args: unknown[]) => unknown

const READS: Readonly<Record<Kind, readonly string[]>> = {
  content: [
    'readFile',
    'readFileSync',
    'createReadStream',
    'open',
    'openSync',
    'openAsBlob',
    'copyFile',
    'copyFileSync',
    'cp',
    'cpSync',
  ],
  listing: ['readdir', 'readdirSync', 'opendir', 'opendirSync'],
  presence: [
    'exists',
    'existsSync',
    'stat',
    'statSync',
    'lstat',
    'lstatSync',
    'access',
    'accessSync',
    'realpath',
    'realpathSync',
    'readlink',
    'readlinkSync',
  ],
}
const GLOBS = ['glob', 'globSync']
const SPAWNS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']

const CHILD_PROCESS = '起了子进程'
const WORKER_THREAD = '起了工作线程'
const FS_GLOB = '用了 fs.glob'
const GLOBAL = Symbol.for('omne.test-runner.read-recorder')

const fresh = (): Recorded => ({
  content: new Set(),
  listing: new Set(),
  presence: new Set(),
  incomplete: new Set(),
})

function pathOf(target: unknown): string | undefined {
  if (typeof target === 'string') return resolve(target)
  if (Buffer.isBuffer(target)) return resolve(target.toString())
  if (target instanceof URL && target.protocol === 'file:') return resolve(fileURLToPath(target))
  return undefined
}

function quietly(action: () => void): void {
  try {
    action()
  } catch {
    return
  }
}

const SAME_ENTRY_BY_ANOTHER_NAME: readonly (string | symbol)[] = ['native', promisify.custom]

function wrapped(original: Fn, before: (args: readonly unknown[]) => void): Fn {
  const wrapper: Fn = function (...args) {
    quietly(() => before(args))
    return new.target === undefined
      ? original.apply(this, args)
      : Reflect.construct(original, args, new.target)
  }
  const own = Object.getOwnPropertyDescriptors(original) as Record<
    string | symbol,
    PropertyDescriptor
  >
  for (const key of SAME_ENTRY_BY_ANOTHER_NAME) {
    const inner = own[key]
    if (typeof inner?.value !== 'function') continue
    const same = inner.value === original
    own[key] = { ...inner, value: same ? wrapper : wrapped(inner.value as Fn, before) }
  }
  Object.defineProperties(wrapper, own)
  return wrapper
}

function patch(
  host: Record<string, unknown>,
  names: readonly string[],
  before: (args: readonly unknown[]) => void,
): void {
  for (const name of names) {
    const original = host[name]
    if (typeof original === 'function') host[name] = wrapped(original as Fn, before)
  }
}

function install(recorder: Recorder): void {
  const reads = (kind: Kind) => (args: readonly unknown[]) => {
    const path = pathOf(args[0])
    if (path !== undefined) recorder.current[kind].add(path)
  }
  const flags = (reason: string) => () => {
    recorder.current.incomplete.add(reason)
  }
  for (const host of [fs, fs.promises] as unknown as Record<string, unknown>[]) {
    for (const kind of Object.keys(READS) as Kind[]) patch(host, READS[kind], reads(kind))
    patch(host, GLOBS, flags(FS_GLOB))
  }
  patch(childProcess as unknown as Record<string, unknown>, SPAWNS, flags(CHILD_PROCESS))
  patch(workerThreads as unknown as Record<string, unknown>, ['Worker'], flags(WORKER_THREAD))
  syncBuiltinESMExports()
}

function recorderOf(): Recorder | undefined {
  const holder = globalThis as unknown as Record<symbol, Recorder | undefined>
  const existing = holder[GLOBAL]
  if (existing !== undefined) {
    existing.current = fresh()
    return existing
  }
  const created: Recorder = { current: fresh() }
  try {
    install(created)
  } catch {
    return undefined
  }
  holder[GLOBAL] = created
  return created
}

const mine = recorderOf()?.current

// oxlint-disable-next-line no-empty-pattern -- vitest 要求钩子的第一个参数写成解构，文件在第二个
afterAll(({}, suite) => {
  if (mine === undefined) return
  ;(suite.meta as Record<string, unknown>)[READ_SET_META] = {
    content: [...mine.content],
    listing: [...mine.listing],
    presence: [...mine.presence],
    incomplete: [...mine.incomplete],
  }
})
