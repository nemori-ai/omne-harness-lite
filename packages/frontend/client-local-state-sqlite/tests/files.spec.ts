import { openStorage } from '@omne-harness-lite/storage-sql'
import { chmod, mkdir, open, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ReadTx } from '@omne-harness-lite/storage'
import { SqlStorage } from '@omne-harness-lite/storage-sql'
import { describe, expect, it, vi } from 'vitest'
import { openClientLocalState } from '../src/open.ts'
import { initialize } from '../src/store.ts'
import { fixtures, logged, read } from './support.ts'

describe('private file boundary', () => {
  const f = fixtures()
  it('uses private directory, main database and WAL/SHM modes on the real filesystem', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    await s.compareAndReplace((await read(s)).token, logged, 'save')
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
    for (const suffix of ['', '-wal', '-shm']) {
      const metadata = await stat(join(directory, `client.sqlite${suffix}`))
      expect(metadata.mode & 0o777).toBe(0o600)
      expect(metadata.uid).toBe(process.getuid?.())
    }
  })

  it('rejects broad directory and file permissions instead of repairing them', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    await s.close()
    await chmod(directory, 0o755)
    await expect(
      openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'unsafe-path',
    })
    expect((await stat(directory)).mode & 0o777).toBe(0o755)
    await chmod(directory, 0o700)
    await chmod(join(directory, 'client.sqlite'), 0o644)
    await expect(
      openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'unsafe-path',
    })
    expect((await stat(join(directory, 'client.sqlite'))).mode & 0o777).toBe(0o644)
  })

  it('rejects symlink directories, symlink state and a symlink ancestor', async () => {
    const actual = await f.directory(),
      s = await f.open(actual)
    await s.close()
    const link = await f.directory()
    await symlink(actual, link)
    await expect(
      openClientLocalState(
        { directory: link },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'unsafe-path',
    })
    await expect(
      openClientLocalState(
        { directory: join(link, 'child') },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'unsafe-path',
    })
    const directory = await f.directory()
    await mkdir(directory, { mode: 0o700 })
    await symlink(join(actual, 'client.sqlite'), join(directory, 'client.sqlite'))
    await expect(
      openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'unsafe-path',
    })
  })

  it('rejects unsafe WAL sidefiles before SQLite opens them', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    await s.close()
    await writeFile(join(directory, 'client.sqlite-wal'), 'do-not-open', { mode: 0o644 })
    await expect(
      openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'unsafe-path',
    })
    expect(await readFile(join(directory, 'client.sqlite-wal'), 'utf8')).toBe('do-not-open')
  })

  it('does not initialize a corrupt database as empty', async () => {
    const directory = await f.directory()
    await mkdir(directory, { mode: 0o700 })
    const file = join(directory, 'client.sqlite')
    await writeFile(file, 'this is not sqlite', { mode: 0o600 })
    await expect(
      openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'invalid-record',
    })
    expect(await readFile(file, 'utf8')).toBe('this is not sqlite')
  })

  // 归慢层：真实等待：空库文件被当作别的进程正在初始化，打开方按真实时钟等满打开时限才判损坏（SQLite 文件）。
  it(
    'does not bootstrap an existing empty file left by a failed initializer',
    { tags: ['slow'] },
    async () => {
      const directory = await f.directory()
      await mkdir(directory, { mode: 0o700 })
      await writeFile(join(directory, 'client.sqlite'), '', { mode: 0o600 })
      await expect(
        openClientLocalState(
          { directory },
          {
            storage: {
              open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }),
            },
          },
        ),
      ).rejects.toMatchObject({
        reason: 'invalid-record',
      })
      const db = new DatabaseSync(join(directory, 'client.sqlite'), { readOnly: true })
      try {
        expect(
          db.prepare("SELECT name FROM sqlite_master WHERE name='client_local_state'").get(),
        ).toBeUndefined()
      } finally {
        db.close()
      }
    },
  )

  it('does not replace an unknown table layout or a future format', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    await s.close()
    const db = new DatabaseSync(join(directory, 'client.sqlite'))
    try {
      db.exec('UPDATE client_local_state SET format_version = 99')
    } finally {
      db.close()
    }
    await expect(
      openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'unsupported-format',
    })
    const unknown = new DatabaseSync(join(directory, 'client.sqlite'))
    try {
      unknown.exec('DROP TABLE client_local_state; CREATE TABLE not_ours (x TEXT)')
    } finally {
      unknown.close()
    }
    await expect(
      openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      ),
    ).rejects.toMatchObject({
      reason: 'invalid-record',
    })
  })

  it('each opener performs parent and private directory sync before becoming ready', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    const fd = await open(directory, 'r')
    const spy = vi.spyOn(Object.getPrototypeOf(fd), 'sync')
    try {
      await f.open(directory)
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
      await fd.close()
      await s.close()
    }
  })

  it('does not provide a state instance after opening directory confirmation fails', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    const original = await read(s)
    const fd = await open(directory, 'r')
    const spy = vi
      .spyOn(Object.getPrototypeOf(fd), 'sync')
      .mockRejectedValueOnce(Object.assign(new Error('directory sync'), { code: 'EIO' }))
    try {
      await expect(
        openClientLocalState(
          { directory },
          {
            storage: {
              open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }),
            },
          },
        ),
      ).rejects.toMatchObject({
        reason: 'unavailable',
      })
    } finally {
      spy.mockRestore()
      await fd.close()
    }
    expect(await read(s)).toMatchObject({ storeId: original.storeId, revision: 0 })
    expect((await f.open(directory)).read).toBeTypeOf('function')
  })

  it('waits for initialization that commits immediately after its empty-catalog snapshot', async () => {
    const directory = await f.directory()
    await mkdir(directory, { mode: 0o700 })
    // The test initializer owns this exclusive creation; the product opener is a competitor.
    await writeFile(join(directory, 'client.sqlite'), '', { mode: 0o600, flag: 'wx' })
    const original = SqlStorage.prototype.read
    let initialized = false
    const spy = vi.spyOn(SqlStorage.prototype, 'read').mockImplementation(async function <T>(
      this: SqlStorage,
      fn: (tx: ReadTx) => Promise<T>,
    ): Promise<T> {
      const observed = (await original.call(this, fn)) as T
      if (!initialized) {
        initialized = true
        await initialize(this)
      }
      return observed
    })
    try {
      const state = await f.open(directory)
      expect(await read(state)).toMatchObject({ revision: 0, value: null })
      expect(initialized).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})
