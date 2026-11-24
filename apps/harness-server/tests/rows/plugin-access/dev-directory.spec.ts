import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDevDirectorySource,
  type DevDirectorySource,
} from '../../../src/rows/plugin-access/dev-directory.ts'
import { nodeFileIo } from '../../../src/rows/plugin-access/file-io.ts'

const principal = { principal: {} as Principal, tenant: 'any tenant' }
const opened: { root: string; source?: DevDirectorySource }[] = []

afterEach(() => {
  for (const { root, source } of opened.splice(0)) {
    source?.close()
    rmSync(root, { recursive: true, force: true })
  }
})

function write(root: string, path: string, text: string): void {
  const file = join(root, ...path.split('/'))
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

const manifest = (name: string) =>
  JSON.stringify({
    schema: 1,
    name,
    summary: `The ${name} plugin`,
    client: { members: [{ point: 'page', key: name, module: 'main.js', export: 'page' }] },
  })

/** A dev directory with one plugin that holds and one whose manifest names another directory. */
function directory() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-dev-')))
  write(root, 'notes/plugin.json', manifest('notes'))
  write(root, 'notes/main.js', 'export const page = 1\n')
  write(root, 'misnamed/plugin.json', manifest('other'))
  write(root, 'misnamed/main.js', 'export const page = 2\n')
  const warnings: string[] = []
  const source = createDevDirectorySource({ root, warn: line => warnings.push(line) })
  opened.push({ root, source })
  return { root, source, warnings }
}

