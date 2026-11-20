import { describe, expect, it } from 'vitest'
import { ProcessCrashed } from '@omne-harness/media-contract/testing'
import { T1, digestOf, failureOf, holder, ok, pdf, png, tenantText, world } from './world.ts'

const IMAGE = png(4, 3, 7)
async function* chunks(bytes: Uint8Array, size = 5): AsyncIterable<Uint8Array> {
  for (let at = 0; at < bytes.byteLength; at += size) yield bytes.subarray(at, at + size)
}

describe('a product a referrer puts', () => {
  it('is stored and held in one step, and read back the same', async () => {
    const w = world()
    const put = ok(
      await w.media.custody.put({
        tenant: T1,
        mediaType: 'image/png',
        bytes: chunks(IMAGE),
        holder: holder('call-1'),
      }),
    )
    expect(put.facts).toEqual({ kind: 'image', widthPixels: 4, heightPixels: 3 })
    expect(put.ref).toMatchObject({ storage: 'memory', bytes: '11', digest: digestOf(IMAGE) })
    expect(ok(await w.media.custody.describe({ tenant: T1, ref: put.ref })).state).toBe('held')
    expect(
      ok(await w.media.variants.open({ tenant: T1, ref: put.ref, target: null })).bytes,
    ).toEqual(IMAGE)
    w.advance(10 * 600_000)
    expect(ok(await w.media.custody.sweep({ tenant: T1, limit: 10 }))).toEqual({
      removed: 0,
      more: false,
    })
  })

  it('of the same bytes as a staged medium merges into it and holds it', async () => {
    const w = world()
    const staged = await w.staged(T1, 'up', IMAGE)
    const put = ok(
      await w.media.custody.put({
        tenant: T1,
        mediaType: 'image/png',
        bytes: chunks(IMAGE),
        holder: holder('call-1'),
      }),
    )
    expect(put.ref).toEqual(staged.ref)
    expect(await w.liveKeys()).toEqual([staged.ref.key])
    expect(ok(await w.index.readLive(staged.ref.key, tenantText(T1)))).toMatchObject({
      state: 'held',
      holderCount: 1,
    })
  })

  it('over the limit, of an unknown type or of another type than declared is refused and leaves nothing', async () => {
    const w = world()
    const put = (mediaType: string, bytes: Uint8Array) =>
      w.media.custody.put({ tenant: T1, mediaType, bytes: chunks(bytes), holder: holder('c') })
    expect(await put('application/pdf', pdf('x'.repeat(80)))).toEqual({
      failure: { kind: 'too-large', limit: 64 },
    })
    expect(failureOf(await put('video/mp4', IMAGE))).toBe('unsupported-type')
    expect(failureOf(await put('image/png', pdf('text')))).toBe('type-mismatch')
    expect(failureOf(await put('image/png', png(201, 1)))).toBe('over-budget')
    expect(await w.liveKeys()).toEqual([])
    expect(w.medium.writes.size).toBe(0)
  })
})

describe('a product put while a port does not answer', () => {
  const put = (w: ReturnType<typeof world>) =>
    w.media.custody.put({
      tenant: T1,
      mediaType: 'image/png',
      bytes: chunks(IMAGE),
      holder: holder('call-1'),
    })

  it.each(['begin', 'append', 'seal'])(
    'a store whose %s is off: unavailable, and neither bytes nor a row are left',
    async method => {
      const w = world()
      w.faults.methods.set(method, 'unavailable')
      expect(await put(w)).toEqual({ failure: { kind: 'unavailable', dependency: 'store' } })
      w.faults.methods.clear()
      expect([w.medium.sealed.size, w.medium.writes.size]).toEqual([0, 0])
      expect(ok(await w.index.listDeleting(tenantText(T1), 10))).toEqual([])
      expect(ok(await put(w)).facts).toEqual({ kind: 'image', widthPixels: 4, heightPixels: 3 })
    },
  )

  it('an index that is off or does not know: the answer says which, before and after the bytes are stored', async () => {
    const answers = {
      unavailable: { failure: { kind: 'unavailable', dependency: 'index' } },
      unknown: { failure: { kind: 'outcome-unknown' } },
    }
    for (const method of ['insertUploading', 'stageOrMerge'])
      for (const fault of ['unavailable', 'unknown'] as const) {
        const w = world()
        w.faults.methods.set(method, fault)
        expect(await put(w)).toEqual(answers[fault])
      }
  })
})

