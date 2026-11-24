// @vitest-environment happy-dom
import { mediaProtocol } from '@omne-harness/media-protocol'
import { definePoint, defineRenderPoint, partsOn } from '@omne-harness/shell-contract'
import { serviceKey } from '@omne-harness/shell-contract'
import { provideOn, serveProtocol } from '@omne-harness/shell-contract/testing'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMediaUiModule,
  type DraftOffer,
  type Drafts,
  type MediaBlockSubject,
  type MediaDraftSubject,
} from '../src/cordis.tsx'
import type { Microphone } from '../src/model/recorder.ts'
import type { ScreenAnswer, ScreenSource } from '../src/model/snapper.ts'
import { fakeMedia, TENANT, TENANT_TEXT, type FakeMedia } from './fixtures/fake-media.ts'
import { startShell as startBare } from './fixtures/reference-shell.ts'

const json = <S,>() => ({
  encode: (value: S) => JSON.stringify(value),
  decode: (text: string) => JSON.parse(text) as S,
})
const attachments = definePoint<MediaDraftSubject>({
  name: 'session.composer-attachments',
  subject: json(),
})
const block = defineRenderPoint<MediaBlockSubject>({
  name: 'session.block-render',
  key: 'the kind of the block',
  summary: 'How a block of a message that is not text is drawn, by its kind.',
})
const kindOf = (content: unknown): string => (content as { kind: string }).kind

/** The host of these points is not on this tree: the case stands in for it and declares them. */
async function startShell() {
  const started = await startBare()
  for (const point of [attachments, block]) point.declare(started.shell)
  return started
}
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

const draftsKey = serviceKey<Drafts>('test.drafts')

async function mounted(media: FakeMedia, microphone?: Microphone, screenSource?: ScreenSource) {
  const { root, shell } = await startShell()
  shell.tenant = TENANT_TEXT
  await serveProtocol(root, mediaProtocol, media.client)
  await root.plugin(
    createMediaUiModule({
      composerAttachments: attachments,
      block,
      drafts: draftsKey,
      ...(microphone === undefined ? {} : { microphone }),
      ...(screenSource === undefined ? {} : { screen: screenSource }),
    }),
  )
  const offers: DraftOffer[] = []
  const drafts: Drafts = { offer: (offer: DraftOffer) => void offers.push(offer) }
  await provideOn(root, draftsKey, drafts)
  return { root, shell, offers }
}

