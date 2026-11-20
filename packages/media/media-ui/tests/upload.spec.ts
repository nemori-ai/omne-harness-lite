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
    ['commit-upload', { outcome: 'invalid', body: { reason: 'digest-mismatch' } }, '对不上'],
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

describe('服务端说的序号与这边对不上时', () => {
  const failedWith = async (media: FakeMedia) => {
    const outcome = await upload(media).done
    return outcome.kind === 'failed' ? outcome.reason : outcome.kind
  }

  it('追加答「有缺口」并给了下一个序号：从那个序号接着传', async () => {
    const media = fakeMedia(4)
    media.once('append-upload-part', () => ({
      outcome: 'invalid',
      body: { reason: 'gap', nextSequence: 0 },
    }))
    expect(await upload(media).done).toEqual(committed)
    expect(media.calls.slice(1, 5).map(call => call.body['sequence'])).toEqual([0, 0, 1, 2])
  })

  it('提交答「没收齐」并给了下一个序号：回去补那一片，再提交', async () => {
    const media = fakeMedia(4)
    media.once('commit-upload', () => ({
      outcome: 'invalid',
      body: { reason: 'incomplete', nextSequence: 2 },
    }))
    expect(await upload(media).done).toEqual(committed)
    expect(media.operations().slice(4)).toEqual([
      'commit-upload',
      'append-upload-part',
      'commit-upload',
    ])
  })

  it.each([
    ['别的无效原因', { outcome: 'invalid', body: { reason: 'beyond-declared', nextSequence: 0 } }],
    ['不是无效的答复', { outcome: 'conflict', body: { reason: 'gap', nextSequence: 0 } }],
    ['序号不是数', { outcome: 'invalid', body: { reason: 'gap', nextSequence: '0' } }],
    ['提交才有的原因', { outcome: 'invalid', body: { reason: 'incomplete', nextSequence: 0 } }],
  ] as const)('追加答%s时不接着传，停下', async (_, answer) => {
    const media = fakeMedia(4)
    media.once('append-upload-part', () => answer)
    expect(await failedWith(media)).toBe(`上传没有成功（${answer.outcome}）`)
    expect(media.operations()).toEqual(['begin-upload', 'append-upload-part'])
  })

  it('整份恰好是分片的整数倍：传完就提交，不多发一片空的', async () => {
    const media = fakeMedia(4)
    const done = await upload(media, { bytes: BYTES.subarray(0, 8) }).done
    expect(done.kind).toBe('committed')
    expect(media.operations()).toEqual([
      'begin-upload',
      'append-upload-part',
      'append-upload-part',
      'commit-upload',
    ])
  })
})

describe('答复没到之后去问', () => {
  it('开始的答复没到：问到还在上传，照常传完', async () => {
    const media = fakeMedia(4)
    media.loseAnswer('begin-upload')
    expect(await upload(media).done).toEqual(committed)
    expect(media.operations().slice(0, 3)).toEqual([
      'begin-upload',
      'query-upload',
      'append-upload-part',
    ])
  })

  it('开始没有发出去：说连不上，一次也不问', async () => {
    const media = fakeMedia(4)
    media.once('begin-upload', () => {
      throw new Error('offline')
    })
    expect(await upload(media).done).toEqual({ kind: 'failed', reason: '连不上服务，没有传完' })
    expect(media.operations()).toEqual(['begin-upload'])
  })

  it('问的时候服务端不认识这次上传：停下并说出它的答复', async () => {
    const media = fakeMedia(4)
    media.once('commit-upload', () => ({ outcome: 'unknown', body: {} }))
    media.once('query-upload', () => ({ outcome: 'not-found', body: {} }))
    expect(await upload(media).done).toEqual({
      kind: 'failed',
      reason: '上传没有成功（not-found）',
    })
  })

  it('问的那一次没有发出去：说连不上', async () => {
    const media = fakeMedia(4)
    media.once('commit-upload', () => ({ outcome: 'unknown', body: {} }))
    media.once('query-upload', () => {
      throw new Error('offline')
    })
    expect(await upload(media).done).toEqual({ kind: 'failed', reason: '连不上服务，没有传完' })
  })
})
