// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
  RedrawProvider,
  SayBubble,
  type Redraw,
  type SayControl,
  type SayInside,
} from '../src/index.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { besideSpot, NOTE_GAP, NOTE_WIDTH, REPLY_HEIGHT, type SayNote } from '../src/ink/say.ts'
import { type Box } from '../src/ink/travel.ts'

const STYLES = readFileSync(join(import.meta.dirname, '../src/ink/ink.css'), 'utf8')
const FIGURE: Box = { x: 272, y: 172, width: 56, height: 56 }
const BOUNDS: Box = { x: 0, y: 0, width: 1200, height: 800 }
const TARGETS = [
  { id: 'new', name: '新会话' },
  { id: 's1', name: '周报' },
]
let height = 120

function boxed(left: number, top: number, width: number, tall: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height: tall,
    right: left + width,
    bottom: top + tall,
    toJSON: () => ({}),
  }
}

function frameClock(): (ms: number) => void {
  let frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next += 1
    frames.set(next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  inkClock.use(() => Date.now())
  casual.use(() => 0.5)
  return ms =>
    act(() => {
      for (let i = 0; i < ms; i += 1) {
        vi.advanceTimersByTime(1)
        const due = frames
        frames = new Map()
        for (const callback of due.values()) callback(Date.now())
      }
    })
}

type Props = ComponentProps<typeof SayBubble>

interface Told {
  readonly onTarget: Mock<Props['onTarget']>
  readonly onText: Mock<Props['onText']>
  readonly onSend: Mock<Props['onSend']>
  readonly onClose: Mock<Props['onClose']>
  readonly onOpen: Mock<Props['onOpen']>
}

function told(): Told {
  return {
    onTarget: vi.fn<Props['onTarget']>(),
    onText: vi.fn<Props['onText']>(),
    onSend: vi.fn<Props['onSend']>(),
    onClose: vi.fn<Props['onClose']>(),
    onOpen: vi.fn<Props['onOpen']>(),
  }
}

const NOTE: SayNote = { targets: TARGETS, target: 'new', text: '' }

function open(
  note: SayNote | null,
  more: Partial<Props> = {},
): { readonly told: Told; readonly again: (note: SayNote | null, more?: Partial<Props>) => void } {
  const hands = told()
  const props = (next: SayNote | null, extra: Partial<Props>): Props => ({
    note: next,
    figure: FIGURE,
    bounds: BOUNDS,
    ...hands,
    ...extra,
  })
  const view = render(<SayBubble {...props(note, more)} />)
  return {
    told: hands,
    again: (next, extra = more) => view.rerender(<SayBubble {...props(next, extra)} />),
  }
}

const bubble = (): HTMLElement | null => document.querySelector('.omne-say-bubble')
const field = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: '说一句话' })
const sendButton = (): HTMLButtonElement => screen.getByRole('button', { name: '发送' })
const line = (): HTMLElement => screen.getByRole('status')
const goTo = (): HTMLElement | null => screen.queryByRole('button', { name: '去对话页' })

function key(target: Element, init: KeyboardEventInit & { keyCode?: number }): boolean {
  let passed = true
  act(() => {
    passed = fireEvent.keyDown(target, init)
  })
  return passed
}

beforeEach(() => {
  height = 120
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('omne-say-bubble') ? height : 0
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.classList.contains('omne-say-bubble')) return boxed(0, 0, 0, 0)
    return boxed(
      Number.parseFloat(this.style.left),
      Number.parseFloat(this.style.top),
      NOTE_WIDTH,
      height,
    )
  })
})

afterEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  cleanup()
  document.body.innerHTML = ''
  casual.use(null)
  inkClock.use(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('saying a line from the keys', () => {
  it('Enter sends the words to the chosen one, once', () => {
    frameClock()
    const { told: hands } = open({ ...NOTE, text: '帮我看一下周报' })
    expect(key(field(), { key: 'Enter' })).toBe(false)
    expect(hands.onSend).toHaveBeenCalledTimes(1)
    expect(hands.onSend).toHaveBeenCalledWith({ text: '帮我看一下周报', target: 'new' })
  })

  it('Shift and Enter is a new line, not a send', () => {
    frameClock()
    const { told: hands } = open({ ...NOTE, text: '第一行' })
    expect(key(field(), { key: 'Enter', shiftKey: true })).toBe(true)
    expect(hands.onSend).not.toHaveBeenCalled()
  })

  it('Enter while the input method is composing does not send', () => {
    frameClock()
    const { told: hands } = open({ ...NOTE, text: 'zhou' })
    expect(key(field(), { key: 'Enter', isComposing: true })).toBe(true)
    expect(key(field(), { key: 'Enter', keyCode: 229 })).toBe(true)
    expect(hands.onSend).not.toHaveBeenCalled()
  })

  it('with no words, Enter sends nothing and the send button cannot be pressed', () => {
    frameClock()
    const { told: hands, again } = open(NOTE)
    key(field(), { key: 'Enter' })
    expect(sendButton().disabled).toBe(true)
    again({ ...NOTE, text: '  \n ' })
    key(field(), { key: 'Enter' })
    expect(sendButton().disabled).toBe(true)
    expect(hands.onSend).not.toHaveBeenCalled()
  })

  it('Escape closes it, but not while composing', () => {
    frameClock()
    const { told: hands } = open({ ...NOTE, text: '还没写完' })
    key(field(), { key: 'Escape', isComposing: true })
    expect(hands.onClose).not.toHaveBeenCalled()
    key(field(), { key: 'Escape' })
    expect(hands.onClose).toHaveBeenCalledTimes(1)
  })

  it('typing tells the words, and the buttons send and close', () => {
    frameClock()
    const { told: hands } = open({ ...NOTE, text: '在吗' })
    act(() => {
      fireEvent.change(field(), { target: { value: '在吗？' } })
    })
    expect(hands.onText).toHaveBeenCalledWith('在吗？')
    act(() => sendButton().click())
    expect(hands.onSend).toHaveBeenCalledWith({ text: '在吗', target: 'new' })
    act(() => screen.getByRole('button', { name: '收起' }).click())
    expect(hands.onClose).toHaveBeenCalledTimes(1)
  })
})

describe('losing the focus', () => {
  it('with no words it closes; with words it stays', () => {
    frameClock()
    const outside = document.createElement('button')
    document.body.append(outside)
    const { told: hands, again } = open({ ...NOTE, text: '留着' })
    act(() => {
      fireEvent.blur(field(), { relatedTarget: outside })
    })
    expect(hands.onClose).not.toHaveBeenCalled()
    again(NOTE)
    act(() => {
      fireEvent.blur(field(), { relatedTarget: null })
    })
    expect(hands.onClose).toHaveBeenCalledTimes(1)
  })

  it('moving to its own buttons is not losing it', () => {
    frameClock()
    const { told: hands } = open(NOTE)
    act(() => {
      fireEvent.blur(field(), { relatedTarget: screen.getByRole('button', { name: '收起' }) })
    })
    expect(hands.onClose).not.toHaveBeenCalled()
  })
})

describe('what the line says', () => {
  it('when who it can say to cannot be read: it says so and does not send', () => {
    frameClock()
    const { told: hands } = open({ targets: undefined, target: undefined, text: '有字' })
    expect(line().textContent).toBe('现在读不到可以说给谁')
    expect(sendButton().disabled).toBe(true)
    key(field(), { key: 'Enter' })
    expect(hands.onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: '说给谁' })).toHaveProperty('disabled', true)
  })

  it('while it is being sent, it is not sent again', () => {
    frameClock()
    const { told: hands } = open({ ...NOTE, text: '一句', fate: { kind: 'sending' } })
    expect(sendButton().disabled).toBe(true)
    key(field(), { key: 'Enter' })
    expect(hands.onSend).not.toHaveBeenCalled()
    expect(line().textContent).toBe('')
  })

  it('accepted: 已发送, with a button to the conversation', () => {
    frameClock()
    const { told: hands } = open({ ...NOTE, fate: { kind: 'accepted' } })
    expect(line().textContent).toBe('已发送')
    expect(line().dataset['tone']).toBe('quiet')
    const button = goTo()
    expect(button).not.toBeNull()
    act(() => button?.click())
    expect(hands.onOpen).toHaveBeenCalledTimes(1)
  })

  it('not sent: says why in the failed tone and keeps the words', () => {
    frameClock()
    open({ ...NOTE, text: '再试一次', fate: { kind: 'failed', reason: '服务端拒绝了' } })
    expect(line().textContent).toBe('没有发出去：服务端拒绝了')
    expect(line().dataset['tone']).toBe('failed')
    expect(field().value).toBe('再试一次')
    expect(sendButton().disabled).toBe(false)
    expect(goTo()).toBeNull()
  })

  it('not known: says so in a neutral tone', () => {
    frameClock()
    open({ ...NOTE, fate: { kind: 'unknown' } })
    expect(line().textContent).toBe('不知道有没有发出去，到对话页看一下')
    expect(line().dataset['tone']).toBe('quiet')
    expect(goTo()).toBeNull()
  })

  it('says who it goes to', () => {
    frameClock()
    open({ ...NOTE, target: 's1' })
    expect(screen.getByRole('combobox', { name: '说给谁' }).textContent).toContain('周报')
  })
})