describe('hold and describe', () => {
  it('refuse a reference whose items are not those of the medium', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    for (const wrong of [
      { ...ref, digest: 'sha256:other' },
      { ...ref, bytes: '12' },
      { ...ref, mediaType: 'image/webp' },
      { ...ref, storage: 'elsewhere' },
      { ...ref, key: 'not-a-key' },
    ]) {
      expect(await w.media.custody.hold({ tenant: T1, ref: wrong, holder: holder('w') })).toEqual({
        failure: { kind: 'invalid-reference' },
      })
      expect(failureOf(await w.media.custody.describe({ tenant: T1, ref: wrong }))).toBe(
        'invalid-reference',
      )
    }
    expect(ok(await w.media.custody.describe({ tenant: T1, ref })).state).toBe('staged')
  })
})

describe('the sweep and a hold at the same moment (ME-3, ME-4)', () => {
  it('whichever comes first, a medium that was held is never deleted', async () => {
    for (const first of ['hold', 'sweep'] as const) {
      const w = world()
      const { ref } = await w.staged(T1, 'up', IMAGE)
      w.advance(601_000)
      const hold = () => w.media.custody.hold({ tenant: T1, ref, holder: holder('w') })
      const sweep = () => w.media.custody.sweep({ tenant: T1, limit: 10 })
      const [held] =
        first === 'hold'
          ? await Promise.all([hold(), sweep()])
          : (await Promise.all([sweep(), hold()])).reverse()
      const read = await w.media.variants.open({ tenant: T1, ref, target: null })
      if ('ok' in held!) expect(ok(read).bytes, first).toEqual(IMAGE)
      else {
        expect(failureOf(held!), first).toBe('invalid-reference')
        expect(failureOf(read), first).toBe('invalid-reference')
      }
    }
  })

  it('a hold that ended before the sweep keeps the medium; a sweep that ended first refuses the hold', async () => {
    const kept = world()
    const first = await kept.staged(T1, 'up', IMAGE)
    kept.advance(601_000)
    ok(await kept.media.custody.hold({ tenant: T1, ref: first.ref, holder: holder('w') }))
    expect(ok(await kept.media.custody.sweep({ tenant: T1, limit: 10 }))).toEqual({
      removed: 0,
      more: false,
    })
    expect(
      ok(await kept.media.variants.open({ tenant: T1, ref: first.ref, target: null })).bytes,
    ).toEqual(IMAGE)

    const gone = world()
    const second = await gone.staged(T1, 'up', IMAGE)
    gone.advance(601_000)
    expect(ok(await gone.media.custody.sweep({ tenant: T1, limit: 10 }))).toEqual({
      removed: 1,
      more: false,
    })
    expect(
      await gone.media.custody.hold({ tenant: T1, ref: second.ref, holder: holder('w') }),
    ).toEqual({ failure: { kind: 'invalid-reference' } })
  })

  it('a sweep takes at most its limit and says that more is left', async () => {
    const w = world()
    for (const [n, name] of ['a', 'b', 'c'].entries()) await w.staged(T1, name, png(1, 1, n))
    w.advance(601_000)
    expect(ok(await w.media.custody.sweep({ tenant: T1, limit: 2 }))).toEqual({
      removed: 2,
      more: true,
    })
    expect(ok(await w.media.custody.sweep({ tenant: T1, limit: 2 }))).toEqual({
      removed: 1,
      more: false,
    })
    expect(await w.liveKeys()).toEqual([])
  })
})

