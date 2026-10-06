import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { createImmutableFiles, publicationIo, type PublicationIo } from '../src/immutable-files.ts'

const name = `${'a'.repeat(64)}.bytes`
async function fixture(io: PublicationIo = publicationIo) {
  const parent = await mkdtemp(join(tmpdir(), 'omne-result-files-')),
    directory = join(parent, 'results')
  const files = await createImmutableFiles(directory, io)
  return {
    files,
    directory,
    parent,
    async close() {
      await files.close()
      await rm(parent, { recursive: true, force: true })
    },
  }
}

test('publishes actual bytes, recognizes duplicates and refuses a different value under the same identity', async () => {
  const f = await fixture()
  try {
    expect(await f.files.publish(name, Buffer.from('original'))).toBe('published')
    expect(await f.files.publish(name, Buffer.from('original'))).toBe('duplicate')
    expect(await f.files.publish(name, Buffer.from('changed'))).toBe('conflict')
    expect(Buffer.from((await f.files.read(name)) as Uint8Array).toString()).toBe('original')
    expect(await readFile(join(f.directory, name), 'utf8')).toBe('original')
    expect(await readdir(f.directory)).toEqual([name])
  } finally {
    await f.close()
  }
})

test('concurrent equal publishers have one immutable file, and unequal publishers cannot both win', async () => {
  const f = await fixture()
  try {
    expect(
      (
        await Promise.all([
          f.files.publish(name, Buffer.from('original')),
          f.files.publish(name, Buffer.from('original')),
        ])
      ).sort(),
    ).toEqual(['duplicate', 'published'])
    const other = `${'b'.repeat(64)}.json`
    const competing = await Promise.all([
      f.files.publish(other, Buffer.from('first')),
      f.files.publish(other, Buffer.from('second')),
    ])
    expect(competing.sort()).toEqual(['conflict', 'published'])
    expect(['first', 'second']).toContain(await readFile(join(f.directory, other), 'utf8'))
  } finally {
    await f.close()
  }
})

test('caller mutation after publication admission cannot change its captured bytes', async () => {
  const f = await fixture(),
    supplied = Buffer.from('original')
  try {
    const pending = f.files.publish(name, supplied)
    supplied.fill(0)
    expect(await pending).toBe('published')
    expect(await readFile(join(f.directory, name), 'utf8')).toBe('original')
  } finally {
    await f.close()
  }
})

test('lost hard-link acknowledgement returns unavailable and reentry confirms the same original file', async () => {
  let lost = false
  const link = vi.fn<PublicationIo['link']>(async (...args) => {
    await publicationIo.link(...args)
    if (!lost) {
      lost = true
      throw new Error('controlled lost link receipt')
    }
  })
  const f = await fixture({ ...publicationIo, link })
  try {
    expect(await f.files.publish(name, Buffer.from('original'))).toBe('unavailable')
    expect(await f.files.publish(name, Buffer.from('original'))).toBe('duplicate')
    expect(link).toHaveBeenCalledTimes(1)
    expect(await readFile(join(f.directory, name), 'utf8')).toBe('original')
    expect(await readdir(f.directory)).toEqual([name])
  } finally {
    await f.close()
  }
})

test('closing gates new IO and waits for an admitted publication before releasing its real handles', async () => {
  let continueLink!: () => void, enteredLink!: () => void
  const continuation = new Promise<void>(resolve => {
      continueLink = resolve
    }),
    entered = new Promise<void>(resolve => {
      enteredLink = resolve
    })
  const f = await fixture({
    ...publicationIo,
    link: async (...args) => {
      enteredLink()
      await continuation
      return publicationIo.link(...args)
    },
  })
  try {
    const publishing = f.files.publish(name, Buffer.from('original'))
    await entered
    let closed = false
    const closing = f.files.close().then(() => {
      closed = true
    })
    expect(await f.files.read(name)).toBe('unavailable')
    expect(await f.files.publish(`${'b'.repeat(64)}.bytes`, Buffer.from('new'))).toBe('unavailable')
    expect(closed).toBe(false)
    continueLink()
    expect(await publishing).toBe('published')
    await closing
    expect(closed).toBe(true)
    expect(await readFile(join(f.directory, name), 'utf8')).toBe('original')
  } finally {
    continueLink()
    await f.close()
  }
})

test('missing file, path traversal, symlink file and replaced root never become readable result bytes', async () => {
  const f = await fixture()
  try {
    expect(await f.files.read(name)).toBe('missing')
    expect(await f.files.publish('../outside', Buffer.from('forbidden'))).toBe('unavailable')
    const outside = join(f.parent, 'outside')
    await writeFile(outside, 'outside-secret')
    await symlink(outside, join(f.directory, name))
    expect(await f.files.read(name)).toBe('unavailable')
    expect(await f.files.publish(name, Buffer.from('replacement'))).toBe('unavailable')
    expect(await readFile(outside, 'utf8')).toBe('outside-secret')
    await rename(f.directory, join(f.parent, 'old-results'))
    await mkdir(f.directory)
    await writeFile(join(f.directory, name), 'replaced-secret')
    expect(await f.files.read(name)).toBe('unavailable')
  } finally {
    await f.close()
  }
})

test('a fresh file owner recognizes a durable file without rewriting it or allocating a second identity', async () => {
  const f = await fixture()
  try {
    await f.files.publish(name, Buffer.from('original'))
    await f.files.close()
    const replacement = await createImmutableFiles(f.directory)
    try {
      expect(await replacement.publish(name, Buffer.from('original'))).toBe('duplicate')
      expect(await readdir(f.directory)).toEqual([name])
    } finally {
      await replacement.close()
    }
  } finally {
    await f.close()
  }
})

test('failed temporary cleanup retains responsibility and close can be retried after the IO fault clears', async () => {
  let denied = true
  const f = await fixture({
    ...publicationIo,
    unlink: async path => {
      if (denied) throw new Error('controlled temporary cleanup failure')
      await publicationIo.unlink(path)
    },
  })
  try {
    expect(await f.files.publish(name, Buffer.from('durable'))).toBe('published')
    expect(await readdir(f.directory)).toHaveLength(2)
    await expect(f.files.close()).rejects.toThrow('retain cleanup responsibility')
    expect(await f.files.publish(name, Buffer.from('durable'))).toBe('unavailable')
    denied = false
    await f.files.close()
    expect(await readdir(f.directory)).toEqual([name])
  } finally {
    denied = false
    await f.close()
  }
})