async function listed(source: DevDirectorySource) {
  const list = await source.list(principal)
  if (list.kind !== 'read') throw new Error('the source is unavailable')
  return list.offered
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

function changed(source: DevDirectorySource): Promise<number> {
  const started = Date.now()
  return new Promise(resolve => {
    const stop = source.subscribe('any tenant', () => {
      stop()
      resolve(Date.now() - started)
    })
  })
}

describe('the dev directory as a source of plugins', () => {
  it('offers each sub-directory that holds, and warns of the one that does not', async () => {
    const { source, warnings } = directory()
    const offered = await listed(source)
    expect(offered.map(each => each.manifest.name)).toEqual(['notes'])
    const [notes] = offered
    const main = 'export const page = 1\n'
    expect(notes?.manifestText).toBe(manifest('notes'))
    expect(notes?.files).toEqual([
      { path: 'main.js', digest: sha(main), bytes: main.length },
      { path: 'plugin.json', digest: sha(manifest('notes')), bytes: manifest('notes').length },
    ])
    const lines = `main.js\0${sha(main)}\nplugin.json\0${sha(manifest('notes'))}\n`
    expect(notes?.version).toBe(sha(lines).slice(0, 16))
    expect(warnings).toEqual([expect.stringContaining('misnamed')])
    expect(warnings[0]).toContain('other')
  })

  it('reads a file it listed in parts, and nothing it did not list', async () => {
    const { source } = directory()
    const [notes] = await listed(source)
    const at = { name: 'notes', version: notes!.version, path: 'main.js' }
    const first = await source.read(principal, { ...at, offset: 0, limit: 10 })
    expect(first).toEqual({
      kind: 'read',
      part: new Uint8Array(Buffer.from('export con')),
      next: 10,
      bytes: 22,
    })
    const rest = await source.read(principal, { ...at, offset: 10, limit: 100 })
    expect(rest).toMatchObject({ kind: 'read', next: null, bytes: 22 })
    expect(Buffer.from((rest as { part: Uint8Array }).part).toString()).toBe('st page = 1\n')
    expect(await source.read(principal, { ...at, path: 'other.js', offset: 0, limit: 1 })).toEqual({
      kind: 'absent',
      what: 'file',
    })
    expect(await source.read(principal, { ...at, version: 'v-old', offset: 0, limit: 1 })).toEqual({
      kind: 'absent',
      what: 'plugin',
    })
    expect(await source.read(principal, { ...at, name: 'other', offset: 0, limit: 1 })).toEqual({
      kind: 'absent',
      what: 'plugin',
    })
  })

  it('does not read through a link that leads out of the plugin', async () => {
    const { root, source } = directory()
    write(root, 'notes/data/a.json', '{}')
    const [before] = await listed(source)
    rmSync(join(root, 'notes', 'data'), { recursive: true })
    mkdirSync(join(root, 'outside'))
    write(root, 'outside/a.json', '{}')
    symlinkSync(join(root, 'outside'), join(root, 'notes', 'data'))
    expect(
      await source.read(principal, {
        name: 'notes',
        version: before!.version,
        path: 'data/a.json',
        offset: 0,
        limit: 10,
      }),
    ).toEqual({ kind: 'absent', what: 'file' })
  })

  it('a file whose content changed since the listing is no longer that version', async () => {
    const { root, source } = directory()
    const [notes] = await listed(source)
    write(root, 'notes/main.js', 'export const page = 3\n')
    expect(
      await source.read(principal, {
        name: 'notes',
        version: notes!.version,
        path: 'main.js',
        offset: 0,
        limit: 10,
      }),
    ).toEqual({ kind: 'absent', what: 'plugin' })
  })

  it('calls its listeners within two seconds of a change, and the version follows the content', async () => {
    const { root, source } = directory()
    const [before] = await listed(source)
    await source.settled()
    const waited = changed(source)
    write(root, 'notes/main.js', 'export const page = 4\n')
    expect(await waited).toBeLessThan(2_000)
    const [after] = await listed(source)
    expect(after?.version).not.toBe(before?.version)

    const added = changed(source)
    write(root, 'notes/extra.css', 'a {}\n')
    expect(await added).toBeLessThan(2_000)
    const removed = changed(source)
    rmSync(join(root, 'notes', 'extra.css'))
    expect(await removed).toBeLessThan(2_000)
  })

  it('does not call its listeners when the content is the same', async () => {
    const { root, source } = directory()
    await listed(source)
    await source.settled()
    let calls = 0
    source.subscribe('any tenant', () => (calls += 1))
    write(root, 'notes/main.js', 'export const page = 1\n')
    await new Promise(resolve => setTimeout(resolve, 600))
    await source.settled()
    expect(calls).toBe(0)
  })

  it('stops watching when closed', async () => {
    const { root, source } = directory()
    await source.settled()
    let calls = 0
    source.subscribe('any tenant', () => (calls += 1))
    source.close()
    write(root, 'notes/main.js', 'export const page = 5\n')
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(calls).toBe(0)
  })

  it('a directory that cannot be read is unavailable, not empty: what is loaded stays', async () => {
    const root = join(tmpdir(), `plugin-dev-gone-${process.pid}-${Date.now()}`)
    const warnings: string[] = []
    const source = createDevDirectorySource({ root, warn: line => warnings.push(line) })
    opened.push({ root, source })
    expect(await source.list(principal)).toEqual({ kind: 'unavailable' })
    expect(warnings.join('\n')).toContain('cannot be read')
    write(root, 'notes/plugin.json', manifest('notes'))
    write(root, 'notes/main.js', 'export const page = 1\n')
    const list = await source.list(principal)
    expect(list.kind === 'read' && list.offered.map(each => each.manifest.name)).toEqual(['notes'])
  })

  it('leaves out the files and directories whose name begins with a dot', async () => {
    const { root, source } = directory()
    const before = await listed(source)
    write(root, 'notes/.DS_Store', 'finder')
    write(root, 'notes/.git/config', 'x')
    write(root, '.hidden/plugin.json', manifest('.hidden'))
    const after = await listed(source)
    expect(after).toEqual(before)
  })

  it('without a directory it offers nothing and says nothing', async () => {
    const source = createDevDirectorySource({ root: undefined, warn: () => undefined })
    expect(await source.list(principal)).toEqual({ kind: 'read', offered: [] })
    expect(
      await source.read(principal, { name: 'n', version: 'v', path: 'p', offset: 0, limit: 1 }),
    ).toEqual({ kind: 'absent', what: 'plugin' })
    let calls = 0
    source.subscribe('any tenant', () => (calls += 1))()
    source.close()
    expect(calls).toBe(0)
  })

  /** A directory with two plugins, and a source that records each digest it takes and each range it reads. */
  function counted() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-dev-')))
    write(root, 'notes/plugin.json', manifest('notes'))
    write(root, 'notes/main.js', 'export const page = 1\n'.repeat(1000))
    write(root, 'board/plugin.json', manifest('board'))
    write(root, 'board/main.js', 'export const page = 2\n')
    const reads: string[] = []
    const ranges: number[] = []
    const source = createDevDirectorySource({
      root,
      warn: () => undefined,
      io: {
        digest(path, keepText) {
          reads.push(path.slice(root.length + 1))
          return nodeFileIo.digest(path, keepText)
        },
        range(path, offset, length) {
          ranges.push(length)
          return nodeFileIo.range(path, offset, length)
        },
      },
    })
    opened.push({ root, source })
    return { root, source, reads, ranges }
  }

  it('lists again without digesting any file while nothing changed', async () => {
    const { source, reads } = counted()
    await listed(source)
    await source.settled()
    const before = reads.length
    expect((await listed(source)).map(each => each.manifest.name)).toEqual(['board', 'notes'])
    await listed(source)
    expect(reads.slice(before)).toEqual([])
  })

  it('reads a part by reading that part alone: the file is not read whole, whatever its size', async () => {
    const { source, reads, ranges } = counted()
    const notes = (await listed(source)).find(each => each.manifest.name === 'notes')
    await source.settled()
    const before = reads.length
    const at = { name: 'notes', version: notes!.version, path: 'main.js' }
    const parts: Uint8Array[] = []
    for (let offset: number | null = 0; offset !== null;) {
      const read = await source.read(principal, { ...at, offset, limit: 4096 })
      if (read.kind !== 'read') throw new Error(read.kind)
      parts.push(read.part)
      offset = read.next
    }
    expect(parts.length).toBeGreaterThan(4)
    expect(Buffer.concat(parts).toString()).toBe('export const page = 1\n'.repeat(1000))
    expect(reads.slice(before)).toEqual([])
    expect(ranges.length).toBe(parts.length)
    expect(Math.max(...ranges)).toBeLessThanOrEqual(4096)
  })

  it('after one file changes, digests that file again and no other', async () => {
    const { root, source, reads } = counted()
    await listed(source)
    await source.settled()
    const told = changed(source)
    const before = reads.length
    write(root, 'board/main.js', 'export const page = 3\n')
    await told
    const board = (await listed(source)).find(each => each.manifest.name === 'board')
    expect(board?.files.find(file => file.path === 'main.js')?.digest).toBe(
      sha('export const page = 3\n'),
    )
    expect(new Set(reads.slice(before))).toEqual(new Set(['board/main.js']))
  })

  it('answers that the plugin is absent for a version the directory has moved on from', async () => {
    const { root, source } = counted()
    const notes = (await listed(source)).find(each => each.manifest.name === 'notes')
    const at = { name: 'notes', version: notes!.version, path: 'main.js' }
    const first = await source.read(principal, { ...at, offset: 0, limit: 22 })
    expect(first.kind).toBe('read')
    writeFileSync(join(root, 'notes', 'main.js'), 'export const page = 9\n')
    const told = changed(source)
    await told
    expect(await source.read(principal, { ...at, offset: 22, limit: 22 })).toEqual({
      kind: 'absent',
      what: 'plugin',
    })
  })

  it('does not pass a file that changed since it was listed as the version listed', async () => {
    const { root, source } = counted()
    const notes = (await listed(source)).find(each => each.manifest.name === 'notes')
    await source.settled()
    const at = { name: 'notes', version: notes!.version, path: 'main.js', offset: 0, limit: 22 }
    expect((await source.read(principal, at)).kind).toBe('read')
    writeFileSync(join(root, 'notes', 'main.js'), 'export const page = 9\n'.repeat(1000))
    expect(await source.read(principal, at)).toEqual({ kind: 'absent', what: 'plugin' })
  })

  it('reads past the end as nothing more, and a part that runs over the end as what is left', async () => {
    const { source } = counted()
    const board = (await listed(source)).find(each => each.manifest.name === 'board')
    const at = { name: 'board', version: board!.version, path: 'main.js' }
    const tail = await source.read(principal, { ...at, offset: 16, limit: 100 })
    expect(tail).toMatchObject({ kind: 'read', next: null, bytes: 22 })
    expect(Buffer.from((tail as { part: Uint8Array }).part).toString()).toBe('e = 2\n')
    const past = await source.read(principal, { ...at, offset: 500, limit: 100 })
    expect(past).toMatchObject({ kind: 'read', next: null, bytes: 22 })
    expect((past as { part: Uint8Array }).part.byteLength).toBe(0)
  })

  it('tells of a change while something keeps writing into the directory: it does not wait for the writing to stop', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-dev-')))
    write(root, 'board/plugin.json', manifest('board'))
    write(root, 'board/main.js', 'export const page = 2\n')
    let event = (): void => undefined
    const source = createDevDirectorySource({
      root,
      warn: () => undefined,
      watch: (_root, onEvent) => ((event = onEvent), () => undefined),
    })
    opened.push({ root, source })
    await listed(source)
    await source.settled()
    let told: number | undefined
    const started = Date.now()
    const stop = source.subscribe('any tenant', () => (told ??= Date.now() - started))
    const written = (path: string, text: string): void => {
      write(root, path, text)
      event()
    }
    written('board/main.js', 'export const page = 4\n')
    const noise = setInterval(() => written('notes/.scratch', String(Date.now())), 40)
    try {
      await new Promise(resolve => setTimeout(resolve, 1_500))
    } finally {
      clearInterval(noise)
      stop()
    }
    expect(told).toBeDefined()
    expect(told!).toBeLessThan(1_000)
  })

  /** A source over a platform whose watching says nothing: it takes the watch and never sends an event. */
  function deaf() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-dev-')))
    write(root, 'notes/plugin.json', manifest('notes'))
    write(root, 'notes/main.js', 'export const page = 1\n')
    const source = createDevDirectorySource({
      root,
      warn: () => undefined,
      watch: () => () => undefined,
    })
    opened.push({ root, source })
    return { root, source }
  }

  it.each([
    [
      'a plugin is put in',
      (root: string) => {
        write(root, 'board/plugin.json', manifest('board'))
        write(root, 'board/main.js', 'export const page = 2\n')
      },
    ],
    ['a file changes', (root: string) => write(root, 'notes/main.js', 'export const page = 7\n')],
    ['a plugin is taken away', (root: string) => rmSync(join(root, 'notes'), { recursive: true })],
  ] as const)(
    'tells of a change within two seconds when the watching sends no event at all: %s',
    async (_name, change) => {
      const { root, source } = deaf()
      await listed(source)
      await source.settled()
      const told = changed(source)
      change(root)
      expect(await told).toBeLessThan(2_000)
    },
  )

  it('lists what is there now within the round of the scan, whether or not the watching said anything', async () => {
    const { root, source } = deaf()
    expect((await listed(source)).map(each => each.manifest.name)).toEqual(['notes'])
    write(root, 'board/plugin.json', manifest('board'))
    write(root, 'board/main.js', 'export const page = 2\n')
    await new Promise(resolve => setTimeout(resolve, 1_100))
    expect((await listed(source)).map(each => each.manifest.name)).toEqual(['board', 'notes'])
  })

  it('spends at most a twentieth of the time on scans nobody asked for: a round is twenty times as long as a scan took', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-dev-')))
    write(root, 'notes/plugin.json', manifest('notes'))
    write(root, 'notes/main.js', 'export const page = 1\n')
    let scans = 0
    const source = createDevDirectorySource({
      root,
      warn: () => undefined,
      watch: () => () => undefined,
      scanned: () => {
        scans += 1
        return new Promise(resolve => setTimeout(resolve, 120))
      },
    })
    opened.push({ root, source })
    await source.settled()
    const first = scans
    await new Promise(resolve => setTimeout(resolve, 2_000))
    expect(scans - first).toBeLessThanOrEqual(1)
  })
})
