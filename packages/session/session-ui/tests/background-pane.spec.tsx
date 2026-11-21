// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionSide } from '../src/cordis.ts'
import {
  BackgroundCallsStore,
  type BackgroundCallItem,
  type BackgroundCallsView,
} from '../src/model/background-calls.ts'
import { BackgroundHint, BackgroundPane, SideWithBackground } from '../src/view/background-pane.tsx'
import './fixtures/dom.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page } from './fixtures/frames.ts'
import { stubRoom } from './fixtures/room.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const item = (id: string, extra: Partial<BackgroundCallItem> = {}): BackgroundCallItem =>
  ({
    id,
    producer: { kind: 'tool', call: `ref-${id}` },
    label: { intent: '构建前端产物', tool: 'Shell', command: 'execute', preview: 'pnpm build' },
    source: 'threshold',
    status: 'running',
    stop: null,
    lastLine: 'step 3/7',
    ...extra,
  }) as BackgroundCallItem

function storeWith(
  view: BackgroundCallsView,
  answer: Promise<string> = Promise.resolve('已请求停止'),
) {
  const stop = vi.fn(() => answer)
  const store = {
    read: () => view,
    subscribe: () => () => {},
    stop,
  } as unknown as BackgroundCallsStore
  return { store, stop }
}

