// @vitest-environment happy-dom
import { referenceText } from '@omne-harness/media-protocol'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { defineRenderPoint, partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMediaUiModule,
  type MediaCanvasElementSubject,
  type MediaCanvasIntakeSubject,
} from '../src/cordis.tsx'
import { fakeMedia, TENANT, TENANT_TEXT, type FakeMedia } from './fixtures/fake-media.ts'
import { startShell as startBare } from './fixtures/reference-shell.ts'

type Reference = Readonly<{ kind: string; ref: string }>

/** The canvas's points as its interface module declares them; the case stands in for that host. */
const element = defineRenderPoint<MediaCanvasElementSubject>({
  name: 'canvas.element',
  key: 'the name of the kind',
  summary: 'How a thing of one kind is drawn on the canvas.',
})
const intake = defineRenderPoint<MediaCanvasIntakeSubject>({
  name: 'canvas.intake',
  key: 'what is handed onto the canvas',
  summary: 'How what is dropped onto the canvas becomes a reference put on it.',
})

let urls = 0
beforeEach(() => {
  urls = 0
  // happy-dom rejects the finished promise of a cancelled arrival, which no one awaits: no arrivals here.
  Object.assign(HTMLElement.prototype, { animate: undefined })
  Object.assign(URL, {
    createObjectURL: () => `blob:made-${String((urls += 1))}`,
    revokeObjectURL: () => undefined,
  })
})
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 8; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function mounted(media: FakeMedia, given = true) {
  const { root, shell } = await startBare()
  for (const point of [element, intake]) point.declare(shell)
  shell.tenant = TENANT_TEXT
  await serveProtocol(root, mediaProtocol, media.client)
  await root.plugin(
    createMediaUiModule(given ? { canvasElement: element, canvasIntake: intake } : {}),
  )
  return shell
}
type Shell = Awaited<ReturnType<typeof mounted>>

const ref = {
  storage: 'memory',
  key: 'key-up',
  mediaType: 'image/png',
  bytes: '10',
  digest: 'sha256:up',
}
const objectOf = (written: string): Reference => ({ kind: 'media.object', ref: written })
const drawn = (shell: Shell, reference: Reference, frame: 'sheet' | 'pile' | 'search' = 'sheet') =>
  element.draw(shell, 'media.object', { reference, frame }, () => 'generic')
const stored = (media: FakeMedia) =>
  media.stored.set('key-up', {
    mediaType: 'image/png',
    bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  })
const described = (media: FakeMedia, facts: unknown) =>
  media.once('describe-media', () => ({
    outcome: 'succeeded',
    body: { state: 'held', facts, preprocess: { kind: 'not-needed' } },
  }))
const reads = (media: FakeMedia) =>
  media.calls.filter(call => call.operation === 'read-media-page').map(call => call.body)

