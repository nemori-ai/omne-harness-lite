import { describe, expect, it } from 'vitest'
import type { ContentReference } from '@omne-harness/media-contract'
import { T1, digestOf, failureOf, holder, ok, png, tenantText, world, type World } from './world.ts'

// T1: every operation in every state of one medium. The upload is `up`; its bytes are IMAGE.
const IMAGE = png(4, 3, 7)
const DIGEST = digestOf(IMAGE)
const begin = (w: World) =>
  w.media.uploads.begin({
    tenant: T1,
    upload: 'up',
    mediaType: 'image/png',
    bytes: IMAGE.byteLength,
  })
const append = (w: World, sequence: number, part: Uint8Array) =>
  w.media.uploads.append({ tenant: T1, upload: 'up', sequence, part })
const commit = (w: World) => w.media.uploads.commit({ tenant: T1, upload: 'up', digest: DIGEST })
const abandon = (w: World) => w.media.uploads.abandon({ tenant: T1, upload: 'up' })
const hold = (w: World, ref: ContentReference, work = 'w1') =>
  w.media.custody.hold({ tenant: T1, ref, holder: holder(work) })
const read = (w: World, ref: ContentReference) =>
  w.media.variants.open({ tenant: T1, ref, target: null })
const sweep = (w: World) => w.media.custody.sweep({ limit: 10 })
/** The reference the staged medium of these tests would have, for the states that have none. */
const wouldBe = (key = '0'.repeat(32)): ContentReference => ({
  storage: 'memory',
  key,
  mediaType: 'image/png',
  bytes: String(IMAGE.byteLength),
  digest: DIGEST,
})

describe('no medium', () => {
  it('begin writes the row and answers the first sequence', async () => {
    const w = world()
    expect(ok(await begin(w))).toEqual({
      kind: 'uploading',
      ticket: { upload: 'up', nextSequence: 0, partBytes: 8 },
    })
    expect(ok(await w.index.readUpload(tenantText(T1), 'up')).state).toBe('uploading')
    expect(w.medium.writes.size).toBe(1)
  })
  it('append is refused: there is no such upload', async () => {
    expect(failureOf(await append(world(), 0, IMAGE.subarray(0, 8)))).toBe('not-found')
  })
  it('commit is refused: there is no such upload', async () => {
    expect(failureOf(await commit(world()))).toBe('not-found')
  })
  it('abandon answers as done', async () => {
    expect(await abandon(world())).toEqual({ ok: null })
  })
  it('hold is refused', async () => {
    expect(failureOf(await hold(world(), wouldBe()))).toBe('invalid-reference')
  })
  it('a read finds no material', async () => {
    expect(failureOf(await read(world(), wouldBe()))).toBe('invalid-reference')
  })
  it('the sweep has nothing to take', async () => {
    expect(ok(await sweep(world()))).toEqual({ removed: 0, more: false })
  })
})

describe('an uploading medium', () => {
  const uploading = async () => {
    const w = world()
    ok(await begin(w))
    ok(await append(w, 0, IMAGE.subarray(0, 8)))
    return w
  }
  it('begin with the same upload answers the upload as it stands', async () => {
    const w = await uploading()
    expect(ok(await begin(w))).toEqual({
      kind: 'uploading',
      ticket: { upload: 'up', nextSequence: 1, partBytes: 8 },
    })
    expect(w.medium.writes.size).toBe(1)
  })
  it('append writes the next part, recalls the same part and refuses another part at its place', async () => {
    const w = await uploading()
    expect(ok(await append(w, 0, IMAGE.subarray(0, 8)))).toEqual({ nextSequence: 1 })
    expect(failureOf(await append(w, 0, png(9, 9).subarray(0, 8).fill(1)))).toBe('conflict')
    expect(ok(await append(w, 1, IMAGE.subarray(8)))).toEqual({ nextSequence: 2 })
    expect(failureOf(await append(w, 2, new Uint8Array([1])))).toBe('beyond-declared')
  })
  it('commit stages the medium once its bytes are whole, and hands its reference out', async () => {
    const w = await uploading()
    expect(await commit(w)).toEqual({ failure: { kind: 'incomplete', nextSequence: 1 } })
    ok(await append(w, 1, IMAGE.subarray(8)))
    expect(ok(await commit(w))).toEqual({
      ref: wouldBe(),
      facts: { kind: 'image', widthPixels: 4, heightPixels: 3 },
    })
    expect(await w.liveKeys()).toEqual(['0'.repeat(32)])
  })
  it('abandon deletes it: bytes and row are gone', async () => {
    const w = await uploading()
    expect(await abandon(w)).toEqual({ ok: null })
    expect(w.medium.writes.size).toBe(0)
    expect(failureOf(await w.media.uploads.status({ tenant: T1, upload: 'up' }))).toBe('not-found')
    expect(ok(await w.index.listDeleting(10))).toEqual([])
  })
  it('hold is refused: it is not committed', async () => {
    expect(failureOf(await hold(await uploading(), wouldBe()))).toBe('invalid-reference')
  })
  it('a read finds no material', async () => {
    expect(failureOf(await read(await uploading(), wouldBe()))).toBe('invalid-reference')
  })
  it('the sweep leaves it until its upload time is over, then deletes it', async () => {
    const w = await uploading()
    w.advance(59_000)
    expect(ok(await sweep(w))).toEqual({ removed: 0, more: false })
    w.advance(2_000)
    expect(ok(await sweep(w))).toEqual({ removed: 1, more: false })
    expect(w.medium.writes.size).toBe(0)
    expect(failureOf(await append(w, 1, IMAGE.subarray(8)))).toBe('not-found')
  })
})

