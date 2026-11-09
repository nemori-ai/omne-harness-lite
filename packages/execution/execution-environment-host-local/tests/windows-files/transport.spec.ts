// The real files helper (`files.exe`) under the Windows files backend. Every spawned process is
// recorded, and every request written to it is recorded before an optional hold, so the tests
// count what started and what reached the helper.
import type { ChildProcess } from 'node:child_process'
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { beforeEach, expect, it, vi } from 'vitest'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

const spawned = vi.hoisted(() => ({
  commands: [] as string[],
  children: [] as ChildProcess[],
  written: [] as string[],
  hold: { marker: '\0none', entered: () => undefined, released: () => Promise.resolve() } as {
    marker: string
    entered(): void
    released(): Promise<void>
  },
}))

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { holdNativeInput } = await import('./native-control.ts')
  return {
    ...actual,
    execFile(...args: Parameters<typeof actual.execFile>) {
      spawned.commands.push(JSON.stringify([args[0], args[1]]))
      return actual.execFile(...args)
    },
    spawn(...args: Parameters<typeof actual.spawn>): ChildProcess {
      spawned.commands.push(JSON.stringify([args[0], args[1]]))
      const child = actual.spawn(...args)
      spawned.children.push(child)
      const input = child.stdin
      if (input === null) return child
      const recorder = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          spawned.written.push(chunk.toString('utf8'))
          done(null, chunk)
        },
      })
      input.on('error', error => recorder.destroy(error))
      recorder.pipe(input)
      child.stdin = recorder
      // The helper outlives a test; the hold is read when a request is written.
      holdNativeInput(child, {
        get marker() {
          return spawned.hold.marker
        },
        entered: () => spawned.hold.entered(),
        released: () => spawned.hold.released(),
      })
      return child
    },
  }
})

beforeEach(context => context.skip(process.platform !== 'win32'))

const isHelper = (child: ChildProcess) => child.spawnfile.endsWith('files.exe')

it('runs file operations in one resident helper and starts no PowerShell', async () => {
  await withFiles(async ({ files, root, input, bytes }) => {
    const parent = await hostObjectToken(root)
    const before = spawned.commands.length
    const helpers = spawned.children.length
    const created = await files.write({
      ...request(join(root, 'new.txt'), parent),
      bytes,
      mode: 'create',
    })
    expect(created.kind).toBe('done')
    for (let round = 0; round < 3; round++) {
      expect((await files.stat(input)).kind).toBe('done')
      expect((await files.read(input)).kind).toBe('done')
      expect((await files.list(request(root, parent))).kind).toBe('done')
    }
    if (created.kind !== 'done') throw new Error('create')
    const replaced = await files.write({
      ...request(join(root, 'new.txt'), created.value.object),
      bytes: Buffer.from('replaced'),
      mode: 'replace',
    })
    expect(replaced.kind).toBe('done')
    const started = spawned.commands.slice(before)
    expect(started.filter(command => /powershell/iu.test(command))).toEqual([])
    // One helper at most: the first operation may start it, no later one starts another.
    expect(spawned.children.slice(helpers).filter(isHelper).length).toBeLessThanOrEqual(1)
    expect(spawned.children.filter(isHelper)).toHaveLength(1)
  })
}, 60_000)

it('P2: a request written to the helper answers unknown when the helper is killed', async () => {
  await withFiles(async ({ root, files, input }) => {
    const held = join(root, 'held-by-transport-test.txt')
    await writeFile(held, 'held')
    // The token is read before the hold is armed: the helper reads it too.
    const named = await hostObjectToken(held)
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    spawned.hold = {
      marker: 'held-by-transport-test',
      entered: () => entered.resolve(),
      released: () => released.promise,
    }
    try {
      const pending = files.stat(request(held, named, 'held'))
      await entered.promise
      const helper = spawned.children.findLast(isHelper)
      expect(helper?.kill()).toBe(true)
      expect(await pending).toEqual({ kind: 'unknown', requestId: 'held' })
    } finally {
      released.resolve()
      spawned.hold = {
        marker: '\u0000none',
        entered: () => undefined,
        released: () => Promise.resolve(),
      }
    }
    // The next request starts a new helper and is answered.
    expect((await files.stat(input)).kind).toBe('done')
    expect(await readdir(root)).toEqual(['held-by-transport-test.txt', '中文.txt'])
  })
}, 60_000)

it('shares one helper between engines', async () => {
  await withFiles(async ({ files, input, root }) => {
    expect((await files.stat(input)).kind).toBe('done')
    const before = spawned.children.length
    const other = createHostFilesEngine({ root }).facilityFor('other')
    expect((await other.stat(input)).kind).toBe('done')
    expect(spawned.children.length).toBe(before)
  })
}, 60_000)
