import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { T1, digestOf, ok, png, tenantText, world, type World } from './world.ts'

const IMAGE = png(4, 3, 7)
const OTHER = png(4, 3, 9)
const upload = (w: World, name: string, bytes: Uint8Array) => ({
  part: (sequence: number, from = bytes) =>
    w.media.uploads.append({
      tenant: T1,
      upload: name,
      sequence,
      part: from.subarray(sequence * 8, sequence * 8 + 8),
    }),
  commit: (digest = digestOf(bytes)) =>
    w.media.uploads.commit({ tenant: T1, upload: name, digest }),
})
async function begun(name = 'u', bytes = IMAGE) {
  const w = world()
  ok(
    await w.media.uploads.begin({
      tenant: T1,
      upload: name,
      mediaType: 'image/png',
      bytes: bytes.byteLength,
    }),
  )
  return { w, ...upload(w, name, bytes) }
}

describe('two requests for one upload at the same moment', () => {
  it('the same part twice: the one that comes second is answered as taken', async () => {
    const { w, part } = await begun()
    w.faults.hooks.set('advance', async (real, ...args) => {
      await real(...args)
      return fail({ kind: 'stale' })
    })
    expect(await part(0)).toEqual({ ok: { nextSequence: 1 } })
  })

  it('the same part twice while the index cannot be read again: unavailable', async () => {
    const { w, part } = await begun()
    w.faults.hooks.set('advance', async (real, ...args) => {
      await real(...args)
      w.faults.methods.set('readUpload', 'unavailable')
      return fail({ kind: 'stale' })
    })
    expect(await part(0)).toEqual({ failure: { kind: 'unavailable', dependency: 'index' } })
  })

  it('other bytes for the part another request took: a conflict, and the part that was taken stays', async () => {
    const { w, part } = await begun()
    w.faults.hooks.set('advance', async (real, input: never) => {
      await real({ ...(input as object), digest: digestOf(IMAGE.subarray(0, 8)) } as never)
      return fail({ kind: 'stale' })
    })
    expect(await part(0, new Uint8Array(8).fill(1))).toEqual({ failure: { kind: 'conflict' } })
    w.faults.hooks.clear()
    expect(ok(await w.media.uploads.status({ tenant: T1, upload: 'u' }))).toMatchObject({
      kind: 'uploading',
      ticket: { nextSequence: 1 },
    })
  })

  it('two commits: the one that loses the write of the index answers the reference of the one that won', async () => {
    const { w, part, commit } = await begun()
    ok(await part(0))
    ok(await part(1))
    w.faults.hooks.set('stageOrMerge', async (real, ...args) => {
      await real(...args)
      return fail({ kind: 'not-uploading' })
    })
    const answer = ok(await commit())
    expect(answer.ref.digest).toBe(digestOf(IMAGE))
    expect(answer.facts).toEqual({ kind: 'image', widthPixels: 4, heightPixels: 3 })
  })

  it('a commit against an abandon that won: not found', async () => {
    const { w, part, commit } = await begun()
    ok(await part(0))
    ok(await part(1))
    w.faults.hooks.set('stageOrMerge', async () => {
      const row = ok(await w.index.readUpload(tenantText(T1), 'u'))
      ok(await w.index.markDeleting(tenantText(T1), row.key))
      return fail({ kind: 'not-uploading' })
    })
    expect(await commit()).toEqual({ failure: { kind: 'not-found' } })
  })

  it('a commit with a wrong digest does not delete what a right commit staged meanwhile', async () => {
    const { w, part, commit } = await begun()
    ok(await part(0))
    ok(await part(1))
    let staged: Awaited<ReturnType<typeof commit>> | undefined
    w.faults.hooks.set('markDeleting', async (real, ...args) => {
      w.faults.hooks.clear()
      staged = await commit()
      return real(...args)
    })
    expect(await commit(digestOf(OTHER))).toEqual({ failure: { kind: 'digest-mismatch' } })
    const { ref } = ok(staged ?? fail({ kind: 'the right commit did not run' }))
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toMatchObject({
      ok: { bytes: IMAGE },
    })
  })
})