describe('a staged medium', () => {
  const staged = async () => {
    const w = world()
    return { w, ref: (await w.staged(T1, 'up', IMAGE)).ref }
  }
  it('begin with the same upload answers the committed reference', async () => {
    const { w, ref } = await staged()
    expect(ok(await begin(w))).toMatchObject({ kind: 'committed', committed: { ref } })
  })
  it('append is refused: it is committed', async () => {
    const { w } = await staged()
    expect(failureOf(await append(w, 2, new Uint8Array([1])))).toBe('committed')
  })
  it('commit again recalls the same reference', async () => {
    const { w, ref } = await staged()
    expect(ok(await commit(w)).ref).toEqual(ref)
    expect(await w.liveKeys()).toHaveLength(1)
  })
  it('abandon is refused: it is committed', async () => {
    const { w, ref } = await staged()
    expect(failureOf(await abandon(w))).toBe('committed')
    expect(ok(await read(w, ref)).bytes).toEqual(IMAGE)
  })
  it('hold takes it, with its facts', async () => {
    const { w, ref } = await staged()
    expect(ok(await hold(w, ref))).toEqual({
      facts: { kind: 'image', widthPixels: 4, heightPixels: 3 },
    })
    expect(ok(await w.media.custody.describe({ tenant: T1, ref })).state).toBe('held')
  })
  it('a read hands its bytes out', async () => {
    const { w, ref } = await staged()
    expect(ok(await read(w, ref))).toEqual({
      mediaType: 'image/png',
      bytes: IMAGE,
      facts: { kind: 'image', widthPixels: 4, heightPixels: 3 },
    })
  })
  it('the sweep leaves it until its staging time is over, then deletes bytes and row', async () => {
    const { w, ref } = await staged()
    w.advance(599_000)
    expect(ok(await sweep(w))).toEqual({ removed: 0, more: false })
    w.advance(2_000)
    expect(ok(await sweep(w))).toEqual({ removed: 1, more: false })
    expect(await w.liveKeys()).toEqual([])
    expect(failureOf(await read(w, ref))).toBe('invalid-reference')
  })
})

describe('a held medium', () => {
  const held = async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    ok(await hold(w, ref))
    return { w, ref }
  }
  it('begin with the same upload answers the committed reference', async () => {
    const { w, ref } = await held()
    expect(ok(await begin(w))).toMatchObject({ kind: 'committed', committed: { ref } })
  })
  it('append is refused: it is committed', async () => {
    expect(failureOf(await append((await held()).w, 0, IMAGE.subarray(0, 8)))).toBe('committed')
  })
  it('commit again recalls the same reference', async () => {
    const { w, ref } = await held()
    expect(ok(await commit(w)).ref).toEqual(ref)
  })
  it('abandon is refused: it is committed', async () => {
    expect(failureOf(await abandon((await held()).w))).toBe('committed')
  })
  it('hold recalls the same holder and adds another', async () => {
    const { w, ref } = await held()
    ok(await hold(w, ref))
    ok(await hold(w, ref, 'w2'))
    expect(ok(await w.index.readLive(ref.key, tenantText(T1))).holders).toEqual([
      holder('w1'),
      holder('w2'),
    ])
  })
  it('a read hands its bytes out', async () => {
    const { w, ref } = await held()
    expect(ok(await read(w, ref)).bytes).toEqual(IMAGE)
  })
  it('the sweep never takes it, however late', async () => {
    const { w, ref } = await held()
    w.advance(10 * 600_000)
    expect(ok(await sweep(w))).toEqual({ removed: 0, more: false })
    expect(ok(await read(w, ref)).bytes).toEqual(IMAGE)
  })
})

describe('a medium being deleted', () => {
  /** Staged, expired and marked, with the removal of its bytes switched off. */
  const deleting = async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    w.advance(601_000)
    w.faults.remove = true
    expect(ok(await sweep(w))).toEqual({ removed: 0, more: false })
    return { w, ref }
  }
  it('begin with the same upload starts another medium', async () => {
    const { w } = await deleting()
    expect(ok(await begin(w))).toEqual({
      kind: 'uploading',
      ticket: { upload: 'up', nextSequence: 0, partBytes: 8 },
    })
  })
  it('append is refused: there is no such upload', async () => {
    expect(failureOf(await append((await deleting()).w, 0, IMAGE.subarray(0, 8)))).toBe('not-found')
  })
  it('commit is refused: there is no such upload', async () => {
    expect(failureOf(await commit((await deleting()).w))).toBe('not-found')
  })
  it('abandon answers as done', async () => {
    expect(await abandon((await deleting()).w)).toEqual({ ok: null })
  })
  it('hold is refused', async () => {
    const { w, ref } = await deleting()
    expect(failureOf(await hold(w, ref))).toBe('invalid-reference')
  })
  it('a read finds no material, though its bytes are still there', async () => {
    const { w, ref } = await deleting()
    expect(await w.liveKeys()).toEqual([ref.key])
    expect(failureOf(await read(w, ref))).toBe('invalid-reference')
  })
  it('the sweep goes on deleting: bytes first, then the row', async () => {
    const { w } = await deleting()
    w.faults.remove = false
    expect(ok(await sweep(w))).toEqual({ removed: 1, more: false })
    expect(await w.liveKeys()).toEqual([])
    expect(ok(await w.index.listDeleting(10))).toEqual([])
  })
})
