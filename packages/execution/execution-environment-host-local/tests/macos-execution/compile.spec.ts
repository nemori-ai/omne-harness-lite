// Fast: how the session reader is compiled and cached. `xcode-select -p` is asked first, a failed
// compile leaves no stage behind, a compiled reader is kept by its content, and `sessionReader`
// does not keep a missing answer. The host's own `xcode-select` and `cc` are swapped for stand-ins
// by path; a real compile runs only on macOS. Runs on every POSIX host; skipped on Windows.
import { constants } from 'node:fs'
import {
  access,
  chmod,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  compileSessionReader,
  sessionReader,
  type SessionReader,
} from '../../src/macos-execution/compile.ts'

/** Host tools the module under test runs, swapped by path for the test's stand-ins. */
const swap = vi.hoisted(() => ({
  paths: new Map<string, string>(),
  temporary: undefined as string | undefined,
}))

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  const execFile = (file: string, ...rest: unknown[]) =>
    Reflect.apply(actual.execFile, undefined, [swap.paths.get(file) ?? file, ...rest])
  // Keep the promisified form `{ stdout, stderr }` for any module that promisifies execFile.
  Object.defineProperty(execFile, promisify.custom, {
    value: (file: string, ...rest: unknown[]) =>
      Reflect.apply(promisify(actual.execFile), undefined, [swap.paths.get(file) ?? file, ...rest]),
  })
  return { ...actual, execFile }
})
vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, tmpdir: () => swap.temporary ?? actual.tmpdir() }
})

const onPosix = describe.skipIf(process.platform === 'win32')
const darwin = process.platform === 'darwin'

let root = ''
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'omne-compile-')))
})
afterEach(async () => {
  swap.paths.clear()
  swap.temporary = undefined
  await rm(root, { recursive: true, force: true })
})

/**
 * A stand-in `cc` that notes where `-o` points, prints a line as a compiler may, and writes an
 * executable there; `writes: false` exits 0 without writing it.
 */
async function fakeCompiler(writes = true): Promise<string> {
  const path = join(root, writes ? 'cc' : 'cc-silent')
  const output = writes ? 'printf "#!/bin/sh\\n" > "$4" && chmod 755 "$4"' : 'exit 0'
  await writeFile(
    path,
    `#!/bin/sh\necho "$4" >> '${join(root, 'cc.log')}'\necho 'cc: a note'\n${output}\n`,
  )
  await chmod(path, 0o755)
  return path
}

const executable = (path: string) =>
  access(path, constants.X_OK).then(
    () => true,
    () => false,
  )

/** Every entry under the cache root, one level into each content directory. */
async function cacheEntries(cacheRoot: string): Promise<string[]> {
  const digests = await readdir(cacheRoot).catch(() => [])
  const entries: string[] = []
  for (const digest of digests)
    for (const name of await readdir(join(cacheRoot, digest))) entries.push(`${digest}/${name}`)
  return entries
}

