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

const principal = {} as Principal
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
    const stop = source.subscribe(() => {
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
    source.subscribe(() => (calls += 1))
    write(root, 'notes/main.js', 'export const page = 1\n')
    await new Promise(resolve => setTimeout(resolve, 600))
    await source.settled()
    expect(calls).toBe(0)
  })

  it('stops watching when closed', async () => {
    const { root, source } = directory()
    await source.settled()
    let calls = 0
    source.subscribe(() => (calls += 1))
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
    source.subscribe(() => (calls += 1))()
    source.close()
    expect(calls).toBe(0)
  })
})