describe('a crash of the process (C8)', () => {
  it('before the commit answers: after the restart no reference names bytes that cannot be read (ME-1)', async () => {
    for (const point of [
      { method: 'seal', when: 'before' },
      { method: 'seal', when: 'after' },
      { method: 'stageOrMerge', when: 'before' },
      { method: 'stageOrMerge', when: 'after' },
    ] as const) {
      const w = world()
      await w.upload(T1, 'up', IMAGE)
      w.crash.at(point)
      await expect(
        w.media.uploads.commit({ tenant: T1, upload: 'up', digest: digestOf(IMAGE) }),
      ).rejects.toBeInstanceOf(ProcessCrashed)
      const after = w.restart()
      const status = ok(await after.uploads.status({ tenant: T1, upload: 'up' }))
      if (status.kind === 'committed')
        expect(
          ok(await after.variants.open({ tenant: T1, ref: status.committed.ref, target: null }))
            .bytes,
        ).toEqual(IMAGE)
      const committed = ok(
        await after.uploads.commit({ tenant: T1, upload: 'up', digest: digestOf(IMAGE) }),
      )
      expect(
        ok(await after.variants.open({ tenant: T1, ref: committed.ref, target: null })).bytes,
        JSON.stringify(point),
      ).toEqual(IMAGE)
      expect(await w.liveKeys()).toEqual([committed.ref.key])
    }
  })

  it('between deleting the bytes and deleting the row: after the restart the sweep goes on (ME-2, ME-7)', async () => {
    for (const point of [
      { method: 'markDeletingIfExpired', when: 'after' },
      { method: 'remove', when: 'before' },
      { method: 'remove', when: 'after' },
      { method: 'dropRow', when: 'before' },
    ] as const) {
      const w = world()
      const { ref } = await w.staged(T1, 'up', IMAGE)
      w.advance(601_000)
      w.crash.at(point)
      await expect(w.media.custody.sweep({ tenant: T1, limit: 10 })).rejects.toBeInstanceOf(
        ProcessCrashed,
      )
      const rows = ok(await w.index.listDeleting(tenantText(T1), 10)).map(row => row.key)
      for (const key of await w.liveKeys()) expect(rows, JSON.stringify(point)).toContain(key)
      const after = w.restart()
      expect(failureOf(await after.variants.open({ tenant: T1, ref, target: null }))).toBe(
        'invalid-reference',
      )
      expect(ok(await after.custody.sweep({ tenant: T1, limit: 10 }))).toEqual({
        removed: 1,
        more: false,
      })
      expect(await w.liveKeys()).toEqual([])
      expect(ok(await w.index.listDeleting(tenantText(T1), 10))).toEqual([])
    }
  })

  it('while an upload begins: the row is there before any byte, and the upload goes on after the restart', async () => {
    for (const point of [
      { method: 'insertUploading', when: 'after' },
      { method: 'begin', when: 'after' },
    ] as const) {
      const w = world()
      w.crash.at(point)
      await expect(
        w.media.uploads.begin({ tenant: T1, upload: 'up', mediaType: 'image/png', bytes: 11 }),
      ).rejects.toBeInstanceOf(ProcessCrashed)
      expect(ok(await w.index.readUpload(tenantText(T1), 'up')).state).toBe('uploading')
      w.restart()
      expect((await w.staged(T1, 'up', IMAGE)).ref.digest).toBe(digestOf(IMAGE))
    }
  })

  it('while a product is put: what the crash left has a row and is swept once its time is over', async () => {
    const w = world()
    w.crash.at({ method: 'seal', when: 'after' })
    await expect(
      w.media.custody.put({
        tenant: T1,
        mediaType: 'image/png',
        bytes: chunks(IMAGE),
        holder: holder('c'),
      }),
    ).rejects.toBeInstanceOf(ProcessCrashed)
    expect(await w.liveKeys()).toHaveLength(1)
    const after = w.restart()
    w.advance(61_000)
    expect(ok(await after.custody.sweep({ tenant: T1, limit: 10 }))).toEqual({
      removed: 1,
      more: false,
    })
    expect(await w.liveKeys()).toEqual([])
  })
})
