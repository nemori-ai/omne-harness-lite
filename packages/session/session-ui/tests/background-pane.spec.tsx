// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  statusText,
  stopText,
  type BackgroundCallItem,
  type BackgroundCallsStore,
  type BackgroundCallsView,
} from '../src/model/background-calls.ts'
import { BackgroundHint, BackgroundPane } from '../src/view/background-pane.tsx'

afterEach(cleanup)

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

function storeWith(view: BackgroundCallsView) {
  const stop = vi.fn(async () => '已请求停止')
  const store = {
    read: () => view,
    subscribe: () => () => {},
    stop,
  } as unknown as BackgroundCallsStore
  return { store, stop }
}

describe('the words of a call in the background (C26, I-3)', () => {
  it('names each state; a state Tool cannot give reads unknown', () => {
    const states = ['queued', 'running', 'ended-pending', 'stopping', 'unknown'] as const
    expect(states.map(status => statusText(item('b1', { status })))).toEqual([
      '排队中',
      '在跑',
      '已结束，结局在路上',
      '停止中',
      '状态未知',
    ])
  })

  it('keeps the three steps of a stop apart, never one merged stopped', () => {
    const stop = (progress: 'requested' | 'accepted' | 'proven', initiator = 'user') =>
      stopText(item('b1', { stop: { initiator, reason: '不需要了', progress } as never }))
    expect([
      stop('requested'),
      stop('accepted'),
      stop('proven'),
      stop('requested', 'agent'),
    ]).toEqual([
      '你已请求停止：不需要了',
      '停止已受理：不需要了',
      '已证实停下：不需要了',
      'agent已请求停止：不需要了',
    ])
    expect(stopText(item('b1'))).toBeNull()
  })
})

describe('the 后台 pane and the hint above the composer (C26)', () => {
  it('lists each call with its short id, state, intent, action and last line, and its detail', () => {
    const { store } = storeWith({
      kind: 'listed',
      calls: [
        item('b1'),
        item('b2', {
          status: 'stopping',
          stop: { initiator: 'user', reason: null, progress: 'accepted' },
        }),
      ],
    })
    const detail = vi.fn((call: string) => <i data-testid={`detail-${call}`} />)
    render(<BackgroundPane store={store} tenant="t" session="s" detail={detail} />)
    expect(screen.getByText('b1')).toBeTruthy()
    expect(screen.getAllByText('构建前端产物')).toHaveLength(2)
    expect(screen.getAllByText('Shell execute · pnpm build')).toHaveLength(2)
    expect(screen.getByText('停止已受理')).toBeTruthy()
    expect(screen.getAllByText('step 3/7')).toHaveLength(2)
    expect(screen.getByTestId('detail-ref-b1')).toBeTruthy()
    expect(detail).toHaveBeenCalledWith('ref-b2')
    expect(screen.getAllByRole('button', { name: '停止' })).toHaveLength(1)
  })

  it('a stop goes to Session for that call', async () => {
    const { store, stop } = storeWith({ kind: 'listed', calls: [item('b1')] })
    render(<BackgroundPane store={store} tenant="t" session="s" detail={() => null} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '停止' })))
    expect(stop).toHaveBeenCalledWith('t', 's', expect.objectContaining({ id: 'b1' }))
    expect(await screen.findByText('已请求停止')).toBeTruthy()
  })

  it('says so when there is no call, or when the list cannot be read', () => {
    const empty = storeWith({ kind: 'listed', calls: [] }).store
    render(<BackgroundPane store={empty} tenant="t" session="s" detail={() => null} />)
    expect(screen.getByText('没有在后台的调用')).toBeTruthy()
    cleanup()
    const away = storeWith({ kind: 'unreadable', reason: 'basis-unavailable' }).store
    render(<BackgroundPane store={away} tenant="t" session="s" detail={() => null} />)
    expect(screen.getByText('后台调用现在读不到：basis-unavailable')).toBeTruthy()
  })

  it('shows the hint only while calls run in the background', () => {
    const two = storeWith({ kind: 'listed', calls: [item('b1'), item('b2')] }).store
    render(<BackgroundHint store={two} tenant="t" session="s" />)
    expect(screen.getByRole('status').textContent).toBe(
      '后台有 2 项调用在跑，在侧边区的「后台」里看',
    )
    cleanup()
    const none = storeWith({ kind: 'listed', calls: [] }).store
    const { container } = render(<BackgroundHint store={none} tenant="t" session="s" />)
    expect(container.textContent).toBe('')
  })
})

describe('the 后台 item of the side area (C26)', () => {
  it('appears after the other entries while calls run in the background, and not otherwise', async () => {
    const { SideWithBackground } = await import('../src/view/background-pane.tsx')
    const others = [{ id: 'notes', label: '笔记', node: <p>notes</p> }]
    const running = storeWith({ kind: 'listed', calls: [item('b1')] }).store
    render(
      <SideWithBackground
        entries={others}
        store={running}
        tenant="t"
        session="s"
        detail={() => null}
      />,
    )
    expect(screen.getByRole('button', { name: '后台' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '笔记' })).toBeTruthy()
    cleanup()
    const idle = storeWith({ kind: 'listed', calls: [] }).store
    const { container } = render(
      <SideWithBackground entries={[]} store={idle} tenant="t" session="s" detail={() => null} />,
    )
    expect(container.textContent).toBe('')
  })
})
