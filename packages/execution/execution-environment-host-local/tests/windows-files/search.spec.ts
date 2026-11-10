// Search and listing against entries the helper cannot read: a file another process holds without
// sharing, and a name that is not valid UTF-16 (an unpaired surrogate). Neither Node nor the helper
// can spell such a name, so Windows PowerShell creates and removes it.
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { mkdir, open, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { beforeEach, expect, it } from 'vitest'
import { hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

beforeEach(context => context.skip(process.platform !== 'win32'))

/** libuv's `UV_FS_O_EXLOCK`: Node accepts it on Windows but does not export it in `fs.constants`. */
const exclusiveLock = 0x1000_0000

it('skips a file held without sharing, marks the search truncated and keeps the other hits', async () => {
  await withFiles(async ({ files, root }) => {
    const folder = join(root, 'search')
    await mkdir(join(folder, 'inner'), { recursive: true })
    for (const name of ['a.txt', 'b.txt', join('inner', 'c.txt')])
      await writeFile(join(folder, name), 'needle')
    const pattern = Buffer.from('needle')
    const search = {
      ...request(folder, await hostObjectToken(folder)),
      pattern,
      match: 'content' as const,
      recursive: true,
    }
    const held = await open(join(folder, 'b.txt'), constants.O_RDONLY | exclusiveLock)
    try {
      const found = await files.search(search)
      expect(found).toMatchObject({ kind: 'done', value: { truncated: true } })
      if (found.kind !== 'done') throw new Error('search')
      expect(found.value.hits.map(hit => hit.path)).toEqual([
        `${folder}/a.txt`,
        `${folder}/inner/c.txt`,
      ])
    } finally {
      await held.close()
    }
    const free = await files.search(search)
    expect(free).toMatchObject({ kind: 'done', value: { truncated: false } })
    if (free.kind !== 'done') throw new Error('search')
    expect(free.value.hits).toHaveLength(3)
  })
}, 30_000)

/** Runs a .NET file call on `name + U+D800 + suffix` in `directory`, which Node cannot name. */
async function unpaired(directory: string, action: 'WriteAllText' | 'Delete'): Promise<void> {
  const call = action === 'Delete' ? '[IO.File]::Delete($p)' : "[IO.File]::WriteAllText($p, 'x')"
  const script = `$p = $env:OMNE_DIRECTORY + '\\odd' + [char]0xD800 + '.txt'; ${call}`
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    { env: { ...process.env, OMNE_DIRECTORY: directory }, windowsHide: true },
  )
}

// Slow: it starts Windows PowerShell twice to create and remove the name.
it(
  'leaves out a name with an unpaired surrogate from list and search, refuses its recursive removal, and refuses such a path',
  { tags: ['slow'], timeout: 60_000 },
  async () => {
    await withFiles(async ({ files, root }) => {
      const folder = join(root, 'names')
      await mkdir(folder)
      await writeFile(join(folder, 'plain.txt'), 'x')
      const folderToken = await hostObjectToken(folder)
      await unpaired(folder, 'WriteAllText')
      try {
        expect(await readdir(folder)).toHaveLength(2)
        const listed = await files.list(request(folder, folderToken))
        expect(listed).toMatchObject({ kind: 'done' })
        if (listed.kind !== 'done') throw new Error('list')
        expect(listed.value.entries.map(entry => entry.name)).toEqual(['plain.txt'])
        const found = await files.search({
          ...request(folder, folderToken),
          pattern: Buffer.from('.txt'),
          match: 'name',
          recursive: false,
        })
        expect(found).toMatchObject({
          kind: 'done',
          value: { hits: [{ path: `${folder}/plain.txt` }] },
        })
        if (found.kind !== 'done') throw new Error('search')
        expect(found.value.hits).toHaveLength(1)
        expect(
          await files.remove({ ...request(folder, folderToken), recursive: true }),
        ).toMatchObject({ kind: 'rejected', reason: 'unsupported' })
        expect(await readdir(folder)).toHaveLength(2)
        const odd = request(join(folder, 'odd\uD800.txt'), folderToken)
        expect(await files.stat(odd)).toMatchObject({ kind: 'rejected', reason: 'unsupported' })
        expect(
          await files.write({ ...odd, mode: 'create', bytes: Buffer.from('y') }),
        ).toMatchObject({
          kind: 'rejected',
          reason: 'unsupported',
        })
        expect(await readdir(folder)).toHaveLength(2)
      } finally {
        await unpaired(folder, 'Delete')
      }
      expect(await readdir(folder)).toEqual(['plain.txt'])
    })
  },
)