describe('where it opens', () => {
  const centre = { x: FIGURE.x + FIGURE.width / 2, y: FIGURE.y + FIGURE.height / 2 }
  const size = { width: NOTE_WIDTH, height: 120 }
  const room = (x: number, y: number, width: number, tall: number): Box => ({
    x,
    y,
    width,
    height: tall,
  })

  it('takes the first of four spots that lies wholly in the bounds, right and below first', () => {
    expect(besideSpot(FIGURE, size, BOUNDS)).toEqual({
      left: centre.x + NOTE_GAP.x,
      top: centre.y + NOTE_GAP.y,
    })
    expect(besideSpot(FIGURE, size, room(-400, 0, centre.x + 600, 800))).toEqual({
      left: centre.x - NOTE_GAP.x - NOTE_WIDTH,
      top: centre.y + NOTE_GAP.y,
    })
    expect(besideSpot(FIGURE, size, room(0, -400, 1200, centre.y + 460))).toEqual({
      left: centre.x + NOTE_GAP.x,
      top: centre.y - NOTE_GAP.y - 120,
    })
    expect(besideSpot(FIGURE, size, room(-400, -400, centre.x + 600, centre.y + 460))).toEqual({
      left: centre.x - NOTE_GAP.x - NOTE_WIDTH,
      top: centre.y - NOTE_GAP.y - 120,
    })
  })

  it('where none fits, takes the one that leaves the bounds least and pushes it back in', () => {
    const bounds = room(0, 0, centre.x + 300, centre.y + 100)
    expect(besideSpot(FIGURE, size, bounds)).toEqual({
      left: bounds.width - NOTE_WIDTH,
      top: centre.y - NOTE_GAP.y - 120,
    })
  })

  it('opens where it chose, with the field in focus, and stays there as the words grow', () => {
    frameClock()
    const { again } = open({ ...NOTE, text: '短' })
    const placed = bubble()
    expect(placed?.style.left).toBe(`${centre.x + NOTE_GAP.x}px`)
    expect(placed?.style.top).toBe(`${centre.y + NOTE_GAP.y}px`)
    expect(placed?.style.width).toBe(`${NOTE_WIDTH}px`)
    expect(document.activeElement).toBe(field())
    height = 700
    again({ ...NOTE, text: '很长的一段话\n'.repeat(30) })
    expect(bubble()?.style.left).toBe(`${centre.x + NOTE_GAP.x}px`)
    expect(bubble()?.style.top).toBe(`${centre.y + NOTE_GAP.y}px`)
  })
})

