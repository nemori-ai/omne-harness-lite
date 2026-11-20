import { describe, expect, it } from 'vitest'
import { createToolMediaStore } from '@omne-harness/media-adapters'
import type { Custody } from '@omne-harness/media-contract'
import { ok, png, T1, T2, world } from './world.ts'

const holder = { owner: 'tool-host', work: 'call-1', position: 'result', purpose: 'product' }
const PICTURE = png(4, 3, 1)

function storeOver(custody: Pick<Custody, 'put'> | undefined) {
  return createToolMediaStore<string>(() => custody)
}
const put = (
  store: ReturnType<typeof storeOver>,
  bytes: Uint8Array = PICTURE,
  mediaType = 'image/png',
  tenant = T1,
) => store.put({ principal: 'someone', tenant, holder, mediaType, bytes })

describe('the store of products of Tool over media', () => {
  it('stores the bytes for the tenant and holds them for the holder in one step', async () => {
    const w = world()
    const stored = ok(await put(storeOver(w.media.custody)))
    expect(stored).toEqual({
      ref: {
        storage: 'memory',
        key: expect.any(String),
        mediaType: 'image/png',
        bytes: String(PICTURE.byteLength),
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
      facts: { kind: 'image', widthPixels: 4, heightPixels: 3 },
    })
    expect(await w.holders(T1, stored.ref)).toBe(1)
    expect(await w.media.custody.describe({ tenant: T1, ref: stored.ref })).toMatchObject({
      ok: { state: 'held' },
    })
    expect(await w.media.custody.describe({ tenant: T2, ref: stored.ref })).toEqual({
      failure: { kind: 'invalid-reference' },
    })
  })

  it('answers unavailable and stores nothing while the custody of media is not there', async () => {
    expect(await put(storeOver(undefined))).toEqual({
      failure: { kind: 'unavailable', operation: 'media.put', reason: 'media is not there' },
    })
  })

  it('says what media refused: too large, a type it does not take, bytes of another type', async () => {
    const store = storeOver(world().media.custody)
    expect(await put(store, new Uint8Array([...png(4, 3), ...new Uint8Array(60)]))).toEqual({
      failure: { kind: 'too-large', reason: 'over the 64 byte limit of media for this type' },
    })
    expect(await put(store, PICTURE, 'application/x-unknown-thing')).toMatchObject({
      failure: { kind: 'unsupported' },
    })
    expect(await put(store, PICTURE, 'image/jpeg')).toMatchObject({ failure: { kind: 'invalid' } })
  })

  it.each([
    [{ kind: 'over-budget' }, { kind: 'too-large', reason: 'over the image budget of media' }],
    [
      { kind: 'unavailable', dependency: 'index' },
      { kind: 'unavailable', operation: 'media.put', reason: 'media: index is unavailable' },
    ],
    [
      { kind: 'outcome-unknown' },
      {
        kind: 'unknown',
        operation: 'media.put',
        reason: 'media did not say whether the product was stored',
      },
    ],
  ] as const)('turns %o of media into its own answer', async (failure, answer) => {
    const custody: Pick<Custody, 'put'> = { put: async () => ({ failure }) }
    expect(await put(storeOver(custody))).toEqual({ failure: answer })
  })

  it('hands media the tenant, the media type, the holder and exactly the bytes it was given', async () => {
    const seen: unknown[] = []
    const custody: Pick<Custody, 'put'> = {
      put: async input => {
        const parts: number[] = []
        for await (const part of input.bytes) parts.push(...part)
        seen.push({ ...input, bytes: parts })
        return { failure: { kind: 'unsupported-type' } }
      },
    }
    await put(storeOver(custody))
    expect(seen).toEqual([{ tenant: T1, mediaType: 'image/png', holder, bytes: [...PICTURE] }])
  })
})
