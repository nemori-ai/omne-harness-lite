import { describe, expect, it } from 'vitest'
import { T1, T2, digestOf, failureOf, ok, pdf, png, tenantText, world } from './world.ts'

const IMAGE = png(4, 3, 7)

describe('an upload session (T2)', () => {
  it('begin refuses a size over the limit of the medium, and says the limit', async () => {
    const w = world()
    expect(
      await w.media.uploads.begin({ tenant: T1, upload: 'big', mediaType: 'image/png', bytes: 65 }),
    ).toEqual({ failure: { kind: 'too-large', limit: 64 } })
    expect(failureOf(await w.media.uploads.status({ tenant: T1, upload: 'big' }))).toBe('not-found')
  })

  it('begin refuses a type it does not take, a bad upload name and a bad size', async () => {
    const w = world()
    const begin = (upload: string, mediaType: string, bytes: number) =>
      w.media.uploads.begin({ tenant: T1, upload, mediaType, bytes })
    expect(failureOf(await begin('a', 'video/mp4', 4))).toBe('unsupported-type')
    expect(await begin('has space', 'image/png', 4)).toEqual({
      failure: { kind: 'invalid', field: 'upload' },
    })
    for (const bytes of [0, -1, 1.5])
      expect(await begin('a', 'image/png', bytes)).toEqual({
        failure: { kind: 'invalid', field: 'bytes' },
      })
  })

  it('an append past the next sequence is refused as a gap, with the next sequence', async () => {
    const w = world()
    ok(await w.media.uploads.begin({ tenant: T1, upload: 'u', mediaType: 'image/png', bytes: 11 }))
    expect(
      await w.media.uploads.append({
        tenant: T1,
        upload: 'u',
        sequence: 1,
        part: IMAGE.subarray(8),
      }),
    ).toEqual({ failure: { kind: 'gap', nextSequence: 0 } })
  })

  it('an append larger than a part is refused, with the size of a part', async () => {
    const w = world()
    ok(await w.media.uploads.begin({ tenant: T1, upload: 'u', mediaType: 'image/png', bytes: 11 }))
    expect(
      await w.media.uploads.append({ tenant: T1, upload: 'u', sequence: 0, part: IMAGE }),
    ).toEqual({ failure: { kind: 'part-too-large', limit: 8 } })
  })

  it('after an append whose answer was lost, the status says where to go on', async () => {
    const w = world()
    await w.upload(T1, 'u', IMAGE)
    expect(ok(await w.media.uploads.status({ tenant: T1, upload: 'u' }))).toEqual({
      kind: 'uploading',
      ticket: { upload: 'u', nextSequence: 2, partBytes: 8 },
    })
  })

  it('a commit with a digest other than the one of the bytes is refused and the medium deleted', async () => {
    const w = world()
    await w.upload(T1, 'u', IMAGE)
    expect(
      failureOf(await w.media.uploads.commit({ tenant: T1, upload: 'u', digest: 'sha256:other' })),
    ).toBe('digest-mismatch')
    expect(await w.liveKeys()).toEqual([])
    expect(ok(await w.index.listDeleting(10))).toEqual([])
    expect(failureOf(await w.media.uploads.status({ tenant: T1, upload: 'u' }))).toBe('not-found')
  })

  it('a commit whose answer was lost is committed again and recalls the same reference', async () => {
    const w = world()
    const first = await w.staged(T1, 'u', IMAGE)
    const again = ok(
      await w.media.uploads.commit({ tenant: T1, upload: 'u', digest: digestOf(IMAGE) }),
    )
    expect(again).toEqual(first)
    expect(
      failureOf(await w.media.uploads.commit({ tenant: T1, upload: 'u', digest: 'sha256:other' })),
    ).toBe('digest-mismatch')
    expect(ok(await w.media.uploads.status({ tenant: T1, upload: 'u' }))).toEqual({
      kind: 'committed',
      committed: first,
    })
  })

  it('bytes that show another type than the one declared are refused and deleted', async () => {
    const w = world()
    const text = pdf('not a png')
    await w.upload(T1, 'u', text, 'image/png')
    expect(
      failureOf(await w.media.uploads.commit({ tenant: T1, upload: 'u', digest: digestOf(text) })),
    ).toBe('type-mismatch')
    expect(await w.liveKeys()).toEqual([])
  })

  it('an image over the budget of the codec is refused and deleted', async () => {
    const w = world()
    const huge = png(201, 1)
    await w.upload(T1, 'u', huge)
    expect(
      failureOf(await w.media.uploads.commit({ tenant: T1, upload: 'u', digest: digestOf(huge) })),
    ).toBe('over-budget')
    expect(await w.liveKeys()).toEqual([])
  })

  it('a file is staged with the facts of a file', async () => {
    const w = world()
    const text = pdf('a page')
    expect((await w.staged(T1, 'doc', text, 'application/pdf')).facts).toEqual({ kind: 'file' })
  })
})