describe('its ink', () => {
  it('is written, in the light ink', () => {
    frameClock()
    open(NOTE)
    expect(bubble()?.dataset['ink']).toBe('writing')
    expect(bubble()?.dataset['inkStrength']).toBe('light')
  })

  it('under reduced motion it is not written: it is there at once, and gone at once', () => {
    frameClock()
    const { again } = open(NOTE, { reduced: true })
    expect(bubble()?.dataset['ink']).toBe('open')
    again(null)
    expect(bubble()).toBeNull()
  })

  it('closing, it stays inert while its ink goes back, then it is gone', () => {
    const wait = frameClock()
    const { again } = open(NOTE)
    wait(1200)
    again(null)
    expect(bubble()?.hasAttribute('inert')).toBe(true)
    wait(2000)
    expect(bubble()).toBeNull()
  })
})

describe('the pictures in it (C5)', () => {
  const PICTURES = [
    { name: '窗口', bytes: new Uint8Array([1, 2, 3]) },
    { name: '近看', bytes: new Uint8Array([4, 5, 6]).buffer },
  ]
  const WITH: SayNote = { ...NOTE, pictures: PICTURES }

  function urls(): { readonly made: string[]; readonly revoked: string[] } {
    const made: string[] = []
    const revoked: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      made.push(`blob:picture-${made.length}`)
      return made.at(-1)!
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => {
      revoked.push(url)
    })
    return { made, revoked }
  }

  const thumbs = (): HTMLImageElement[] => [
    ...document.querySelectorAll<HTMLImageElement>('.omne-say-thumb'),
  ]

  it('shows each picture as a small one above the rest, by its name', () => {
    frameClock()
    const { made } = urls()
    open(WITH)
    expect(thumbs().map(img => [img.alt, img.src])).toEqual([
      ['窗口', made[0]],
      ['近看', made[1]],
    ])
    const strip = document.querySelector('.omne-say-pictures')
    expect(strip?.compareDocumentPosition(field()) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('with no pictures it has no strip', () => {
    frameClock()
    open(NOTE)
    expect(document.querySelector('.omne-say-pictures')).toBeNull()
  })

  it('each picture can be taken out: its button tells which one', () => {
    frameClock()
    urls()
    const onDropPicture = vi.fn()
    open(WITH, { onDropPicture })
    act(() => screen.getByRole('button', { name: '去掉近看' }).click())
    expect(onDropPicture).toHaveBeenCalledWith(1)
    act(() => screen.getByRole('button', { name: '去掉窗口' }).click())
    expect(onDropPicture).toHaveBeenLastCalledWith(0)
  })

  it('lets go of the small pictures when they change and when it is gone', () => {
    frameClock()
    const { made, revoked } = urls()
    const { again } = open(WITH, { reduced: true })
    again({ ...WITH, pictures: PICTURES.slice(1) }, { reduced: true })
    expect(revoked).toEqual(made.slice(0, 2))
    expect(thumbs().map(img => img.src)).toEqual([made[2]])
    again(null, { reduced: true })
    expect(revoked).toEqual(made)
  })

  it('with pictures and no words it can be sent, with no words', () => {
    frameClock()
    urls()
    const { told: hands } = open(WITH)
    expect(sendButton().disabled).toBe(false)
    key(field(), { key: 'Enter' })
    expect(hands.onSend).toHaveBeenCalledWith({ text: '', target: 'new' })
  })

  it('with pictures it cannot send and no words it cannot be sent', () => {
    frameClock()
    urls()
    const { told: hands } = open({ ...WITH, told: { kind: 'cannot-send-pictures' } })
    expect(sendButton().disabled).toBe(true)
    key(field(), { key: 'Enter' })
    expect(hands.onSend).not.toHaveBeenCalled()
  })

  it('with pictures and no words it stays when the focus goes elsewhere', () => {
    frameClock()
    urls()
    const { told: hands } = open(WITH)
    act(() => {
      fireEvent.blur(field(), { relatedTarget: null })
    })
    expect(hands.onClose).not.toHaveBeenCalled()
  })
})

describe('what it tells about the window (C5)', () => {
  it('without leave to read the screen: says so, with a button to the system settings', () => {
    frameClock()
    const onSettings = vi.fn()
    open({ ...NOTE, told: { kind: 'not-authorized' } }, { onSettings })
    expect(line().textContent).toBe('需要在系统设置里允许 omne 录制屏幕，才能看这个窗口')
    expect(line().dataset['tone']).toBe('quiet')
    act(() => screen.getByRole('button', { name: '打开系统设置' }).click())
    expect(onSettings).toHaveBeenCalledTimes(1)
  })

  it('when pictures cannot be sent: 现在发不了图, and no settings button', () => {
    frameClock()
    open({ ...NOTE, told: { kind: 'cannot-send-pictures' } })
    expect(line().textContent).toBe('现在发不了图')
    expect(screen.queryByRole('button', { name: '打开系统设置' })).toBeNull()
  })

  it('when the window could not be read: says why', () => {
    frameClock()
    open({ ...NOTE, told: { kind: 'not-seen', reason: '窗口已经关了' } })
    expect(line().textContent).toBe('没能看这个窗口：窗口已经关了')
    expect(line().dataset['tone']).toBe('failed')
  })

  it('once a line has a fate, the fate is what it says', () => {
    frameClock()
    open({ ...NOTE, told: { kind: 'cannot-send-pictures' }, fate: { kind: 'accepted' } })
    expect(line().textContent).toBe('已发送')
  })
})

const ACCEPTED: SayNote = { ...NOTE, fate: { kind: 'accepted' } }
const reply = (): HTMLElement | null => screen.queryByRole('log')

function cssRule(selector: string): string {
  const start = STYLES.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`ink.css has no rule ${selector}`)
  return STYLES.slice(start, STYLES.indexOf('}', start))
}

describe('what the agent says back (C3)', () => {
  it('with none given, or none said yet, there is no reply: only 已发送', () => {
    frameClock()
    const { again } = open(ACCEPTED)
    expect(reply()).toBeNull()
    again({ ...ACCEPTED, reply: { text: '', state: 'coming' } })
    expect(reply()).toBeNull()
    expect(line().textContent).toBe('已发送')
  })

  it('ended with nothing said: there is no reply, only 已发送', () => {
    frameClock()
    open({ ...ACCEPTED, reply: { text: '', state: 'ended' } })
    expect(reply()).toBeNull()
    expect(line().textContent).toBe('已发送')
  })

  it('not known with nothing said: only the neutral line', () => {
    frameClock()
    open({ ...ACCEPTED, reply: { text: '', state: 'unknown' } })
    expect(reply()?.textContent).toBe('不知道它后来怎样了，到对话页看一下')
    expect(reply()?.querySelector('.omne-say-reply-text')).toBeNull()
  })

  it('before the line is accepted there is no reply', () => {
    frameClock()
    open({
      ...NOTE,
      text: '一句',
      fate: { kind: 'sending' },
      reply: { text: '旧的', state: 'ended' },
    })
    expect(reply()).toBeNull()
  })

  it('writes the words as they are: the lines kept, nothing read as Markdown or markup', () => {
    frameClock()
    const text = '**不是粗体**\n<b>不是标签</b>\n第三行'
    open({ ...ACCEPTED, reply: { text, state: 'ended' } })
    expect(reply()?.textContent).toBe(text)
    expect(reply()?.querySelector('b, strong, em')).toBeNull()
    expect(cssRule('.omne-say-reply')).toMatch(/white-space: pre-wrap/)
  })

  it('still coming: it is busy, and says nothing of its own', () => {
    frameClock()
    open({ ...ACCEPTED, reply: { text: '我先看', state: 'coming' } })
    expect(reply()?.getAttribute('aria-busy')).toBe('true')
    expect(reply()?.textContent).toBe('我先看')
  })

  it('ended: it is not busy, and says nothing of its own', () => {
    frameClock()
    open({ ...ACCEPTED, reply: { text: '看完了', state: 'ended' } })
    expect(reply()?.getAttribute('aria-busy')).toBe('false')
    expect(reply()?.textContent).toBe('看完了')
  })

  it('not known: the words so far stay, and a neutral line says it is not known', () => {
    frameClock()
    const { again } = open({ ...ACCEPTED, reply: { text: '先看了一半', state: 'coming' } })
    again({ ...ACCEPTED, reply: { text: '先看了一半', state: 'unknown' } })
    expect(reply()?.getAttribute('aria-busy')).toBe('false')
    expect(reply()?.textContent).toBe('先看了一半不知道它后来怎样了，到对话页看一下')
    again({ ...ACCEPTED, reply: { text: '', state: 'unknown' } })
    expect(reply()?.textContent).toBe('不知道它后来怎样了，到对话页看一下')
  })

  it('when the caller says there is more, it ends with 后面的在对话页', () => {
    frameClock()
    const { again } = open({ ...ACCEPTED, reply: { text: '前面', state: 'ended', more: false } })
    expect(reply()?.textContent).toBe('前面')
    again({ ...ACCEPTED, reply: { text: '前面', state: 'ended', more: true } })
    expect(reply()?.textContent).toBe('前面后面的在对话页')
  })

  it('is at most 240 high and scrolls in itself', () => {
    frameClock()
    open({ ...ACCEPTED, reply: { text: '一句', state: 'ended' } })
    expect(reply()?.style.maxHeight).toBe(`${REPLY_HEIGHT}px`)
    expect(cssRule('.omne-say-reply')).toMatch(/overflow-y: auto/)
  })

  it('stays at the end as the words grow; scrolled up, it stays where it was left', () => {
    frameClock()
    let tall = 100
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('omne-say-reply') ? tall : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('omne-say-reply') ? Math.min(tall, REPLY_HEIGHT) : 0
    })
    const { again } = open({ ...ACCEPTED, reply: { text: '一', state: 'coming' } })
    const said = (text: string, grown: number): void => {
      tall = grown
      again({ ...ACCEPTED, reply: { text, state: 'coming' } })
    }
    const box = reply()!
    said('一二', 600)
    expect(box.scrollTop).toBe(600)
    box.scrollTop = 100
    fireEvent.scroll(box)
    said('一二三', 900)
    expect(box.scrollTop).toBe(100)
    box.scrollTop = 900 - REPLY_HEIGHT
    fireEvent.scroll(box)
    said('一二三四', 1200)
    expect(box.scrollTop).toBe(1200)
  })

  it('its closing words can be told', () => {
    frameClock()
    open(
      { ...ACCEPTED, reply: { text: '', state: 'unknown', more: true } },
      { words: { replyUnknown: 'unknown', replyMore: 'more' } },
    )
    expect(reply()?.textContent).toBe('unknownmore')
  })
})

