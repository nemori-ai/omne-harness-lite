// @vitest-environment happy-dom
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { definePoint } from '@omne-harness/shell-contract'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMediaUiModule,
  mediaComposerDraftsKey,
  type DraftOffer,
  type MediaBlockSubject,
  type MediaDraftSubject,
} from '../src/cordis.tsx'
import { fakeMedia, TENANT, TENANT_TEXT, type FakeMedia } from './fixtures/fake-media.ts'
import { startShell } from './fixtures/reference-shell.ts'

const SERVICE = protocolServiceName({ name: mediaProtocol.name, major: mediaProtocol.major })
const json = <S,>() => ({
  encode: (value: S) => JSON.stringify(value),
  decode: (text: string) => JSON.parse(text) as S,
})
const attachments = definePoint<MediaDraftSubject>({
  name: 'session.composer-attachments',
  subject: json(),
})
const block = definePoint<MediaBlockSubject>({ name: 'session.block', subject: json() })
const all = (entries: readonly { id: string; node: React.ReactNode }[]) =>
  entries.map(entry => <div key={entry.id}>{entry.node}</div>)

let urls = 0
beforeEach(() => {
  urls = 0
  Object.assign(URL, {
    createObjectURL: () => `blob:made-${String((urls += 1))}`,
    revokeObjectURL: () => undefined,
  })
})
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 6; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
  })
}
const png = (name: string, bytes: number[]) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' })

async function mounted(media: FakeMedia) {
  const { root, shell } = await startShell()
  shell.tenant = TENANT_TEXT
  root.reflect.provide(SERVICE, media.client)
  await root.plugin(createMediaUiModule({ composerAttachments: attachments, block }))
  const offers: DraftOffer[] = []
  const holder = (
    root as unknown as { get(name: string): { attach(given: unknown): () => void } }
  ).get(mediaComposerDraftsKey)
  const detach = holder.attach({ offer: (offer: DraftOffer) => offers.push(offer) })
  return { root, shell, offers, detach }
}

describe('界面模块', () => {
  it('协议客户端在时往两个拓展点各放一项，并提供收草稿的口的持有者；客户端不在时不加载', async () => {
    const { root, shell } = await startShell()
    const pending = root.plugin(createMediaUiModule({ composerAttachments: attachments, block }))
    await Promise.resolve()
    expect(shell.items('attached')).toEqual([])
    root.reflect.provide(SERVICE, fakeMedia().client)
    await pending
    expect(shell.items('attached').map(item => [item.anchor, item.id])).toEqual([
      ['session.composer-attachments', 'media'],
      ['session.block', 'media'],
    ])
    expect(mediaComposerDraftsKey).toBe('media.composer-drafts')
    expect(
      (root as unknown as { get(name: string): unknown }).get(mediaComposerDraftsKey),
    ).toBeDefined()
  })

  it('没给拓展点时什么都不放，照样加载', async () => {
    const { root, shell } = await startShell()
    root.reflect.provide(SERVICE, fakeMedia().client)
    await root.plugin(createMediaUiModule())
    expect(shell.items('attached')).toEqual([])
  })
})

describe('输入框的附件区', () => {
  const tray = (shell: Awaited<ReturnType<typeof mounted>>['shell'], draft = 'draft-1') => (
    <form aria-label="composer">{attachments.slot(shell, { session: 'ses_a', draft }, all)}</form>
  )

  it('选文件：图片立刻显示名字与预览，传完显示已备好，并把引用交回这份草稿', async () => {
    const media = fakeMedia(2)
    const { shell, offers } = await mounted(media)
    render(tray(shell))
    await settle()
    const input = screen.getByLabelText('选择图片') as HTMLInputElement
    expect(input.accept).toBe('image/png,image/jpeg,image/webp,image/gif')
    fireEvent.change(input, { target: { files: [png('a.png', [1, 2, 3, 4, 5])] } })
    expect(screen.getByText('a.png')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'a.png 的预览' }).getAttribute('src')).toBe(
      'blob:made-1',
    )
    await settle()
    expect(screen.getByText('已备好')).not.toBeNull()
    expect(offers.at(-1)).toMatchObject({
      session: 'ses_a',
      draft: 'draft-1',
      source: 'media',
      ready: true,
      attachments: [{ kind: 'image', ref: { mediaType: 'image/png', bytes: '5' } }],
    })
    expect(media.calls[0]?.body['tenant']).toEqual(TENANT)
  })

  it('点「附加图片」打开选文件；去掉一份之后它不再交回', async () => {
    const media = fakeMedia(2)
    const { shell, offers } = await mounted(media)
    render(tray(shell))
    await settle()
    const input = screen.getByLabelText('选择图片') as HTMLInputElement
    let opened = 0
    input.click = () => {
      opened += 1
    }
    fireEvent.click(screen.getByRole('button', { name: '附加图片' }))
    expect(opened).toBe(1)
    fireEvent.change(input, { target: { files: [png('a.png', [1, 2, 3])] } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '去掉 a.png' }))
    expect(screen.queryByText('a.png')).toBeNull()
    expect(offers.at(-1)).toMatchObject({ attachments: [], ready: true })
  })

  it('贴图与拖入：在输入框的表单上贴进或拖进的图片也附加上；只贴文字时不拦', async () => {
    const media = fakeMedia(2)
    const { shell } = await mounted(media)
    render(tray(shell))
    await settle()
    const form = screen.getByRole('form', { name: 'composer' })
    const pasted = fireEvent.paste(form, { clipboardData: { files: [png('pasted.png', [1, 2])] } })
    expect(pasted).toBe(false)
    expect(screen.getByText('pasted.png')).not.toBeNull()
    expect(fireEvent.paste(form, { clipboardData: { files: [] } })).toBe(true)
    const dropped = fireEvent.drop(form, { dataTransfer: { files: [png('dropped.png', [3])] } })
    expect(dropped).toBe(false)
    expect(screen.getByText('dropped.png')).not.toBeNull()
    expect(fireEvent.dragOver(form, { dataTransfer: { types: ['Files'] } })).toBe(false)
    expect(fireEvent.dragOver(form, { dataTransfer: { types: ['text/plain'] } })).toBe(true)
  })

  it('宿主重画（同一份草稿）时附件还在：不重新上传，也不丢', async () => {
    const media = fakeMedia(2)
    const { shell } = await mounted(media)
    const view = render(tray(shell))
    await settle()
    fireEvent.change(screen.getByLabelText('选择图片'), {
      target: { files: [png('kept.png', [1, 2, 3])] },
    })
    await settle()
    const before = media.calls.length
    view.rerender(tray(shell))
    await settle()
    view.rerender(tray(shell))
    await settle()
    expect(screen.getByText('kept.png')).not.toBeNull()
    expect(screen.getByText('已备好')).not.toBeNull()
    expect(media.calls).toHaveLength(before)
  })

  it('失败的一份写出原因；草稿换了之后附件区是空的', async () => {
    const media = fakeMedia(2)
    media.once('begin-upload', () => ({ outcome: 'limited', body: { limit: 2 } }))
    const { shell } = await mounted(media)
    const view = render(tray(shell))
    await settle()
    fireEvent.change(screen.getByLabelText('选择图片'), {
      target: { files: [png('big.png', [1, 2, 3])] },
    })
    await settle()
    expect(screen.getByText('超过大小上限')).not.toBeNull()
    view.rerender(tray(shell, 'draft-2'))
    await settle()
    expect(screen.queryByText('big.png')).toBeNull()
  })
})

