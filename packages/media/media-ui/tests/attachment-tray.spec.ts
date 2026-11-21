import { describe, expect, it } from 'vitest'
import { AttachmentTray, type DraftOffer, type PickedFile } from '../src/model/attachment-tray.ts'
import { fakeMedia, TENANT, type FakeMedia } from './fixtures/fake-media.ts'

const picked = (name: string, bytes: number[], type = 'image/png'): PickedFile => ({
  name,
  type,
  size: bytes.length,
  read: async () => new Uint8Array(bytes),
})
const A = picked('a.png', [1, 2, 3, 4, 5])
const B = picked('b.png', [6, 7, 8])
/** The same file, read a little later: its upload begins after the others. */
const late = (file: PickedFile): PickedFile => ({
  ...file,
  read: async () => {
    await new Promise(resolve => setTimeout(resolve, 1))
    return file.read()
  },
})

async function settled(): Promise<void> {
  // The digest of the bytes is computed off the microtask queue: wait for timers too.
  for (let round = 0; round < 6; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

function trayOver(media: FakeMedia, holder: 'there' | 'absent' = 'there') {
  const offers: DraftOffer[] = []
  const released: string[] = []
  let ids = 0
  const tray = new AttachmentTray({
    client: media.client,
    tenant: TENANT,
    session: 'ses_a',
    draft: 'draft-1',
    drafts: () => (holder === 'absent' ? null : { offer: offer => offers.push(offer) }),
    newId: () => `id-${String((ids += 1))}`,
    preview: file => `blob:${file.name}`,
    release: url => released.push(url),
  })
  const shown = () => tray.read().map(each => [each.name, each.state.kind, each.preview] as const)
  const last = () => offers.at(-1)
  return { tray, offers, released, shown, last }
}
const refOf = (upload: string, bytes: number) => ({
  storage: 'memory',
  key: `key-${upload}`,
  mediaType: 'image/png',
  bytes: String(bytes),
  digest: `sha256:${upload}`,
})

describe('一份草稿的附件区', () => {
  it('选中的图片立刻出现并上传；传完之前告诉宿主没备好，传完交回它的引用', async () => {
    const media = fakeMedia(2)
    const { tray, shown, last, offers } = trayOver(media)
    tray.add([A])
    expect(shown()).toEqual([['a.png', 'uploading', 'blob:a.png']])
    expect(last()).toEqual({
      session: 'ses_a',
      draft: 'draft-1',
      source: 'media',
      attachments: [],
      ready: false,
    })
    await settled()
    expect(shown()).toEqual([['a.png', 'ready', 'blob:a.png']])
    expect(last()).toEqual({
      session: 'ses_a',
      draft: 'draft-1',
      source: 'media',
      attachments: [{ kind: 'image', ref: refOf('id-1', 5) }],
      ready: true,
    })
    expect(offers.every(offer => offer.ready === (offer === last()))).toBe(true)
    expect(media.calls[0]?.body).toMatchObject({ upload: 'id-1', mediaType: 'image/png', bytes: 5 })
  })

  it('上传中显示传了多少；变化通知订阅者', async () => {
    const media = fakeMedia(2)
    const { tray } = trayOver(media)
    const seen: (number | string)[] = []
    tray.subscribe(() => {
      const [only] = tray.read()
      seen.push(only?.state.kind === 'uploading' ? only.state.sent : (only?.state.kind ?? 'none'))
    })
    tray.add([A])
    await settled()
    expect(seen).toEqual([0, 2, 4, 5, 'ready'])
  })

  it.each([
    ['先选的先发起', [A, B]],
    ['后选的先发起', [late(A), B]],
  ])(
    '一份失败时整份草稿没备好，交回的只有备好的；去掉失败的那份就备好了（%s）',
    async (_, files) => {
      const media = fakeMedia(2)
      // The two uploads start in no fixed order: the answer goes by what is asked, not by who asks first.
      const overLimit = (body: { bytes: number }) =>
        body.bytes === B.size ? { outcome: 'limited', body: { limit: 2 } } : undefined
      media.once('begin-upload', overLimit)
      media.once('begin-upload', overLimit)
      const { tray, shown, last } = trayOver(media)
      tray.add(files)
      await settled()
      expect(shown()).toEqual([
        ['a.png', 'ready', 'blob:a.png'],
        ['b.png', 'failed', 'blob:b.png'],
      ])
      const [, failed] = tray.read()
      expect(failed?.state).toEqual({ kind: 'failed', reason: '超过大小上限' })
      expect(last()).toMatchObject({ attachments: [{ ref: refOf('id-1', 5) }], ready: false })
      tray.remove(failed?.id ?? '')
      expect(shown()).toEqual([['a.png', 'ready', 'blob:a.png']])
      expect(last()).toMatchObject({ attachments: [{ ref: refOf('id-1', 5) }], ready: true })
    },
  )

  it('不是图片的文件不上传，直接说只能附加图片', async () => {
    const media = fakeMedia(2)
    const { tray, last } = trayOver(media)
    tray.add([picked('notes.pdf', [1, 2], 'application/pdf')])
    await settled()
    expect(tray.read()[0]?.state).toEqual({
      kind: 'failed',
      reason: '只能附加图片（PNG、JPEG、WebP、GIF）',
    })
    expect(media.calls).toEqual([])
    expect(last()).toMatchObject({ attachments: [], ready: false })
  })

  it('上传中去掉：不再发下一片，迟到的答复不让它回来，预览的地址还回去', async () => {
    const media = fakeMedia(2)
    const { tray, shown, last, released } = trayOver(media)
    tray.add([A])
    tray.remove(tray.read()[0]?.id ?? '')
    expect(shown()).toEqual([])
    expect(last()).toMatchObject({ attachments: [], ready: true })
    await settled()
    expect(shown()).toEqual([])
    expect(media.operations().filter(name => name === 'append-upload-part')).toEqual([])
    expect(released).toEqual(['blob:a.png'])
  })

  it('草稿换了（附件区收走）：在途的上传停下，不再交回，预览的地址都还回去', async () => {
    const media = fakeMedia(2)
    const { tray, offers, released } = trayOver(media)
    tray.add([A, B])
    const before = offers.length
    tray.dispose()
    await settled()
    expect(offers).toHaveLength(before)
    expect(released.toSorted()).toEqual(['blob:a.png', 'blob:b.png'])
    expect(media.operations()).not.toContain('commit-upload')
    tray.add([A])
    expect(tray.read()).toEqual([])
  })

  it('交回附件的口不在时照样选取与上传，只是没有人收', async () => {
    const media = fakeMedia(2)
    const { tray, shown, offers } = trayOver(media, 'absent')
    tray.add([A])
    await settled()
    expect(shown()).toEqual([['a.png', 'ready', 'blob:a.png']])
    expect(offers).toEqual([])
  })
})

describe('附件区的边角', () => {
  it('去掉的是点名的那一份：别的不动，只还它的预览地址；不认识的标识什么都不做', async () => {
    const media = fakeMedia(2)
    const { tray, shown, offers, released } = trayOver(media)
    tray.add([A, B])
    await settled()
    const [, second] = tray.read()
    tray.remove(second?.id ?? '')
    expect(shown()).toEqual([['a.png', 'ready', 'blob:a.png']])
    expect(released).toEqual(['blob:b.png'])
    const before = offers.length
    tray.remove('no-such-id')
    expect(offers).toHaveLength(before)
    expect(shown()).toEqual([['a.png', 'ready', 'blob:a.png']])
  })

  it('没有预览的一份去掉或随附件区收走时，不还什么地址', async () => {
    const media = fakeMedia(2)
    const { tray, released } = trayOver(media)
    tray.add([
      picked('notes.pdf', [1], 'application/pdf'),
      picked('more.pdf', [2], 'application/pdf'),
    ])
    tray.remove(tray.read()[0]?.id ?? '')
    tray.dispose()
    expect(released).toEqual([])
  })

  it('上传中去掉之后，迟到的进度与结果不再交回任何东西', async () => {
    const media = fakeMedia(2)
    const { tray, offers } = trayOver(media)
    tray.add([A])
    tray.remove(tray.read()[0]?.id ?? '')
    const before = offers.length
    await settled()
    expect(offers).toHaveLength(before)
  })

  it('失败的一份从不带着引用交回', async () => {
    const media = fakeMedia(2)
    media.once('begin-upload', () => ({ outcome: 'limited', body: { limit: 2 } }))
    const { tray, offers } = trayOver(media)
    tray.add([A])
    await settled()
    expect(offers.flatMap(offer => offer.attachments)).toEqual([])
    expect(offers.every(offer => !offer.ready)).toBe(true)
  })

  it('文件读不出来：这一份失败并写明，什么都不上传', async () => {
    const media = fakeMedia(2)
    const { tray } = trayOver(media)
    const unreadable: PickedFile = { ...A, read: () => Promise.reject(new Error('gone')) }
    tray.add([unreadable])
    await settled()
    expect(tray.read()[0]?.state).toEqual({ kind: 'failed', reason: '这个文件读不出来' })
    expect(media.calls).toEqual([])
  })

  it('退订之后不再收到变化', async () => {
    const media = fakeMedia(2)
    const { tray } = trayOver(media)
    let told = 0
    const stop = tray.subscribe(() => {
      told += 1
    })
    tray.add([picked('notes.pdf', [1], 'application/pdf')])
    expect(told).toBe(1)
    stop()
    tray.add([picked('more.pdf', [2], 'application/pdf')])
    expect(told).toBe(1)
  })
})