describe('the ready lines beside it (C3)', () => {
  const PICTURES = [{ name: '窗口', bytes: new Uint8Array([1, 2, 3]) }]
  const PHRASES = ['一', '二', '三', '四', '五', '六'].map((label, n) => ({
    key: `k${n + 1}`,
    label: `第${label}句`,
  }))
  const WITH: SayNote = { ...NOTE, pictures: PICTURES, phrases: PHRASES }
  const shown = (): string[] =>
    [...document.querySelectorAll('.omne-say-phrases button')].map(button => button.textContent)

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
  })

  it('with no pictures there are none', () => {
    frameClock()
    open({ ...NOTE, phrases: PHRASES })
    expect(document.querySelector('.omne-say-phrases')).toBeNull()
  })

  it('with pictures and none given there are none', () => {
    frameClock()
    const { again } = open({ ...NOTE, pictures: PICTURES })
    expect(document.querySelector('.omne-say-phrases')).toBeNull()
    again({ ...NOTE, pictures: PICTURES, phrases: [] })
    expect(document.querySelector('.omne-say-phrases')).toBeNull()
  })

  it('given six, it shows the first four, in order', () => {
    frameClock()
    open(WITH)
    expect(shown()).toEqual(['第一句', '第二句', '第三句', '第四句'])
  })

  it('pressing one tells its key', () => {
    frameClock()
    const onPhrase = vi.fn()
    open(WITH, { onPhrase })
    act(() => screen.getByRole('button', { name: '第二句' }).click())
    expect(onPhrase).toHaveBeenCalledExactlyOnceWith('k2')
  })

  it('they are not inside the frame of words: they stand beside it, away from the figure', () => {
    frameClock()
    open(WITH)
    const column = document.querySelector<HTMLElement>('.omne-say-phrases')
    expect(column?.dataset['side']).toBe('right')
    expect(cssRule('.omne-say-phrases')).toMatch(/position: absolute/)
  })

  it('while the line is sent, they cannot be pressed and the words cannot be changed', () => {
    frameClock()
    const onPhrase = vi.fn()
    const { again } = open(WITH, { onPhrase })
    expect(field().readOnly).toBe(false)
    again({ ...WITH, fate: { kind: 'sending' } }, { onPhrase })
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.omne-say-phrases button')]
    expect(buttons.map(button => button.disabled)).toEqual([true, true, true, true])
    act(() => buttons[0]?.click())
    expect(onPhrase).not.toHaveBeenCalled()
    expect(field().readOnly).toBe(true)
  })

  it('its reach holds the frame and the lines beside it', () => {
    frameClock()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('omne-say-phrases')) return boxed(710, 150, 120, 200)
      if (this.classList.contains('omne-say-bubble')) return boxed(322, 211, NOTE_WIDTH, height)
      return boxed(0, 0, 0, 0)
    })
    const control = createRef<SayControl>()
    const { again } = open(WITH, { control })
    expect(control.current?.reach()).toEqual({ x: 322, y: 150, width: 508, height: 200 })
    again(NOTE, { control })
    expect(control.current?.reach()).toEqual({ x: 322, y: 211, width: NOTE_WIDTH, height })
  })

  it('has no reach while it is not open', () => {
    frameClock()
    const control = createRef<SayControl>()
    open(null, { control })
    expect(control.current?.reach()).toBeNull()
  })
})