onPosix('compileSessionReader', () => {
  it('reports the command line tools missing when xcode-select fails, and compiles nothing', async () => {
    const cacheRoot = join(root, 'cache')
    expect(
      await compileSessionReader({
        cacheRoot,
        xcodeSelect: '/usr/bin/false',
        cc: '/usr/bin/false',
      }),
    ).toEqual({ kind: 'missing', missing: 'commandLineTools' })
    expect(await cacheEntries(cacheRoot)).toEqual([])
  })

  it('reports a failed compile and leaves no stage behind', async () => {
    const cacheRoot = join(root, 'cache')
    expect(
      await compileSessionReader({ cacheRoot, xcodeSelect: '/usr/bin/true', cc: '/usr/bin/false' }),
    ).toEqual({ kind: 'missing', missing: 'compile' })
    const digests = await readdir(cacheRoot)
    expect(digests).toHaveLength(1)
    expect(digests[0]).toMatch(/^[0-9a-f]{64}$/u)
    expect(await cacheEntries(cacheRoot)).toEqual([])
  })

  it('places the reader under its content digest and reuses it without compiling', async () => {
    const cacheRoot = join(root, 'cache')
    const cc = await fakeCompiler()
    const first = await compileSessionReader({ cacheRoot, xcodeSelect: '/usr/bin/true', cc })
    if (first.kind !== 'ready') throw new Error(`expected a reader: ${JSON.stringify(first)}`)
    const [digest] = await readdir(cacheRoot)
    expect(first.path).toBe(join(cacheRoot, digest ?? '', 'omne-session'))
    // The compiler wrote into a stage inside the content directory, renamed into place after.
    const [staged] = (await readFile(join(root, 'cc.log'), 'utf8')).split('\n')
    expect(dirname(dirname(staged ?? ''))).toBe(join(cacheRoot, digest ?? ''))
    expect(basename(dirname(staged ?? ''))).toMatch(/^compile-/u)
    expect(await cacheEntries(cacheRoot)).toEqual([`${digest}/omne-session`])
    expect(
      await compileSessionReader({
        cacheRoot,
        xcodeSelect: '/usr/bin/false',
        cc: '/usr/bin/false',
      }),
    ).toEqual(first)
  })

  it('fails when the compiler wrote no reader, and leaves no stage behind', async () => {
    const cacheRoot = join(root, 'cache')
    const cc = await fakeCompiler(false)
    await expect(
      compileSessionReader({ cacheRoot, xcodeSelect: '/usr/bin/true', cc }),
    ).rejects.toThrow()
    expect(await cacheEntries(cacheRoot)).toEqual([])
  })

  it('compiles the real reader with the host compiler on macOS', async () => {
    const cacheRoot = join(root, 'cache')
    const tools = { cacheRoot, xcodeSelect: '/usr/bin/true', cc: '/usr/bin/cc' }
    const reading = await compileSessionReader(tools)
    if (!darwin) {
      // The reader uses the macOS process interfaces; no other host compiles it.
      expect(reading).toEqual({ kind: 'missing', missing: 'compile' })
      return
    }
    if (reading.kind !== 'ready') throw new Error(`expected a reader: ${JSON.stringify(reading)}`)
    expect(await executable(reading.path)).toBe(true)
    expect(await compileSessionReader({ ...tools, cc: '/usr/bin/false' })).toEqual(reading)
  }, 60_000)
})

onPosix('sessionReader', () => {
  it('does not keep a missing answer, keeps a ready one, and never drops a newer compile', async () => {
    const cc = await fakeCompiler()
    // The temporary directory is a file: the cache cannot be made and the compile throws.
    await writeFile(join(root, 'file'), '')
    swap.temporary = join(root, 'file')
    swap.paths.set('/usr/bin/xcode-select', '/usr/bin/true')
    expect(await sessionReader()).toEqual({ kind: 'missing', missing: 'compile' })

    swap.temporary = root
    swap.paths.set('/usr/bin/xcode-select', '/usr/bin/false')
    const missing = sessionReader()
    // The first caller told of the missing answer starts the next compile, the tools now there,
    // before a later caller of the same answer is told: that caller must not drop the new one.
    let ready: Promise<SessionReader> | undefined
    const retried = missing.then(() => {
      swap.paths.set('/usr/bin/xcode-select', '/usr/bin/true')
      swap.paths.set('/usr/bin/cc', cc)
      ready = sessionReader()
    })
    expect(sessionReader()).toBe(missing)
    expect(await missing).toEqual({ kind: 'missing', missing: 'commandLineTools' })
    await retried
    if (ready === undefined) throw new Error('the retry did not run')
    expect(ready).not.toBe(missing)
    const reading = await ready
    if (reading.kind !== 'ready') throw new Error(`expected a reader: ${JSON.stringify(reading)}`)
    expect(reading.path.startsWith(join(root, 'omne-macos-execution'))).toBe(true)
    expect(await executable(reading.path)).toBe(true)
    // The ready answer is the one every later caller gets.
    expect(sessionReader()).toBe(ready)
  })
})