describe('界面模块', () => {
  it('协议客户端在时往草稿的拓展点放一项，往块的点上三种媒体各放一项；客户端不在时这些都不放', async () => {
    const { root, shell } = await startShell()
    await root.plugin(createMediaUiModule({ composerAttachments: attachments, block }))
    expect(shell.items('attached')).toEqual([])
    expect(shell.adoption('media-ui')).toMatchObject({ kind: 'unavailable' })
    await serveProtocol(root, mediaProtocol, fakeMedia().client)
    await settle()
    expect(shell.adoption('media-ui')).toMatchObject({
      kind: 'adopted',
      bindings: { media: { key: 'media/v1' } },
    })
    expect(shell.items('attached').map(item => [item.anchor, item.id])).toEqual([
      ['session.composer-attachments', 'media'],
    ])
    const put = (kind: string) =>
      block.draw(
        shell,
        kind,
        { session: 'ses_a', message: 'msg_1', block: 'blk_1', content: { kind } },
        () => 'generic',
      ) !== 'generic'
    expect(['image', 'file', 'voice', 'text'].map(put)).toEqual([true, true, true, false])
  })

  it('声明八个部位，协议有没有服务都一样', async () => {
    const { root, shell } = await startShell()
    await root.plugin(createMediaUiModule({ composerAttachments: attachments, block }))
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.conflicts).toEqual([])
    expect(
      read.kind === 'read' && read.parts.map(part => [part.name, part.within ?? null]),
    ).toEqual([
      ['media.file', 'session.transcript'],
      ['media.picture', 'session.transcript'],
      ['media.read', 'session.transcript'],
      ['media.tray', 'session.composer'],
      ['media.tray.attach', 'media.tray'],
      ['media.tray.chip', 'media.tray'],
      ['media.tray.record', 'media.tray'],
      ['media.tray.screenshot', 'media.tray'],
    ])
  })

  it('没给拓展点时什么都不放，照样加载', async () => {
    const { root, shell } = await startShell()
    await serveProtocol(root, mediaProtocol, fakeMedia().client)
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
    const input = screen.getByLabelText('选择附件') as HTMLInputElement
    expect(input.accept).toBe(
      'image/png,image/jpeg,image/webp,image/gif,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/flac,audio/aac,application/pdf',
    )
    const on = (name: string) => document.querySelectorAll(`[data-omne-part="${name}"]`)
    expect(on('media.tray')[0]?.classList.contains('omne-media-tray')).toBe(true)
    expect(on('media.tray.attach')[0]?.getAttribute('aria-label')).toBe('附加图片、语音或 PDF')
    expect(on('media.tray.record')[0]?.getAttribute('aria-label')).toBe('按住录音')
    expect(on('media.tray.chip')).toHaveLength(0)
    fireEvent.change(input, { target: { files: [png('a.png', [1, 2, 3, 4, 5])] } })
    expect(on('media.tray.chip')[0]?.tagName).toBe('LI')
    expect(on('media.tray.chip')[0]?.closest('[data-omne-part="media.tray"]')).not.toBeNull()
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

  it('点附加按钮打开选文件；去掉一份之后它不再交回', async () => {
    const media = fakeMedia(2)
    const { shell, offers } = await mounted(media)
    render(tray(shell))
    await settle()
    const input = screen.getByLabelText('选择附件') as HTMLInputElement
    let opened = 0
    input.click = () => {
      opened += 1
    }
    fireEvent.click(screen.getByRole('button', { name: '附加图片、语音或 PDF' }))
    expect(opened).toBe(1)
    fireEvent.change(input, { target: { files: [png('a.png', [1, 2, 3])] } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '去掉 a.png' }))
    expect(screen.queryByText('a.png')).toBeNull()
    expect(offers.at(-1)).toMatchObject({ attachments: [], ready: true })
  })

  it('语音传完先显示在转换，转出来的文字显示在附件上；转换失败时显示原因与重试', async () => {
    const media = fakeMedia(2)
    const gate = Promise.withResolvers<unknown>()
    const definition = { name: 'voice', revision: '1' }
    const engine = { name: 'voice.transcribe', revision: '1' }
    media.once('prepare-media', () => gate.promise)
    media.once('prepare-media', () => ({
      outcome: 'succeeded',
      body: { preprocess: { kind: 'failed', reason: 'timeout' } },
    }))
    const { shell, offers } = await mounted(media)
    render(tray(shell))
    await settle()
    const input = screen.getByLabelText('选择附件') as HTMLInputElement
    const wav = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'audio/wav' })
    fireEvent.change(input, { target: { files: [wav('memo.wav')] } })
    await settle()
    expect(screen.getByText('在转换…')).not.toBeNull()
    gate.resolve({
      outcome: 'succeeded',
      body: {
        preprocess: {
          kind: 'done',
          representation: {
            outcome: 'converted',
            definition,
            engine,
            text: '今天下午三点开会',
            others: [],
          },
        },
      },
    })
    await settle()
    expect(screen.getByText('已转出：今天下午三点开会')).not.toBeNull()
    expect(offers.at(-1)).toMatchObject({ ready: true, attachments: [{ kind: 'voice' }] })
    fireEvent.change(input, { target: { files: [wav('late.wav')] } })
    await settle()
    expect(screen.getByText('转换超时')).not.toBeNull()
    expect(offers.at(-1)).toMatchObject({ ready: false })
    fireEvent.click(screen.getByRole('button', { name: '重试 late.wav' }))
    await settle()
    expect(screen.queryByRole('button', { name: '重试 late.wav' })).toBeNull()
    expect(offers.at(-1)).toMatchObject({ ready: true })
  })

  it('按住录音：松开后录下的话作为语音附件上传并显示转写；用不了麦克风时说出来', async () => {
    const media = fakeMedia(64)
    media.once('prepare-media', () => ({
      outcome: 'succeeded',
      body: {
        preprocess: {
          kind: 'done',
          representation: {
            outcome: 'converted',
            definition: { name: 'voice', revision: '1' },
            engine: { name: 'voice.transcribe', revision: '1' },
            text: '提醒我明天交周报',
            others: [],
          },
        },
      },
    }))
    let refuse = false
    const microphone: Microphone = {
      open: async () => {
        if (refuse) throw new Error('refused')
        return { finish: async () => new Float32Array([0.1, -0.1]), cancel: () => undefined }
      },
    }
    const { shell, offers } = await mounted(media, microphone)
    render(tray(shell))
    await settle()
    const button = screen.getByRole('button', { name: '按住录音' })
    fireEvent.pointerDown(button)
    await settle()
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('松开结束').getAttribute('role')).toBe('status')
    fireEvent.pointerUp(button)
    await settle()
    expect(screen.queryByText('松开结束')).toBeNull()
    expect(screen.getByText('录音 1.wav')).not.toBeNull()
    expect(screen.getByText('已转出：提醒我明天交周报')).not.toBeNull()
    expect(offers.at(-1)).toMatchObject({ ready: true, attachments: [{ kind: 'voice' }] })
    const begun = media.calls.find(call => call.operation === 'begin-upload')
    expect(begun?.body).toMatchObject({ mediaType: 'audio/wav', bytes: 48 })
    refuse = true
    fireEvent.keyDown(button, { key: ' ' })
    await settle()
    fireEvent.keyUp(button, { key: ' ' })
    await settle()
    expect(screen.getByRole('status').textContent).toBe('用不了麦克风')
  })

  it('截图钮：宿主截得了屏才有；按下后草稿里多一张 PNG，照粘贴的图片上传；没权限时一行说明与「打开系统设置」；截失败说原因', async () => {
    const media = fakeMedia(2)
    const answers: ScreenAnswer[] = [
      { kind: 'not-authorized' },
      { kind: 'failed', reason: '屏幕后端出错' },
      {
        kind: 'shot',
        png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        takenAt: new Date(2026, 10, 24, 13, 5, 9).getTime(),
      },
    ]
    const opened: string[] = []
    const screenSource: ScreenSource = {
      available: async () => true,
      capture: async () => answers.shift() ?? { kind: 'failed', reason: '没有了' },
      openSettings: () => void opened.push('settings'),
    }
    const { shell, offers } = await mounted(media, undefined, screenSource)
    render(tray(shell))
    await settle()
    const button = screen.getByRole('button', { name: '截一张屏幕，作为图片附件' })
    fireEvent.click(button)
    await settle()
    expect(screen.getByRole('status').textContent).toBe('还没有屏幕录制的权限')
    fireEvent.click(screen.getByRole('button', { name: '打开系统设置' }))
    expect(opened).toEqual(['settings'])
    fireEvent.click(button)
    await settle()
    expect(screen.getByRole('status').textContent).toBe('没截到屏幕：屏幕后端出错')
    expect(screen.queryByRole('button', { name: '打开系统设置' })).toBeNull()
    fireEvent.click(button)
    await settle()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('屏幕截图 13.05.09.png')).not.toBeNull()
    const begun = media.calls.find(call => call.operation === 'begin-upload')
    expect(begun?.body).toMatchObject({ mediaType: 'image/png', bytes: 4 })
    expect(offers.at(-1)).toMatchObject({ attachments: [{ kind: 'image' }] })
  })

  it('截图钮：宿主截不了屏，或没给截图的来源时，没有这个钮', async () => {
    const media = fakeMedia(2)
    const unable: ScreenSource = {
      available: async () => false,
      capture: async () => ({ kind: 'failed', reason: '不该被叫到' }),
    }
    const first = await mounted(media, undefined, unable)
    render(tray(first.shell))
    await settle()
    expect(screen.queryByRole('button', { name: '截一张屏幕，作为图片附件' })).toBeNull()
    cleanup()
    const second = await mounted(media)
    render(tray(second.shell))
    await settle()
    expect(screen.queryByRole('button', { name: '截一张屏幕，作为图片附件' })).toBeNull()
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
    fireEvent.change(screen.getByLabelText('选择附件'), {
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
    fireEvent.change(screen.getByLabelText('选择附件'), {
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
    block.draw(
      shell,
      kindOf(content),
      { session: 'ses_a', message: 'msg_1', block: 'blk_picture', content },
      () => null,
    )
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
    expect(
      image.closest('[data-omne-part="media.picture"]')?.classList.contains('omne-media-picture'),
    ).toBe(true)
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

  it('块上写着模型这一次读的是哪一份：原件、缩小的图、转写、提取的文字；不知道时不写', async () => {
    const media = fakeMedia(4)
    stored(media)
    const { shell } = await mounted(media)
    const voice = { ...picture, kind: 'voice', ref: { ...ref, mediaType: 'audio/wav' } }
    const file = { ...picture, kind: 'file', ref: { ...ref, mediaType: 'application/pdf' } }
    const told = (content: unknown, read: string | undefined, id: string) =>
      block.draw(
        shell,
        kindOf(content),
        {
          session: 'ses_a',
          message: 'msg_1',
          block: id,
          content,
          ...(read === undefined ? {} : { read }),
        },
        () => null,
      )
    render(
      <>
        {told(voice, 'original', 'b1')}
        {told(picture, 'fitted', 'b2')}
        {told(voice, 'transcript', 'b3')}
        {told(file, 'transcript', 'b4')}
        {told(file, 'derived', 'b5')}
        {told(file, undefined, 'b6')}
      </>,
    )
    await settle()
    const voices = [...document.querySelectorAll('.omne-media-block')]
      .filter(each => each.textContent?.includes('〔voice〕'))
      .map(each => each.querySelector('.omne-media-read')?.textContent)
    expect(voices).toEqual(['模型读的是原件', '模型读的是转写'])
    const files = [...document.querySelectorAll('.omne-media-block')]
      .filter(each => each.textContent?.includes('〔file〕'))
      .map(each => each.querySelector('.omne-media-read')?.textContent)
    expect(files).toEqual(['模型读的是提取的文字', '模型读的是另一种表示'])
    expect(screen.getAllByText('模型读的是原件')).toHaveLength(1)
    expect(screen.getAllByText('模型读的是缩小的图')).toHaveLength(1)
    expect(screen.getAllByText('模型读的是转写')).toHaveLength(1)
    expect(screen.getAllByText('模型读的是提取的文字')).toHaveLength(1)
    expect(screen.getAllByText('模型读的是另一种表示')).toHaveLength(1)
    expect(document.querySelectorAll('.omne-media-read')).toHaveLength(5)
    expect(document.querySelectorAll('[data-omne-part="media.read"]')).toHaveLength(5)
    expect(
      document
        .querySelector('[data-omne-part="media.read"]')
        ?.classList.contains('omne-media-read'),
    ).toBe(true)
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
    const lines = [...document.querySelectorAll('[data-omne-part="media.file"]')]
    expect(lines.map(line => line.textContent)).toEqual([
      '〔file〕application/pdf · 2.0 KB',
      '〔image〕这一块的内容读不懂',
    ])
    expect(lines.every(line => line.classList.contains('omne-media-line'))).toBe(true)
    expect(media.calls).toEqual([])
  })
})