describe('the inside of the frame, drawn by a redraw (C3)', () => {
  type Hands = Told & {
    readonly onPhrase: Mock<(key: string) => void>
    readonly onDropPicture: Mock<(index: number) => void>
    readonly onSettings: Mock<() => void>
  }

  function drawn(
    redraw: Redraw | null,
    note: SayNote,
  ): { readonly hands: Hands; readonly again: (note: SayNote) => void } {
    const hands: Hands = {
      ...told(),
      onPhrase: vi.fn(),
      onDropPicture: vi.fn(),
      onSettings: vi.fn(),
    }
    const tree = (next: SayNote): React.JSX.Element => {
      const bubble = <SayBubble note={next} figure={FIGURE} bounds={BOUNDS} reduced {...hands} />
      return redraw === null ? bubble : <RedrawProvider value={redraw}>{bubble}</RedrawProvider>
    }
    const view = render(tree(note))
    return { hands, again: next => view.rerender(tree(next)) }
  }

  const skin: Redraw = (_kind, key, subject, builtIn) => {
    if (key !== 'note') return builtIn()
    const { note, act: does } = subject as SayInside
    return (
      <textarea
        aria-label="皮"
        value={note.text}
        onChange={event => does.write(event.target.value)}
      />
    )
  }

  const FRAME = ['omne-ink-bubble-paper', 'omne-ink-bubble-edge', 'omne-ink-bubble-wet']
  const inside = (): string =>
    [...(bubble()?.children ?? [])]
      .filter(child => !FRAME.some(part => child.classList.contains(part)))
      .map(child => child.outerHTML)
      .join('')

  it('with no redraw, or one that gives back its own drawing, the inside is the same', () => {
    frameClock()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const note: SayNote = {
      ...ACCEPTED,
      text: '在吗',
      pictures: [{ name: '窗口', bytes: new Uint8Array([1]) }],
      phrases: [{ key: 'k1', label: '看看这个' }],
      reply: { text: '在', state: 'ended', more: true },
    }
    drawn(null, note)
    const plain = inside()
    expect(plain).toContain('看看这个')
    cleanup()
    drawn((_kind, _key, _subject, builtIn) => builtIn(), note)
    expect(inside()).toBe(plain)
  })

  it('asks for the piece note, told the note and what it can do; the frame stays its own', () => {
    frameClock()
    const seen: unknown[] = []
    const redraw: Redraw = (kind, key, subject) => {
      seen.push({ kind, key })
      if (key === 'note') {
        const { note, act: does } = subject as SayInside
        expect(Object.keys(note).sort()).toEqual(
          ['fate', 'phrases', 'pictures', 'reply', 'target', 'targets', 'text', 'told'].sort(),
        )
        expect(Object.keys(does).sort()).toEqual(
          ['choose', 'close', 'drop', 'open', 'phrase', 'send', 'settings', 'write'].sort(),
        )
        expect(note.text).toBe('在吗')
      }
      return <i data-redrawn={key} />
    }
    drawn(redraw, { ...NOTE, text: '在吗' })
    expect(seen).toContainEqual({ kind: 'piece', key: 'note' })
    expect(bubble()?.querySelector('[data-redrawn="note"]')).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: '说一句话' })).toBeNull()
    expect(bubble()?.dataset['inkStrength']).toBe('light')
  })

  it('each thing it can do reaches the caller', () => {
    frameClock()
    let does: SayInside['act'] | undefined
    const redraw: Redraw = (_kind, key, subject, builtIn) => {
      if (key !== 'note') return builtIn()
      does = (subject as SayInside).act
      return <i />
    }
    const { hands } = drawn(redraw, { ...NOTE, text: '在吗' })
    act(() => {
      does?.write('在吗？')
      does?.choose('s1')
      does?.send()
      does?.phrase('k1')
      does?.drop(1)
      does?.open()
      does?.close()
      does?.settings()
    })
    expect(hands.onText).toHaveBeenCalledExactlyOnceWith('在吗？')
    expect(hands.onTarget).toHaveBeenCalledExactlyOnceWith('s1')
    expect(hands.onSend).toHaveBeenCalledExactlyOnceWith({ text: '在吗', target: 'new' })
    expect(hands.onPhrase).toHaveBeenCalledExactlyOnceWith('k1')
    expect(hands.onDropPicture).toHaveBeenCalledExactlyOnceWith(1)
    expect(hands.onOpen).toHaveBeenCalledTimes(1)
    expect(hands.onClose).toHaveBeenCalledTimes(1)
    expect(hands.onSettings).toHaveBeenCalledTimes(1)
  })

  it('keeps no words of its own: the words drawn follow what the caller gives', () => {
    frameClock()
    const { hands, again } = drawn(skin, { ...NOTE, text: '一' })
    const drawnField = screen.getByRole('textbox', { name: '皮' }) as HTMLTextAreaElement
    act(() => {
      fireEvent.change(drawnField, { target: { value: '一二' } })
    })
    expect(hands.onText).toHaveBeenCalledWith('一二')
    again({ ...NOTE, text: '别的' })
    expect(drawnField.value).toBe('别的')
  })

  it('the built-in field follows what the caller gives, too', () => {
    frameClock()
    const { again } = drawn(null, { ...NOTE, text: '一' })
    again({ ...NOTE, text: '别的' })
    expect(field().value).toBe('别的')
  })

  it('with a redraw, the frame still puts the focus in and closes on Escape', () => {
    frameClock()
    const { hands } = drawn(skin, { ...NOTE, text: '一' })
    const drawnField = screen.getByRole('textbox', { name: '皮' })
    expect(document.activeElement).toBe(drawnField)
    key(drawnField, { key: 'Escape' })
    expect(hands.onClose).toHaveBeenCalledTimes(1)
  })
})
