import { mediaProtocol } from '@omne-harness/media-protocol'
import { providedOn, serveProtocol } from '@omne-harness/shell-contract/testing'
import { describe, expect, it } from 'vitest'
import { createMediaUiModule, mediaPictureIntakeKey } from '../src/cordis.tsx'
import { fakeMedia, TENANT_TEXT, type FakeMedia } from './fixtures/fake-media.ts'
import { startShell } from './fixtures/reference-shell.ts'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const picture = (name: string, head: number[], tail: number[] = [1, 2, 3]) => ({
  name,
  bytes: new Uint8Array([...head, ...tail]),
})
const A = picture('a.png', PNG)
const B = picture('b.jpg', JPEG, [4, 5])
const PDF = picture('c.png', [0x25, 0x50, 0x44, 0x46, 0x2d])
const UNAVAILABLE = { kind: 'failed', reason: '媒体现在用不了' }

/** The reference the service gives an upload: what the attachment tray hands back for it, too. */
const refOf = (upload: unknown, mediaType: string, bytes: number) => ({
  storage: 'memory',
  key: `key-${String(upload)}`,
  mediaType,
  bytes: String(bytes),
  digest: `sha256:${String(upload)}`,
})

async function mounted(media: FakeMedia = fakeMedia()) {
  const { root, shell } = await startShell()
  const served = await serveProtocol(root, mediaProtocol, media.client)
  const module = root.plugin(createMediaUiModule())
  await module
  await new Promise(resolve => setTimeout(resolve, 0))
  const intake = () => providedOn(shell, mediaPictureIntakeKey)
  return { root, shell, served, module, media, intake }
}

/** Answers `begin-upload` with what `refuse` says for the upload of these bytes; the rest the service answers. */
function refuseBegin(media: FakeMedia, uploads: number, refuse: (bytes: number) => unknown) {
  for (let each = 0; each < uploads; each += 1)
    media.once('begin-upload', (body: { bytes: number }) => refuse(body.bytes))
}

describe('图的收法：每张图的结局乘整组的答复', () => {
  it('全成：按给的次序答一组和附件区交回的同形的引用；上传不带会话，备好了才答', async () => {
    const { intake, media } = await mounted()
    const answer = await intake()?.take(TENANT_TEXT, [A, B])
    const begun = media.calls.filter(call => call.operation === 'begin-upload')
    const uploadOf = (mediaType: string) =>
      begun.find(call => call.body['mediaType'] === mediaType)?.body['upload']
    expect(answer).toEqual({
      kind: 'taken',
      attachments: [
        { kind: 'image', ref: refOf(uploadOf('image/png'), 'image/png', 11) },
        { kind: 'image', ref: refOf(uploadOf('image/jpeg'), 'image/jpeg', 6) },
      ],
    })
    expect(begun.map(call => Object.keys(call.body).sort())).toEqual([
      ['bytes', 'mediaType', 'name', 'tenant', 'upload'],
      ['bytes', 'mediaType', 'name', 'tenant', 'upload'],
    ])
    expect(media.operations().filter(operation => operation === 'prepare-media')).toHaveLength(2)
  })

  it('有一张不是图：整组失败，原因说是哪一张；一张也不上传', async () => {
    const { intake, media } = await mounted()
    expect(await intake()?.take(TENANT_TEXT, [A, PDF])).toEqual({
      kind: 'failed',
      reason: '「c.png」不是图片',
    })
    expect(media.calls).toEqual([])
  })

  it('有一张传不上去（过大）：整组失败，不交其余几张的引用', async () => {
    const media = fakeMedia()
    refuseBegin(media, 2, bytes =>
      bytes === B.bytes.byteLength ? { outcome: 'limited', body: { limitBytes: 1 } } : undefined,
    )
    const { intake } = await mounted(media)
    expect(await intake()?.take(TENANT_TEXT, [A, B])).toEqual({
      kind: 'failed',
      reason: '「b.jpg」：超过大小上限',
    })
  })

  it('有一张传上去了却备不好：整组失败，原因说是哪一张', async () => {
    const media = fakeMedia()
    media.once('prepare-media', () => ({
      outcome: 'succeeded',
      body: { preprocess: { kind: 'failed', reason: 'engine-error' } },
    }))
    const { intake } = await mounted(media)
    const answer = await intake()?.take(TENANT_TEXT, [A])
    expect(answer).toEqual({ kind: 'failed', reason: '「a.png」：转换出错' })
  })

  it('空的表：答空的表，不调上传', async () => {
    const { intake, media } = await mounted()
    expect(await intake()?.take(TENANT_TEXT, [])).toEqual({ kind: 'taken', attachments: [] })
    expect(media.calls).toEqual([])
  })

  it('租户读不懂：答失败，不上传，不抛', async () => {
    const { intake, media } = await mounted()
    expect(await intake()?.take('not a tenant', [A])).toMatchObject({ kind: 'failed' })
    expect(media.calls).toEqual([])
  })
})

describe('图的收法：作用域乘在途的调用', () => {
  const hung = () => {
    const media = fakeMedia()
    let begun = 0
    media.once('begin-upload', () => {
      begun += 1
      return new Promise(() => undefined)
    })
    return { media, begun: () => begun }
  }

  it('媒体的协议在途中撤了：在途的调用答失败，原因写媒体现在用不了；这一项也没了', async () => {
    const { media, begun } = hung()
    const { intake, served } = await mounted(media)
    const asked = intake()?.take(TENANT_TEXT, [A])
    let answered: unknown
    void asked?.then(answer => (answered = answer))
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(begun()).toBe(1)
    expect(answered).toBeUndefined()
    await served.dispose()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(await asked).toEqual(UNAVAILABLE)
    expect(intake()).toBeUndefined()
  })

  it('模块收掉时：在途的调用答失败；之前拿到这一项的再调也答失败', async () => {
    const { media } = hung()
    const { intake, module } = await mounted(media)
    const held = intake()
    const asked = held?.take(TENANT_TEXT, [A])
    await new Promise(resolve => setTimeout(resolve, 5))
    await module.dispose()
    expect(await asked).toEqual(UNAVAILABLE)
    expect(await held?.take(TENANT_TEXT, [A])).toEqual(UNAVAILABLE)
  })

  it('作用域在时：没有在途的调用被收回，下一次照常答', async () => {
    const { intake } = await mounted()
    await intake()?.take(TENANT_TEXT, [A])
    expect((await intake()?.take(TENANT_TEXT, [B]))?.kind).toBe('taken')
  })
})

describe('图的收法：协议没挂着', () => {
  it('媒体的协议没挂着时这个模块不加载，这一项也就没有', async () => {
    const { root, shell } = await startShell()
    await root.plugin(createMediaUiModule())
    expect(providedOn(shell, mediaPictureIntakeKey)).toBeUndefined()
  })
})