describe('a store that answers a failure after it did the work', () => {
  it('a seal that may have happened is not taken as one that did: the commit is unavailable until the seal answers', async () => {
    const { w, part, commit } = await begun()
    ok(await part(0))
    ok(await part(1))
    w.faults.hooks.set('seal', async (real, ...args) => {
      await real(...args)
      return fail({ kind: 'unknown', diagnostic: 'the answer was lost' })
    })
    expect(await commit()).toEqual({ failure: { kind: 'unavailable', dependency: 'store' } })
    w.faults.hooks.clear()
    expect(ok(await commit()).ref.digest).toBe(digestOf(IMAGE))
  })

  it('a part of a product whose append failed is not sealed into it', async () => {
    const w = world()
    w.faults.hooks.set('append', async (real, ...args) => {
      await real(...args)
      return fail({ kind: 'unavailable', diagnostic: 'the answer was lost' })
    })
    async function* bytes() {
      yield IMAGE
    }
    const put = await w.media.custody.put({
      tenant: T1,
      mediaType: 'image/png',
      bytes: bytes(),
      holder: { owner: 'tool', work: 'call-1', position: '0', purpose: 'product' },
    })
    expect(put).toEqual({ failure: { kind: 'unavailable', dependency: 'store' } })
    expect([w.medium.sealed.size, w.medium.writes.size]).toEqual([0, 0])
  })
})

describe('a store that left the deployment', () => {
  it('uploads, commits and reads answer unavailable; hold and describe still answer; all goes on when it is back', async () => {
    const { w, part, commit } = await begun()
    const storeOff = { failure: { kind: 'unavailable', dependency: 'store' } }
    ok(await part(0))
    w.withdrawStore()
    expect(await part(1)).toEqual(storeOff)
    w.returnStore()
    ok(await part(1))
    w.withdrawStore()
    expect(await commit()).toEqual(storeOff)
    w.returnStore()
    const { ref } = ok(await commit())
    w.withdrawStore()
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toEqual(storeOff)
    expect(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: null })).toEqual(storeOff)
    expect(await w.media.custody.describe({ tenant: T1, ref })).toEqual({
      ok: { state: 'staged', facts: { kind: 'image', widthPixels: 4, heightPixels: 3 } },
    })
    const holder = { owner: 'session', work: 's1', position: '1', purpose: 'input' }
    expect(await w.media.custody.hold({ tenant: T1, ref, holder })).toEqual({
      ok: { facts: { kind: 'image', widthPixels: 4, heightPixels: 3 } },
    })
    expect(await w.media.custody.describe({ tenant: T1, ref })).toMatchObject({
      ok: { state: 'held' },
    })
    w.returnStore()
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toMatchObject({
      ok: { bytes: IMAGE },
    })
  })

  it('a product put while the store is away: unavailable, and it is stored once the store is back', async () => {
    const w = world()
    const put = () =>
      w.media.custody.put({
        tenant: T1,
        mediaType: 'image/png',
        bytes: (async function* () {
          yield IMAGE
        })(),
        holder: { owner: 'tool', work: 'call-1', position: '0', purpose: 'product' },
      })
    w.withdrawStore()
    expect(await put()).toEqual({ failure: { kind: 'unavailable', dependency: 'store' } })
    w.returnStore()
    expect(ok(await put()).ref.digest).toBe(digestOf(IMAGE))
  })

  it('the sweep deletes nothing while the store is away, and goes on when it is back', async () => {
    const { w } = await begun()
    w.advance(61_000)
    w.withdrawStore()
    expect(await w.media.custody.sweep({ tenant: T1, limit: 10 })).toEqual({
      ok: { removed: 0, more: false },
    })
    expect(ok(await w.index.listDeleting(tenantText(T1), 10))).toHaveLength(1)
    w.returnStore()
    expect(await w.media.custody.sweep({ tenant: T1, limit: 10 })).toEqual({
      ok: { removed: 1, more: false },
    })
    expect(ok(await w.index.listDeleting(tenantText(T1), 10))).toEqual([])
  })

  it('the sweep leaves a row whose open write cannot be dropped, and takes it the next time', async () => {
    const { w } = await begun()
    w.advance(61_000)
    w.faults.methods.set('abort', 'unknown')
    expect(await w.media.custody.sweep({ tenant: T1, limit: 10 })).toMatchObject({
      ok: { removed: 0 },
    })
    w.faults.methods.clear()
    expect(await w.media.custody.sweep({ tenant: T1, limit: 10 })).toMatchObject({
      ok: { removed: 1 },
    })
    expect(w.medium.writes.size).toBe(0)
  })
})
