// One Windows files backend with and without a files root (B-1, B-3, B-4 of the Windows files
// backend in SPEC): `read` and `stat` without a root run in the files helper, path forms outside the
// supported range answer by whether a root is configured, a `.` segment is as if not written, and
// `hostObjectToken` gives the token the backend checks.
import type { ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

const seen = vi.hoisted(() => ({ opened: [] as string[], frames: [] as string[] }))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open(...args: Parameters<typeof actual.open>) {
      seen.opened.push(String(args[0]))
      return actual.open(...args)
    },
  }
})

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn(...args: Parameters<typeof actual.spawn>): ChildProcess {
      const child = actual.spawn(...args)
      const input = child.stdin
      if (!String(args[0]).endsWith('files.exe') || input === null) return child
      const write = input.write.bind(input)
      input.write = ((chunk: unknown, ...rest: never[]) => {
        seen.frames.push(String(chunk))
        return write(chunk as string, ...rest)
      }) as typeof input.write
      return child
    },
  }
})

beforeEach(context => context.skip(process.platform !== 'win32'))

/** The frames written to the files helper for `operation` that carry `name`. */
const framesOf = (operation: string, name: string) =>
  seen.frames.filter(
    frame => frame.includes(`"operation":"${operation}"`) && frame.includes(JSON.stringify(name)),
  )

it('runs read and stat without a files root in the files helper, not through Node', async () => {
  await withFiles(async ({ path, bytes }) => {
    const files = createHostFilesEngine().facilityFor('unrooted')
    const named = await hostObjectToken(path)
    const opened = seen.opened.length
    const read = await files.read(request(path, named, 'read'))
    expect(read).toMatchObject({ kind: 'done', value: { object: named } })
    if (read.kind === 'done') expect(Buffer.from(read.value.bytes)).toEqual(bytes)
    expect(await files.stat(request(path, named, 'stat'))).toMatchObject({
      kind: 'done',
      value: { object: named, type: 'file', sizeBytes: bytes.length },
    })
    expect(seen.opened.slice(opened)).toEqual([])
    expect(framesOf('read', '中文.txt')).toHaveLength(1)
    expect(framesOf('stat', '中文.txt')).toHaveLength(1)
  })
}, 60_000)

it('answers unsupported without a root and notAuthorized below one for UNC, device and stream spellings', async () => {
  await withFiles(async ({ files: rooted, path }) => {
    const unrooted = createHostFilesEngine().facilityFor('unrooted')
    const named = await hostObjectToken(path)
    const back = String.fromCharCode(92)
    const [drive = '', ...rest] = path.split(back)
    const spellings = [
      `${back}${back}localhost${back}${drive.slice(0, 1)}$${back}${rest.join(back)}`,
      `${back}${back}?${back}${path}`,
      `${back}${back}.${back}${path}`,
      `${path}:stream`,
    ]
    for (const spelling of spellings) {
      for (const operation of ['read', 'stat'] as const) {
        expect(await unrooted[operation](request(spelling, named, spelling))).toEqual({
          kind: 'rejected',
          requestId: spelling,
          reason: 'unsupported',
        })
        expect(await rooted[operation](request(spelling, named, spelling))).toEqual({
          kind: 'rejected',
          requestId: spelling,
          reason: 'notAuthorized',
        })
      }
    }
  })
}, 60_000)

it('treats a `.` segment as not written, with and without a root', async () => {
  await withFiles(async ({ files: rooted, root, path, bytes }) => {
    const unrooted = createHostFilesEngine().facilityFor('unrooted')
    const folder = join(root, 'folder')
    await mkdir(folder)
    await writeFile(join(folder, 'inner.txt'), 'inner')
    const named = await hostObjectToken(path)
    const folderNamed = await hostObjectToken(folder)
    const dotted = `${root}\\.\\中文.txt`
    expect(await hostObjectToken(dotted)).toEqual(named)
    for (const files of [rooted, unrooted]) {
      const read = await files.read(request(dotted, named, 'dotted'))
      expect(read).toMatchObject({ kind: 'done', value: { object: named } })
      if (read.kind === 'done') expect(Buffer.from(read.value.bytes)).toEqual(bytes)
      expect(await files.stat(request(`${folder}\\.`, folderNamed, 'trailing'))).toMatchObject({
        kind: 'done',
        value: { object: folderNamed, type: 'directory' },
      })
      const listed = await files.list(request(`${root}\\.\\folder\\.\\`, folderNamed, 'list'))
      expect(listed).toMatchObject({ kind: 'done', value: { directory: { object: folderNamed } } })
      if (listed.kind === 'done')
        expect(listed.value.entries.map(entry => entry.name)).toEqual(['inner.txt'])
    }
  })
}, 60_000)

it('gives hostObjectToken the FileIdInfo token that the backend reports for the same object', async () => {
  await withFiles(async ({ files: rooted, root, path }) => {
    const unrooted = createHostFilesEngine().facilityFor('unrooted')
    for (const target of [path, root]) {
      const named = await hostObjectToken(target)
      expect(named.token).toMatch(/^\d+:[0-9a-f]{32}$/u)
      for (const files of [rooted, unrooted]) {
        const stat = await files.stat(request(target, named, 'stat'))
        expect(stat).toMatchObject({ kind: 'done', value: { object: named } })
      }
    }
    const listed = await rooted.list(request(root, await hostObjectToken(root), 'list'))
    if (listed.kind !== 'done') throw new Error(JSON.stringify(listed))
    expect(listed.value.entries.map(entry => entry.object)).toEqual([await hostObjectToken(path)])
  })
}, 60_000)
