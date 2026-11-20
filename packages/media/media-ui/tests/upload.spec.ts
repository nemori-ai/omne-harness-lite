import { describe, expect, it } from 'vitest'
import { readWhole, uploadMedium } from '../src/model/upload.ts'
import { fakeMedia, TENANT, type FakeMedia } from './fixtures/fake-media.ts'

const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const DIGEST = 'sha256:c848e1013f9f04a9d63fa43ce7fd4af035152c7c669a4a404b67107cee5f2e4e'

function upload(media: FakeMedia, over: { cancelled?: () => boolean; bytes?: Uint8Array } = {}) {
  const progress: number[] = []
  const done = uploadMedium({
    client: media.client,
    tenant: TENANT,
    upload: 'up-1',
    mediaType: 'image/png',
    bytes: over.bytes ?? BYTES,
    progress: sent => progress.push(sent),
    cancelled: over.cancelled ?? (() => false),
  })
  return { done, progress }
}
const committed = {
  kind: 'committed',
  ref: {
    storage: 'memory',
    key: 'key-up-1',
    mediaType: 'image/png',
    bytes: '10',
    digest: 'sha256:up-1',
  },
  facts: { kind: 'image', widthPixels: 4, heightPixels: 3 },
}

describe('上传一份媒体', () => {
  it('开始、按服务端给的分片大小逐片追加、提交；交回引用与媒体事实，进度逐片前进', async () => {
    const media = fakeMedia(4)
    const { done, progress } = upload(media)
    expect(await done).toEqual(committed)
    expect(media.operations()).toEqual([
      'begin-upload',
      'append-upload-part',
      'append-upload-part',
      'append-upload-part',
      'commit-upload',
    ])
    expect(media.calls[0]?.body).toEqual({
      tenant: TENANT,
      upload: 'up-1',
      mediaType: 'image/png',
      bytes: 10,
    })
    expect(media.calls.slice(1, 4).map(call => [call.body['sequence'], call.body['part']])).toEqual(
      [
        [0, BYTES.subarray(0, 4)],
        [1, BYTES.subarray(4, 8)],
        [2, BYTES.subarray(8)],
      ],
    )
    expect(media.calls[4]?.body).toMatchObject({ upload: 'up-1', digest: DIGEST })
    expect(progress).toEqual([4, 8, 10])
    expect(media.stored.get('key-up-1')?.bytes).toEqual(BYTES)
  })

  it.each([
    ['begin-upload', { outcome: 'limited', body: { limit: 8 } }, '超过大小上限'],
    ['begin-upload', { outcome: 'unsupported', body: {} }, '这种类型的文件不收'],
    ['begin-upload', { outcome: 'denied', body: {} }, '上传没有成功（denied）'],
    ['append-upload-part', { outcome: 'conflict', body: { reason: 'other-bytes' } }, 'conflict'],
    ['commit-upload', { outcome: 'invalid', body: { reason: 'type-mismatch' } }, '内容不是'],
    ['commit-upload', { outcome: 'invalid', body: { reason: 'over-budget' } }, '解码'],
  ] as const)('%s 答 %j 时停下并说出原因', async (operation, answer, reason) => {
    const media = fakeMedia(4)
    media.once(operation, () => answer)
    const outcome = await upload(media).done
    expect(outcome).toMatchObject({ kind: 'failed' })
    expect(outcome.kind === 'failed' && outcome.reason).toContain(reason)
    expect(media.operations().at(-1)).toBe(operation)
  })

  it('一片的答复没到：问这次上传现在在哪，从服务端说的下一片接着传，不重传已收下的', async () => {
    const media = fakeMedia(4)
    media.once('append-upload-part', () => undefined)
    media.loseAnswer('append-upload-part')
    expect(await upload(media).done).toEqual(committed)
    expect(media.operations()).toEqual([
      'begin-upload',
      'append-upload-part',
      'append-upload-part',
      'query-upload',
      'append-upload-part',
      'commit-upload',
    ])
    expect(media.calls.at(-2)?.body['sequence']).toBe(2)
    expect(media.stored.get('key-up-1')?.bytes).toEqual(BYTES)
  })

  it('提交的答复没到而其实提交了：问到已提交，交回引用，不再提交一次', async () => {
    const media = fakeMedia(4)
    media.loseAnswer('commit-upload')
    expect(await upload(media).done).toEqual(committed)
    expect(media.operations().slice(-2)).toEqual(['commit-upload', 'query-upload'])
  })

  it('答复一直不到：问过两次之后停下，说结果不知道', async () => {
    const media = fakeMedia(4)
    for (let lost = 0; lost < 3; lost += 1)
      media.once('commit-upload', () => ({ outcome: 'unknown', body: {} }))
    const outcome = await upload(media).done
    expect(outcome).toEqual({ kind: 'failed', reason: '上传的结果不知道，请去掉后重新附加' })
    expect(media.operations().filter(name => name === 'query-upload')).toHaveLength(2)
  })

  it('调用没有发出去（客户端抛出）时停下，说连不上', async () => {
    const media = fakeMedia(4)
    media.once('append-upload-part', () => {
      throw new Error('offline')
    })
    expect(await upload(media).done).toEqual({ kind: 'failed', reason: '连不上服务，没有传完' })
  })

  it('中途取消：下一片不再发出', async () => {
    const media = fakeMedia(4)
    let sent = 0
    const { done } = upload(media, { cancelled: () => (sent += 1) > 1 })
    expect(await done).toEqual({ kind: 'cancelled' })
    expect(media.operations()).toEqual(['begin-upload', 'append-upload-part'])
  })

  it('同名的上传已经提交过：开始就答已提交，一片也不传', async () => {
    const media = fakeMedia(4)
    await upload(media).done
    const before = media.calls.length
    expect(await upload(media).done).toEqual(committed)
    expect(media.operations().slice(before)).toEqual(['begin-upload'])
  })
})

describe('读回一份媒体', () => {
  it('一页一页读到没有下一页，拼成整份；带显示目标时读的是目标内的那一份', async () => {
    const media = fakeMedia(4)
    const { ref } = (await upload(media).done) as typeof committed
    expect(await readWhole({ client: media.client, tenant: TENANT, ref, target: null })).toEqual({
      kind: 'read',
      mediaType: 'image/png',
      bytes: BYTES,
    })
    const pages = media.calls.filter(call => call.operation === 'read-media-page')
    expect(pages.map(call => call.body['offset'])).toEqual([0, 4, 8])
    expect(pages[0]?.body).not.toHaveProperty('target')
    const target = { mediaTypes: ['image/png'], maxBytes: 100, maxWidth: 8, maxHeight: 8 }
    expect(await readWhole({ client: media.client, tenant: TENANT, ref, target })).toEqual({
      kind: 'read',
      mediaType: 'image/png',
      bytes: BYTES.subarray(0, 2),
    })
    expect(media.calls.at(-1)?.body['target']).toEqual(target)
  })

  it('读不到时说出原因：引用无效、字节不在、别的答复', async () => {
    const media = fakeMedia(4)
    const ref = { ...committed.ref, key: 'nowhere' }
    const read = () => readWhole({ client: media.client, tenant: TENANT, ref, target: null })
    expect(await read()).toEqual({ kind: 'unreadable', reason: '这份内容不在了' })
    media.once('read-media-page', () => ({ outcome: 'limited', body: {} }))
    expect(await read()).toEqual({ kind: 'unreadable', reason: '读不出来（limited）' })
    media.once('read-media-page', () => {
      throw new Error('offline')
    })
    expect(await read()).toEqual({ kind: 'unreadable', reason: '连不上服务' })
  })
})