const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-call="${id}"]`)!
const triggerOf = (id: string) =>
  rowOf(id).querySelector<HTMLElement>('[data-slot="collapsible-trigger"]')!
const detailOf = (id: string) => rowOf(id).querySelector<HTMLElement>('[data-expand-content]')!
const stepsOf = (id: string) =>
  [...rowOf(id).querySelectorAll('dl[aria-label="停止的进度"] .fact-list-row')].map(row => [
    row.querySelector('dt')?.textContent,
    row.querySelector('dd')?.textContent,
  ])

function pane(calls: readonly BackgroundCallItem[], answer?: Promise<string>) {
  const made = storeWith({ kind: 'listed', calls }, answer)
  const detail = vi.fn((call: string) => <i data-testid={`detail-${call}`} />)
  render(<BackgroundPane store={made.store} tenant="t" session="s" detail={detail} />)
  return { ...made, detail }
}

describe('a call in 后台 is one process row (C26)', () => {
  it('the row is the short number in monospace, the intent and a word from the state table', () => {
    pane([item('b1')])
    const trigger = triggerOf('b1')
    expect(trigger.querySelector('.omne-background-call-id')?.textContent).toBe('b1')
    expect(trigger.querySelector('.omne-background-call-intent')?.textContent).toBe('构建前端产物')
    const word = trigger.querySelector('[data-state-word]')
    expect([word?.getAttribute('data-state-word'), word?.textContent]).toEqual([
      'working',
      '处理中',
    ])
  })

  it('every state Tool reports is a word of the table, never one written here', () => {
    const states = ['queued', 'running', 'ended-pending', 'stopping', 'unknown'] as const
    pane(states.map((status, index) => item(`b${index + 1}`, { status })))
    const words = states.map((_, index) =>
      triggerOf(`b${index + 1}`).querySelector('[data-state-word]'),
    )
    expect(words.map(word => word?.getAttribute('data-state-word'))).toEqual([
      'queued',
      'working',
      'ended',
      'working',
      'unknown',
    ])
    expect(words.map(word => word?.textContent)).toEqual([
      '排队中',
      '处理中',
      '已结束',
      '处理中',
      '未确认',
    ])
  })

  it('it unfolds in place: the action, the command and its preview on a code surface, the last line, then the detail', () => {
    const { detail } = pane([item('b1')])
    expect(triggerOf('b1').getAttribute('aria-expanded')).toBe('false')
    expect(detailOf('b1').getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(triggerOf('b1'))
    expect(triggerOf('b1').getAttribute('aria-expanded')).toBe('true')
    const shown = detailOf('b1')
    expect(shown.getAttribute('aria-hidden')).toBeNull()
    const parts = [...shown.querySelector('.omne-background-call-detail')!.children]
    expect(parts.map(part => part.className || part.tagName)).toEqual([
      'omne-background-call-action',
      'code-surface',
      'omne-background-call-last',
      'I',
    ])
    expect(parts[0]?.textContent).toBe('Shell')
    expect(parts[1]?.querySelector('.code-surface-name')?.textContent).toBe('execute')
    expect(parts[1]?.querySelector('pre')?.textContent).toBe('pnpm build')
    expect(parts[2]?.textContent).toBe('step 3/7')
    expect(detail).toHaveBeenCalledWith('ref-b1')
    expect(screen.getByTestId('detail-ref-b1')).toBeTruthy()
  })

  it('with nothing to preview there is no empty surface: the command stays with the tool', () => {
    const label = (command: string | null, preview: string) =>
      ({ intent: '读', tool: 'Files', command, preview }) as BackgroundCallItem['label']
    pane([
      item('b1', { label: label('read', '') }),
      item('b2', { label: label(null, '') }),
      item('b3', { label: label(null, 'a.txt') }),
    ])
    const action = (id: string) =>
      rowOf(id).querySelector('.omne-background-call-action')?.textContent
    expect([action('b1'), action('b2'), action('b3')]).toEqual(['Files read', 'Files', 'Files'])
    expect(rowOf('b1').querySelector('.code-surface')).toBeNull()
    expect(rowOf('b2').querySelector('.code-surface')).toBeNull()
    expect(rowOf('b3').querySelector('.code-surface-name')?.textContent).toBe('预览')
  })

  it('the progress of a stop is a table of three rows; a step reached has words, who stopped is in it', () => {
    const stop = (progress: 'requested' | 'accepted' | 'proven') =>
      ({ initiator: 'user', reason: '不需要了', progress }) as BackgroundCallItem['stop']
    pane([
      item('b1', { stop: stop('requested') }),
      item('b2', { status: 'stopping', stop: stop('accepted') }),
      item('b3', { status: 'stopping', stop: stop('proven') }),
      item('b4', { stop: { initiator: 'agent', reason: null, progress: 'requested' } }),
      item('b5'),
    ])
    expect(stepsOf('b1')).toEqual([
      ['已请求', '你：不需要了'],
      ['已受理', ''],
      ['已证实停下', ''],
    ])
    expect(stepsOf('b2')).toEqual([
      ['已请求', '你：不需要了'],
      ['已受理', '工具'],
      ['已证实停下', ''],
    ])
    expect(stepsOf('b3')).toEqual([
      ['已请求', '你：不需要了'],
      ['已受理', '工具'],
      ['已证实停下', '工具'],
    ])
    expect(stepsOf('b4')[0]).toEqual(['已请求', 'agent'])
    expect(stepsOf('b5')).toEqual([])
    expect(document.querySelector('[role="progressbar"], progress, meter')).toBeNull()
  })

  it('停止 is the one action at the row end, only while no stop is asked and the call has not ended', () => {
    pane([
      item('b1'),
      item('b2', { stop: { initiator: 'user', reason: null, progress: 'requested' } }),
      item('b3', { status: 'ended-pending' }),
    ])
    const actions = (id: string) =>
      within(rowOf(id).querySelector<HTMLElement>('.omne-background-call-row')!)
        .getAllByRole('button')
        .map(button => button.textContent)
    expect(actions('b1')).toEqual(['b1构建前端产物处理中', '停止'])
    expect(actions('b2')).toHaveLength(1)
    expect(actions('b3')).toHaveLength(1)
  })

  it('pressed, 停止 itself shows the wait; the result is written under that row, neutral', async () => {
    let answer: (text: string) => void = () => {}
    const { stop } = pane(
      [item('b1'), item('b2')],
      new Promise<string>(resolve => (answer = resolve)),
    )
    const button = within(rowOf('b1')).getByRole('button', { name: '停止' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.querySelector('[data-loading-indicator]')).not.toBeNull()
    fireEvent.click(button)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledWith('t', 's', expect.objectContaining({ id: 'b1' }))
    await act(async () => answer('停止没有送达：没有权限，或登录已失效。'))
    expect(button.getAttribute('aria-busy')).toBeNull()
    const said = rowOf('b1').querySelector('.omne-background-call-said')
    expect(said?.textContent).toBe('停止没有送达：没有权限，或登录已失效。')
    expect(said?.previousElementSibling?.className).toBe('omne-background-call-row')
    expect(said?.closest('[data-tone]')).toBeNull()
    expect(rowOf('b2').querySelector('.omne-background-call-said')).toBeNull()
  })
})

describe('what a stop that did not land says (C26)', () => {
  it('in words: a refusal gives its reason, a result nobody knows is said as such, no outcome code', async () => {
    const said: string[] = []
    for (const outcome of ['denied', 'unknown', 'basis-unavailable']) {
      const client = {
        'list-background-calls': async () => ({ outcome: 'succeeded', body: { calls: [] } }),
        'stop-call': async () => ({ outcome }),
      }
      const store = new BackgroundCallsStore(client as never, 60_000)
      said.push(await store.stop(TENANT, 'ses_a', item('b1')))
    }
    expect(said).toEqual([
      '停止没有送达：没有权限，或登录已失效。',
      '停止的结果不知道。',
      '停止没有送达：服务端暂时不能处理，稍后再试。',
    ])
  })
})

describe('the 后台 pane while it reads, when it is empty or cannot read (C26)', () => {
  it('reading is the activity mark with its words; empty is the shared empty state', () => {
    render(
      <BackgroundPane
        store={storeWith({ kind: 'unread' }).store}
        tenant="t"
        session="s"
        detail={() => null}
      />,
    )
    const reading = screen.getByRole('status', { name: '正在读后台调用…' })
    expect(reading.querySelector('[data-loading-indicator]')).not.toBeNull()
    cleanup()
    pane([])
    expect(document.querySelector('.empty-state')?.textContent).toBe('没有在后台的调用。')
  })

  it('a list it cannot read is a sentence; the outcome stays in 详情, a refusal is neutral', () => {
    const tones: (string | null)[] = []
    for (const reason of ['basis-unavailable', 'denied']) {
      const away = storeWith({ kind: 'unreadable', reason }).store
      render(<BackgroundPane store={away} tenant="t" session="s" detail={() => null} />)
      const notice = screen.getByText('后台调用现在读不到。').closest('[data-inline-notice]')
      expect(notice?.querySelector('code')?.textContent).toBe(reason)
      expect(screen.queryByText(new RegExp(`读不到：${reason}`))).toBeNull()
      tones.push(notice?.getAttribute('data-tone') ?? null)
      cleanup()
    }
    expect(tones).toEqual(['caution', 'neutral'])
  })
})

describe('the hint above the composer (C26)', () => {
  it('a line of receipt weight, 后台有 n 项在跑, that can be pressed; nothing without calls', () => {
    const two = storeWith({ kind: 'listed', calls: [item('b1'), item('b2')] }).store
    render(<BackgroundHint store={two} tenant="t" session="s" />)
    const hint = screen.getByRole('button', { name: '后台有 2 项在跑' })
    expect(hint.classList.contains('omne-background-hint')).toBe(true)
    cleanup()
    const none = storeWith({ kind: 'listed', calls: [] }).store
    const { container } = render(<BackgroundHint store={none} tenant="t" session="s" />)
    expect(container.textContent).toBe('')
  })
})

describe('the 后台 item of the side area (C26)', () => {
  it('appears after the other entries while calls run in the background, and not otherwise', () => {
    const others = [{ id: 'notes', label: '笔记', node: <p>notes</p> }]
    const running = storeWith({ kind: 'listed', calls: [item('b1'), item('b2')] }).store
    render(
      <SideWithBackground
        entries={others}
        store={running}
        tenant="t"
        session="s"
        detail={() => null}
      />,
    )
    const tab = screen.getByRole('button', { name: /^后台/ })
    expect(tab.closest('[data-slot="segmented"]')).not.toBeNull()
    expect(tab.querySelector('.omne-session-side-label')?.textContent).toBe('后台')
    expect(tab.querySelector('.omne-session-side-number')?.textContent).toBe('2')
    expect(screen.getByRole('button', { name: '笔记' }).textContent).toBe('笔记')
    cleanup()
    render(
      <SideWithBackground
        entries={[]}
        store={running}
        tenant="t"
        session="s"
        detail={() => null}
      />,
    )
    const title = document.querySelector('.omne-session-side-title')
    expect(title?.tagName).toBe('H3')
    expect(title?.querySelector('.omne-session-side-label')?.textContent).toBe('后台')
    expect(title?.querySelector('.omne-session-side-number')?.textContent).toBe('2')
    cleanup()
    const idle = storeWith({ kind: 'listed', calls: [] }).store
    const { container } = render(
      <SideWithBackground entries={[]} store={idle} tenant="t" session="s" detail={() => null} />,
    )
    expect(container.textContent).toBe('')
  })
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** The conversation page with one session open, two calls in its background and a 笔记 entry beside 后台. */
async function openedWithCalls() {
  const fake = createFakeClient()
  const client = {
    ...fake.client,
    'list-background-calls': async () => ({
      outcome: 'succeeded',
      body: { calls: [item('b1'), item('b2')] },
    }),
  } as unknown as FakeClient['client']
  const { root } = await mountModule(client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([assistantEntry('1', '1', '好的')], '1'),
  })
  await settle()
  const fiber = root.plugin({
    name: 'notes',
    inject: ['shell'],
    apply: (ctx: Context) =>
      sessionSide.contribute(ctx.shell, {
        id: 'notes',
        order: 0,
        label: '笔记',
        render: () => <p data-testid="notes">notes</p>,
      }),
  })
  await act(async () => {
    await fiber
  })
  await settle()
}

const side = () => document.querySelector<HTMLElement>('.omne-session-side')
const hint = () => screen.getByRole('button', { name: '后台有 2 项在跑' })
const chosenPane = () =>
  side()?.querySelector<HTMLElement>('[data-side-pane]:not([hidden])')?.dataset['sidePane']

const BOXES = new Map([
  ['.omne-session-bar', { left: 240, top: 0, width: 900, height: 64 }],
  ['[data-figure-seat="header"]', { left: 674, top: 16, width: 32, height: 32 }],
])

describe('pressing the hint opens the side area on 后台 (C26)', () => {
  it('docked and folded, with another tab chosen: the side area unfolds with 后台 chosen', async () => {
    stubRoom(1440)
    await openedWithCalls()
    expect(side()?.dataset['presentation']).toBe('docked')
    fireEvent.click(screen.getByRole('button', { name: '笔记' }))
    fireEvent.click(screen.getByRole('button', { name: '收起侧边区' }))
    expect(side()?.dataset['open']).toBe('false')
    expect(chosenPane()).toBe('notes')
    fireEvent.click(hint(), { detail: 1 })
    expect(side()?.dataset['open']).toBe('true')
    expect(chosenPane()).toBe('background-calls')
    expect(hint().getAttribute('aria-controls')).toBe(side()?.id)
  })

  it('narrow: the light ink bubble opens on 后台, and the tab stays chosen when it docks again', async () => {
    const room = stubRoom(1100, BOXES)
    await openedWithCalls()
    expect(side()).toBeNull()
    fireEvent.click(hint(), { detail: 1 })
    expect(side()?.dataset['presentation']).toBe('bubble')
    expect(chosenPane()).toBe('background-calls')
    act(() => room.resize(1440))
    expect(side()?.dataset['presentation']).toBe('docked')
    expect(chosenPane()).toBe('background-calls')
  })

  it('pressed from the keyboard, the bubble takes the focus; from the pointer, it does not', async () => {
    stubRoom(1100, BOXES)
    await openedWithCalls()
    const frame = async () =>
      act(async () => {
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
      })
    fireEvent.click(hint(), { detail: 1 })
    await frame()
    expect(side()?.contains(document.activeElement)).toBe(false)
    fireEvent.keyDown(side()!, { key: 'Escape' })
    fireEvent.click(hint(), { detail: 0 })
    await frame()
    expect(document.activeElement).toBe(side()?.querySelector('[data-initial-focus]'))
  })
})