describe('纸上的媒体对象', () => {
  it('图片画成缩略图：读回标识，按租户问它在不在，带显示目标读一份小的；点开在盖层里读原件', async () => {
    const media = fakeMedia(4)
    stored(media)
    const shell = await mounted(media)
    render(<>{drawn(shell, objectOf(referenceText(ref)))}</>)
    await settle()
    expect(media.calls[0]).toEqual({ operation: 'describe-media', body: { tenant: TENANT, ref } })
    const image = screen.getByRole('img', { name: '图片 4×3' })
    expect(image.getAttribute('src')).toBe('blob:made-1')
    expect(reads(media).map(body => 'target' in body)).toEqual([true])
    const open = screen.getByRole('button', { name: '看原图' })
    open.focus()
    fireEvent.click(open)
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
    const over = screen.getByRole('dialog', { name: '图片 4×3' })
    const object = document.querySelector('[data-omne-part="media.object"]')
    expect(object?.getAttribute('data-frame')).toBe('sheet')
    expect(object?.contains(over)).toBe(false)
    expect(over.querySelector('img')?.getAttribute('src')).toBe('blob:made-2')
    expect(object?.querySelector('img')?.getAttribute('src')).toBe('blob:made-1')
    fireEvent.keyDown(over, { key: 'Escape' })
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '看原图' }))
  })

  it('一叠里露出的一页点开也在盖层里看原件', async () => {
    const media = fakeMedia(4)
    stored(media)
    const shell = await mounted(media)
    render(<>{drawn(shell, objectOf(referenceText(ref)), 'pile')}</>)
    await settle()
    const open = screen.getByRole('button', { name: '看原图' })
    fireEvent.click(open)
    await settle()
    expect(screen.getByRole('dialog', { name: '图片 4×3' }).querySelector('img')).not.toBeNull()
  })

  it('文件与语音各画一行：文件写媒体类型与大小，语音写时长与大小，和消息里的同一套，不读字节', async () => {
    const media = fakeMedia(4)
    described(media, { kind: 'file' })
    described(media, { kind: 'voice', durationMs: 2000, sampleRate: 16000, channels: 1 })
    const shell = await mounted(media)
    const pdf = { ...ref, mediaType: 'application/pdf', bytes: '2048' }
    const wav = { ...ref, key: 'key-wav', mediaType: 'audio/wav', bytes: '64000' }
    render(
      <>
        {drawn(shell, objectOf(referenceText(pdf)))}
        {drawn(shell, objectOf(referenceText(wav)))}
      </>,
    )
    await settle()
    const lines = [...document.querySelectorAll('[data-omne-part="media.file"]')]
    expect(lines.map(line => line.textContent)).toEqual([
      '〔file〕application/pdf · 2.0 KB',
      '〔voice〕2 秒 · 62.5 KB',
    ])
    expect(reads(media)).toEqual([])
  })

  it('标识读不懂、对象不存在、不是这个租户的，写的是逐字相同的一句；协议不可用写另一句，可以重试', async () => {
    const media = fakeMedia(4)
    media.once('describe-media', () => ({ outcome: 'not-found', body: {} }))
    media.once('describe-media', () => ({ outcome: 'denied', body: {} }))
    media.once('describe-media', () => ({ outcome: 'basis-unavailable', body: {} }))
    const shell = await mounted(media)
    const said = (index: number) =>
      document.querySelectorAll('[data-omne-part="media.object"]')[index]?.textContent
    render(
      <>
        {drawn(shell, objectOf(` ${referenceText(ref)}`))}
        {drawn(shell, objectOf(referenceText({ ...ref, key: 'key-none' })))}
        {drawn(shell, objectOf(referenceText({ ...ref, key: 'key-other-tenant' })))}
        {drawn(shell, objectOf(referenceText({ ...ref, key: 'key-later' })))}
      </>,
    )
    await settle()
    expect([said(0), said(1), said(2)]).toEqual([
      '这个文件不在这里了',
      '这个文件不在这里了',
      '这个文件不在这里了',
    ])
    expect(media.calls).toHaveLength(3)
    expect(screen.getByText('现在读不到')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await settle()
    expect(screen.queryByText('现在读不到')).toBeNull()
    expect(said(3)).not.toContain('这个文件不在这里了')
  })

  it('调用本身抛出时也写「现在读不到」', async () => {
    const media = fakeMedia(4)
    media.once('describe-media', () => Promise.reject(new Error('lost')))
    const shell = await mounted(media)
    render(<>{drawn(shell, objectOf(referenceText(ref)))}</>)
    await settle()
    expect(screen.getByText('现在读不到')).not.toBeNull()
  })

  it('三种框：纸上与一叠里露出的一页画缩略图，查找里的一行画成一行字、不读字节', async () => {
    const media = fakeMedia(4)
    stored(media)
    const shell = await mounted(media)
    const written = objectOf(referenceText(ref))
    render(
      <>
        {drawn(shell, written, 'sheet')}
        {drawn(shell, written, 'pile')}
        {drawn(shell, written, 'search')}
      </>,
    )
    await settle()
    const objects = [...document.querySelectorAll('[data-omne-part="media.object"]')]
    expect(
      objects.map(each => [each.getAttribute('data-frame'), each.querySelector('img') !== null]),
    ).toEqual([
      ['sheet', true],
      ['pile', true],
      ['search', false],
    ])
    expect(objects[2]?.textContent).toBe('〔image〕image/png · 10 B')
    expect(reads(media)).toHaveLength(2)
  })
})