describe('the same bytes twice', () => {
  it('of one tenant: the second upload gets the reference of the first, and one object stays', async () => {
    const w = world()
    const first = await w.staged(T1, 'one', IMAGE)
    const second = await w.staged(T1, 'two', IMAGE)
    expect(second).toEqual(first)
    expect(await w.liveKeys()).toEqual([first.ref.key])
    expect(ok(await w.index.listDeleting(10))).toEqual([])
    expect(ok(await w.media.uploads.status({ tenant: T1, upload: 'two' }))).toEqual({
      kind: 'committed',
      committed: first,
    })
  })

  it('of one tenant, committed at the same moment: both get one reference (ME-6)', async () => {
    const w = world()
    await w.upload(T1, 'one', IMAGE)
    await w.upload(T1, 'two', IMAGE)
    const [a, b] = await Promise.all(
      ['one', 'two'].map(upload =>
        w.media.uploads.commit({ tenant: T1, upload, digest: digestOf(IMAGE) }),
      ),
    )
    expect(ok(a!).ref).toEqual(ok(b!).ref)
    expect(await w.liveKeys()).toEqual([ok(a!).ref.key])
  })

  it('of two tenants: each gets its own object, and neither reaches the other one (C9, ME-5)', async () => {
    const w = world()
    const mine = await w.staged(T1, 'same', IMAGE)
    const theirs = await w.staged(T2, 'same', IMAGE)
    expect(theirs.ref.key).not.toBe(mine.ref.key)
    expect(theirs.ref.digest).toBe(mine.ref.digest)
    expect(await w.liveKeys()).toHaveLength(2)
    const asOther = { tenant: T2, ref: mine.ref }
    expect(await w.media.variants.open({ ...asOther, target: null })).toEqual({
      failure: { kind: 'invalid-reference' },
    })
    expect(await w.media.reads.page({ ...asOther, offset: 0, limit: 8 })).toEqual({
      failure: { kind: 'invalid-reference' },
    })
    expect(await w.media.custody.describe(asOther)).toEqual({
      failure: { kind: 'invalid-reference' },
    })
    expect(
      await w.media.custody.hold({
        ...asOther,
        holder: { owner: 's', work: 'w', position: '1', purpose: 'p' },
      }),
    ).toEqual({ failure: { kind: 'invalid-reference' } })
    expect(ok(await w.index.readLive(mine.ref.key, tenantText(T1))).holders).toEqual([])
    expect(failureOf(await w.media.uploads.status({ tenant: T2, upload: 'one' }))).toBe('not-found')
  })
})

describe('a port that does not answer', () => {
  it('an index that is unavailable makes the operation unavailable, not refused', async () => {
    const w = world()
    w.faults.index = 'unavailable'
    expect(
      await w.media.uploads.begin({ tenant: T1, upload: 'u', mediaType: 'image/png', bytes: 11 }),
    ).toEqual({ failure: { kind: 'unavailable', dependency: 'index' } })
    expect(await w.media.uploads.status({ tenant: T1, upload: 'u' })).toEqual({
      failure: { kind: 'unavailable', dependency: 'index' },
    })
  })

  it('an index that does not know whether its write took effect makes the outcome unknown', async () => {
    const w = world()
    w.faults.index = 'unknown'
    expect(
      await w.media.uploads.begin({ tenant: T1, upload: 'u', mediaType: 'image/png', bytes: 11 }),
    ).toEqual({ failure: { kind: 'outcome-unknown' } })
    w.faults.index = null
    expect(failureOf(await w.media.uploads.status({ tenant: T1, upload: 'u' }))).toBe('not-found')
  })
})
