import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localSourceFiles as files } from '../src/source-files.ts'

const LIMITS = { files: 3, fileBytes: 16, totalBytes: 24 }
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

function root() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'source-files-')))
  const write = (path: string, content: string) => {
    const full = join(base, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return { base, write }
}

describe('listing directories under a source root', () => {
  it('lists the directories, not the files or the links, and nothing where there is none', async () => {
    const r = root()
    r.write('.omne/gadgets/lamp/MAIN.md', 'lamp')
    r.write('.omne/gadgets/README.md', 'not a package')
    mkdirSync(join(r.base, 'elsewhere'))
    symlinkSync(join(r.base, 'elsewhere'), join(r.base, '.omne/gadgets/aliased'))
    expect(await files.directories(r.base, ['.omne', 'gadgets'])).toEqual(['lamp'])
    expect(await files.directories(r.base, ['.omne', 'widgets'])).toBeNull()
    expect(await files.directories(r.base, ['.omne.local', 'gadgets'])).toBeNull()
  })

  it('lists nothing through a link on the way', async () => {
    const r = root()
    r.write('real/gadgets/lamp/MAIN.md', 'lamp')
    symlinkSync(join(r.base, 'real'), join(r.base, '.omne'))
    expect(await files.directories(r.base, ['.omne', 'gadgets'])).toBeNull()
  })
})

describe('reading a package', () => {
  it('reads every regular file by its path inside the package', async () => {
    const r = root()
    r.write('.omne/gadgets/lamp/MAIN.md', 'main')
    r.write('.omne/gadgets/lamp/parts/bulb.txt', 'bulb')
    const read = await files.files(r.base, ['.omne', 'gadgets', 'lamp'], LIMITS)
    expect(read.kind).toBe('read')
    if (read.kind !== 'read') return
    expect(
      read.files.map(file => [file.path, text(file.bytes)]).sort(([a], [b]) => (a! < b! ? -1 : 1)),
    ).toEqual([
      ['MAIN.md', 'main'],
      ['parts/bulb.txt', 'bulb'],
    ])
  })

  it('answers linked for a link inside or on the way, and missing where nothing is', async () => {
    const r = root()
    r.write('.omne/gadgets/lamp/MAIN.md', 'main')
    symlinkSync(
      join(r.base, '.omne/gadgets/lamp/MAIN.md'),
      join(r.base, '.omne/gadgets/lamp/alias'),
    )
    expect(await files.files(r.base, ['.omne', 'gadgets', 'lamp'], LIMITS)).toEqual({
      kind: 'linked',
    })
    r.write('kept/MAIN.md', 'main')
    symlinkSync(join(r.base, 'kept'), join(r.base, '.omne/gadgets/via'))
    expect(await files.files(r.base, ['.omne', 'gadgets', 'via'], LIMITS)).toEqual({
      kind: 'linked',
    })
    expect(await files.files(r.base, ['.omne', 'gadgets', 'none'], LIMITS)).toEqual({
      kind: 'missing',
    })
  })

  it('answers over the limit for too many files, a file too large, or too many bytes', async () => {
    const r = root()
    const read = (name: string) => files.files(r.base, ['.omne', 'gadgets', name], LIMITS)
    for (const n of [1, 2, 3, 4]) r.write(`.omne/gadgets/many/f${String(n)}`, 'x')
    r.write('.omne/gadgets/large/f', 'x'.repeat(17))
    for (const n of [1, 2]) r.write(`.omne/gadgets/heavy/f${String(n)}`, 'x'.repeat(13))
    for (const name of ['many', 'large', 'heavy'])
      expect(await read(name)).toEqual({ kind: 'over-limit' })
  })

  it('answers irregular for a socket inside', async () => {
    const r = root()
    r.write('.omne/gadgets/lamp/MAIN.md', 'main')
    const server = createServer()
    await new Promise<void>(done => server.listen(join(r.base, '.omne/gadgets/lamp/sock'), done))
    try {
      expect(await files.files(r.base, ['.omne', 'gadgets', 'lamp'], LIMITS)).toEqual({
        kind: 'irregular',
      })
    } finally {
      await new Promise(done => server.close(done))
    }
  })
})

describe('reading one file', () => {
  it('reads a regular file within its limit, and refuses a link, a directory or a larger file', async () => {
    const r = root()
    r.write('.omne/gadgets/lamp/MAIN.md', 'main')
    symlinkSync(
      join(r.base, '.omne/gadgets/lamp/MAIN.md'),
      join(r.base, '.omne/gadgets/lamp/alias'),
    )
    const at = (name: string) => ['.omne', 'gadgets', 'lamp', name]
    const read = await files.file(r.base, at('MAIN.md'), 4)
    expect(read.kind === 'bytes' && text(read.bytes)).toBe('main')
    expect(await files.file(r.base, at('MAIN.md'), 3)).toEqual({ kind: 'over-limit' })
    expect(await files.file(r.base, at('alias'), 4)).toEqual({ kind: 'linked' })
    expect(await files.file(r.base, ['.omne', 'gadgets', 'lamp'], 4)).toEqual({ kind: 'irregular' })
    expect(await files.file(r.base, at('none'), 4)).toEqual({ kind: 'missing' })
  })
})

describe('the edges of what is read', () => {
  it('lists nothing through a file on the way, and reads a package right at its limits', async () => {
    const r = root()
    r.write('.omne', 'a file where the root would be')
    expect(await files.directories(r.base, ['.omne', 'gadgets'])).toBeNull()
    expect(await files.files(r.base, ['.omne', 'gadgets', 'lamp'], LIMITS)).toEqual({
      kind: 'missing',
    })
    const s = root()
    // Three files, the largest one at the file limit, all of them at the total limit.
    s.write('.omne/gadgets/full/a', 'x'.repeat(16))
    s.write('.omne/gadgets/full/b', 'x'.repeat(4))
    s.write('.omne/gadgets/full/c', 'x'.repeat(4))
    const read = await files.files(s.base, ['.omne', 'gadgets', 'full'], LIMITS)
    expect(read.kind).toBe('read')
  })

  it.skipIf(process.getuid?.() === 0)(
    'answers unreadable for a package it may not read, and a listing it may not read fails',
    async () => {
      const r = root()
      r.write('.omne/gadgets/lamp/MAIN.md', 'main')
      const locked = join(r.base, '.omne/gadgets/lamp')
      chmodSync(locked, 0o000)
      try {
        expect(await files.files(r.base, ['.omne', 'gadgets', 'lamp'], LIMITS)).toEqual({
          kind: 'unreadable',
        })
        chmodSync(join(r.base, '.omne/gadgets'), 0o000)
        await expect(files.directories(r.base, ['.omne', 'gadgets'])).rejects.toThrow()
      } finally {
        chmodSync(join(r.base, '.omne/gadgets'), 0o755)
        chmodSync(locked, 0o755)
      }
    },
  )
})