describe('消息里一块非文字内容', () => {
  const ref = {
    storage: 'memory',
    key: 'key-up',
    mediaType: 'image/png',
    bytes: '10',
    digest: 'sha256:up',
  }
  const picture = {
    kind: 'image',
    id: 'blk_picture',
    visibility: { toHuman: true, toModel: true },
    ref,
    transcript: null,
    facts: { kind: 'image', widthPixels: 64, heightPixels: 48 },
  }
  const drawn = (shell: Awaited<ReturnType<typeof mounted>>['shell'], content: unknown) =>
    block.slot(shell, { session: 'ses_a', message: 'msg_1', block: 'blk_picture', content }, all)
  const stored = (media: FakeMedia) =>
    media.stored.set('key-up', {
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    })
  const reads = (media: FakeMedia) =>
    media.calls.filter(call => call.operation === 'read-media-page').map(call => call.body)

  it('图片画成缩略图：带显示目标读一份小的；点开读原件，再点收起', async () => {
    const media = fakeMedia(4)
    stored(media)
    const { shell } = await mounted(media)
    render(<>{drawn(shell, picture)}</>)
    expect(screen.getByText('正在读图片…')).not.toBeNull()
    await settle()
    const image = screen.getByRole('img', { name: '图片 64×48' })
    expect(image.getAttribute('src')).toBe('blob:made-1')
    expect(reads(media)).toEqual([
      {
        tenant: TENANT,
        ref,
        offset: 0,
        limit: 262_144,
        target: {
          mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          maxBytes: 262_144,
          maxWidth: 480,
          maxHeight: 360,
        },
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: '看原图' }))
    await settle()
    expect(
      reads(media)
        .slice(1)
        .map(body => [body['offset'], 'target' in body]),
    ).toEqual([
      [0, false],
      [4, false],
      [8, false],
    ])
    expect(screen.getByRole('img', { name: '图片 64×48' }).getAttribute('src')).toBe('blob:made-2')
    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    await settle()
    expect(screen.getByRole('button', { name: '看原图' })).not.toBeNull()
  })

  it('宿主重画时不重读：同一块的图片只读一遍', async () => {
    const media = fakeMedia(4)
    stored(media)
    const { shell } = await mounted(media)
    const view = render(<>{drawn(shell, picture)}</>)
    await settle()
    const before = reads(media).length
    view.rerender(<>{drawn(shell, { ...picture })}</>)
    await settle()
    expect(reads(media)).toHaveLength(before)
    expect(screen.getByRole('img', { name: '图片 64×48' }).getAttribute('src')).toBe('blob:made-1')
  })

  it('读不出来时写出原因，不留一张破图', async () => {
    const media = fakeMedia(4)
    const { shell } = await mounted(media)
    render(<>{drawn(shell, picture)}</>)
    await settle()
    expect(screen.getByText('图片读不出来：这份内容不在了')).not.toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('语音与文件画成一行：种类、媒体类型与大小；读不懂的内容照样说出来', async () => {
    const media = fakeMedia(4)
    const { shell } = await mounted(media)
    const file = {
      ...picture,
      kind: 'file',
      ref: { ...ref, mediaType: 'application/pdf', bytes: '2048' },
    }
    render(
      <>
        {drawn(shell, file)}
        {drawn(shell, { kind: 'image' })}
      </>,
    )
    await settle()
    expect(screen.getByText('〔file〕application/pdf · 2.0 KB')).not.toBeNull()
    expect(screen.getByText('〔image〕这一块的内容读不懂')).not.toBeNull()
    expect(media.calls).toEqual([])
  })
})