const png = (name: string, bytes: number[]) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' })

function ports() {
  const placed: Reference[] = []
  let done = 0
  return {
    placed,
    done: () => done,
    subject: (files: readonly File[]): MediaCanvasIntakeSubject => ({
      files,
      place: reference => void placed.push(reference),
      done: () => void (done += 1),
    }),
  }
}
const handed = (shell: Shell, subject: MediaCanvasIntakeSubject) =>
  intake.draw(shell, 'files', subject, () => 'generic')

describe('拖到纸上的文件', () => {
  it('合规的上传、备好之后交给 place 一次；被筛掉的写原因、不交；全部有结局之后 done 一次', async () => {
    const media = fakeMedia(2)
    const shell = await mounted(media)
    const { placed, done, subject } = ports()
    const files = [png('a.png', [1, 2, 3]), new File(['hi'], 'note.txt', { type: 'text/plain' })]
    render(<>{handed(shell, subject(files))}</>)
    expect(screen.getByText('只能附加图片、语音或 PDF')).not.toBeNull()
    expect(done()).toBe(0)
    await settle()
    const committed = media.calls.find(call => call.operation === 'commit-upload')
    const upload = String(committed?.body['upload'])
    expect(placed).toEqual([
      objectOf(
        referenceText({
          storage: 'memory',
          key: `key-${upload}`,
          mediaType: 'image/png',
          bytes: '3',
          digest: `sha256:${upload}`,
        }),
      ),
    ])
    expect(media.operations()).toContain('prepare-media')
    expect(done()).toBe(1)
    const rows = [...document.querySelectorAll('[data-omne-part="media.intake"] li')]
    expect(rows.map(row => [row.getAttribute('data-state'), row.textContent])).toEqual([
      ['ready', 'a.png已备好'],
      ['failed', 'note.txt只能附加图片、语音或 PDF'],
    ])
  })

  it('几份都合规时每份备好各交一次，不因别的一份的进度再交', async () => {
    const media = fakeMedia(2)
    const shell = await mounted(media)
    const { placed, done, subject } = ports()
    const files = [png('a.png', [1, 2]), png('b.png', [1, 2, 3, 4, 5, 6, 7, 8])]
    render(<>{handed(shell, subject(files))}</>)
    await settle()
    expect(placed.map(each => JSON.parse(each.ref).bytes).toSorted()).toEqual(['2', '8'])
    expect(done()).toBe(1)
  })

  it('图片按上传答复里的宽高带一个大小交给 place：宽 176，高按比例夹在 88 到 232 之间；别的种类不带', async () => {
    const media = fakeMedia(64)
    const given: unknown[] = []
    const subject = (files: readonly File[]): MediaCanvasIntakeSubject => ({
      files,
      place: (_reference, placing) => void given.push(placing),
      done: () => undefined,
    })
    const shell = await mounted(media)
    const answer = (facts: unknown) => (body: { upload: string; digest: string }) => ({
      outcome: 'succeeded',
      body: {
        ref: {
          storage: 'memory',
          key: `key-${body.upload}`,
          mediaType: 'image/png',
          bytes: '1',
          digest: body.digest,
        },
        facts,
      },
    })
    media.once(
      'commit-upload',
      answer({ kind: 'image', widthPixels: 640, heightPixels: 400 }) as never,
    )
    render(<>{handed(shell, subject([png('wide.png', [1])]))}</>)
    await settle()
    media.once(
      'commit-upload',
      answer({ kind: 'image', widthPixels: 40, heightPixels: 300 }) as never,
    )
    render(<>{handed(shell, subject([png('tall.png', [1])]))}</>)
    await settle()
    media.once('commit-upload', answer({ kind: 'file' }) as never)
    render(
      <>{handed(shell, subject([new File(['%PDF'], 'b.pdf', { type: 'application/pdf' })]))}</>,
    )
    await settle()
    expect(given).toEqual([
      { size: { width: 176, height: 110 } },
      { size: { width: 176, height: 232 } },
      undefined,
    ])
  })

  it('上传中看得到传了多少', async () => {
    const media = fakeMedia(2)
    const gate = Promise.withResolvers<unknown>()
    media.once('append-upload-part', () => undefined)
    media.once('append-upload-part', () => gate.promise)
    const shell = await mounted(media)
    const { subject } = ports()
    render(<>{handed(shell, subject([png('a.png', [1, 2, 3, 4])]))}</>)
    await settle()
    expect(screen.getByText('上传中 50%')).not.toBeNull()
  })

  it('上传失败的写原因，不交给 place；那时它已有结局，done 照样调', async () => {
    const media = fakeMedia(2)
    media.once('begin-upload', () => ({ outcome: 'limited', body: { limit: 2 } }))
    const shell = await mounted(media)
    const { placed, done, subject } = ports()
    render(<>{handed(shell, subject([png('big.png', [1, 2, 3])]))}</>)
    await settle()
    expect(screen.getByText('超过大小上限')).not.toBeNull()
    expect(placed).toEqual([])
    expect(done()).toBe(1)
  })

  it('中途收走：在途的上传停下，之后不再调 place 与 done', async () => {
    const media = fakeMedia(2)
    const gate = Promise.withResolvers<unknown>()
    media.once('append-upload-part', () => gate.promise)
    const shell = await mounted(media)
    const { placed, done, subject } = ports()
    const view = render(<>{handed(shell, subject([png('a.png', [1, 2, 3, 4])]))}</>)
    await settle()
    expect(media.operations()).toEqual(['begin-upload', 'append-upload-part'])
    view.unmount()
    gate.resolve({ outcome: 'succeeded', body: { nextSequence: 1 } })
    await settle()
    expect(media.operations()).toEqual(['begin-upload', 'append-upload-part'])
    expect(placed).toEqual([])
    expect(done()).toBe(0)
  })

  it('宿主重画同一批文件时不重新上传', async () => {
    const media = fakeMedia(2)
    const shell = await mounted(media)
    const { placed, subject } = ports()
    const given = subject([png('a.png', [1, 2, 3])])
    const view = render(<>{handed(shell, given)}</>)
    await settle()
    view.rerender(<>{handed(shell, { ...given })}</>)
    await settle()
    expect(media.operations().filter(name => name === 'begin-upload')).toHaveLength(1)
    expect(placed).toHaveLength(1)
  })
})

describe('画布的两个点', () => {
  it('没交这两个点时照常加载，画布的点上没有媒体的东西', async () => {
    const shell = await mounted(fakeMedia(), false)
    expect(shell.adoption('media-ui')).toMatchObject({ kind: 'adopted' })
    expect(drawn(shell, objectOf(referenceText(ref)))).toBe('generic')
    expect(handed(shell, ports().subject([]))).toBe('generic')
  })

  it('交了时只放种类 media.object 与 files 两个键；纸上的两个部位声明在画布的视图里', async () => {
    const shell = await mounted(fakeMedia())
    expect(
      element.draw(
        shell,
        'canvas.app',
        { reference: objectOf('x'), frame: 'sheet' },
        () => 'generic',
      ),
    ).toBe('generic')
    expect(drawn(shell, objectOf('x'))).not.toBe('generic')
    const read = partsOn(shell.registry())
    const within = (name: string) =>
      read.kind === 'read' ? read.parts.find(part => part.name === name)?.within : undefined
    expect([within('media.object'), within('media.intake')]).toEqual(['canvas.view', 'canvas.view'])
  })
})
