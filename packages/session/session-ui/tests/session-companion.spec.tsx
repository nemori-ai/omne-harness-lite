// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FLOAT_GRIP_ATTRIBUTE } from '@omne-harness/shell-contract'
import type { CompanionDrawing, CompanionFigureDrawing } from '../src/parts.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import {
  deltaTree,
  listed,
  listPage,
  page,
  snapshotTree,
  stateFrame,
  userEntry,
} from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const companion = () => document.querySelector<HTMLElement>('[data-omne-part="session.companion"]')
const figure = () =>
  document.querySelector<HTMLElement>('[data-omne-part="session.companion.figure"]')

async function mounted(fake: FakeClient) {
  const made = await mountModule(fake.client, TENANT)
  await settle()
  return made
}

async function listedAs(fake: FakeClient, ...sessions: ReturnType<typeof listed>[]) {
  ;(await fake.next('list-sessions')).answer(listPage(sessions))
  await settle()
}

describe('随身入口：在哪、长什么样', () => {
  it('登录后就在浮层上：一个能按、能拖的形象，自带的是墨点', async () => {
    await mounted(createFakeClient())
    expect(companion()?.closest('[data-float="companion"]')).not.toBeNull()
    expect(figure()?.closest('[data-omne-part="session.companion"]')).toBe(companion())
    expect(figure()?.tagName).toBe('BUTTON')
    expect(figure()?.hasAttribute(FLOAT_GRIP_ATTRIBUTE)).toBe(true)
    expect(figure()?.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: '对 Agent 说一句话' })).toBe(figure())
    expect(figure()?.querySelector('[data-ink-motes]')).not.toBeNull()
  })

  it('外壳还没给租户、或给的租户读不懂：不画', async () => {
    const made = await mountModule(createFakeClient().client, undefined)
    await settle()
    expect(companion()).toBeNull()
    act(() => made.rerender('不是租户'))
    expect(companion()).toBeNull()
    act(() => made.rerender(TENANT))
    await settle()
    expect(companion()).not.toBeNull()
  })

  it('放了形象的画法就换成它；形象只收到三样，拿不到说话的能力；撤掉回到墨点', async () => {
    const made = await mounted(createFakeClient())
    const seen: CompanionFigureDrawing[] = []
    const withdraw = made.shell.putRender<CompanionFigureDrawing>(
      'session.companion.figure',
      given => {
        seen.push(given.props)
        return <span data-drawn="pet" />
      },
    )
    act(() => made.rerender(TENANT))
    expect(figure()?.querySelector('[data-drawn="pet"]')).not.toBeNull()
    expect(figure()?.querySelector('[data-ink-motes]')).toBeNull()
    expect(seen.at(-1)).toEqual({ doing: 'idle', unfolded: false, dragging: false })
    act(() => made.rerender(TENANT, { corner: { x: 'start', y: 'end' }, dragging: true }))
    expect(seen.at(-1)).toEqual({ doing: 'idle', unfolded: false, dragging: true })
    act(() => {
      withdraw()
      made.rerender(TENANT)
    })
    expect(figure()?.querySelector('[data-ink-motes]')).not.toBeNull()
  })

  it('整个的画法收到口、此刻在做什么与外壳给的那几样；可以包着自带的画', async () => {
    const fake = createFakeClient()
    const made = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'), listed('ses_b'))
    const seen: CompanionDrawing[] = []
    made.shell.putRender<CompanionDrawing>('session.companion', given => {
      seen.push(given.props)
      return (
        <div {...given.part} data-drawn="whole">
          {given.builtIn()}
        </div>
      )
    })
    act(() => made.rerender(TENANT, { corner: { x: 'start', y: 'start' }, dragging: false }))
    const last = seen.at(-1)!
    expect(last.sessions).toEqual([
      { session: 'ses_a', name: '甲' },
      { session: 'ses_b', name: '未命名的会话 ses_b' },
    ])
    expect(last).toMatchObject({
      current: null,
      doing: 'idle',
      corner: { x: 'start', y: 'start' },
      dragging: false,
      grip: { [FLOAT_GRIP_ATTRIBUTE]: '' },
    })
    expect(typeof last.say).toBe('function')
    expect(typeof last.show).toBe('function')
    expect(document.querySelector('[data-drawn="whole"] [data-ink-motes]')).not.toBeNull()
    act(() => last.show())
    expect(made.shell.navigated.at(-1)).toBe('conversation')
  })

  it('列表还没读到时 sessions 是空值，不是空表', async () => {
    const made = await mounted(createFakeClient())
    const seen: CompanionDrawing[] = []
    made.shell.putRender<CompanionDrawing>('session.companion', given => {
      seen.push(given.props)
      return null
    })
    act(() => made.rerender(TENANT))
    expect(seen.at(-1)?.sessions).toBeNull()
  })
})

describe('随身入口：经外壳的笺口开说话笺', () => {
  it('按自带的按钮：笺口收到一次 toggle，带的元素就是这个按钮；自己不画小框', async () => {
    const made = await mounted(createFakeClient())
    fireEvent.click(figure()!)
    await settle()
    expect(made.note.calls).toEqual([{ kind: 'toggle', element: figure() }])
    expect(document.querySelector('[data-omne-part="session.companion.panel"]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('说话位上没有项：按钮按不了，按了笺口什么都没收到', async () => {
    const made = await mounted(createFakeClient())
    made.note.there = false
    act(() => made.rerender(TENANT))
    expect(figure()?.hasAttribute('disabled')).toBe(true)
    fireEvent.click(figure()!)
    await settle()
    expect(made.note.calls).toEqual([])
    made.note.there = true
    act(() => made.rerender(TENANT))
    expect(figure()?.hasAttribute('disabled')).toBe(false)
  })

  it('笺开在它身边：按钮是展开的，形象的画法收到 unfolded；收起之后回到没展开', async () => {
    const made = await mounted(createFakeClient())
    const seen: CompanionFigureDrawing[] = []
    made.shell.putRender<CompanionFigureDrawing>('session.companion.figure', given => {
      seen.push(given.props)
      return null
    })
    made.note.open = true
    act(() => made.rerender(TENANT))
    expect(figure()?.getAttribute('aria-expanded')).toBe('true')
    expect(seen.at(-1)).toEqual({ doing: 'idle', unfolded: true, dragging: false })
    made.note.open = false
    act(() => made.rerender(TENANT))
    expect(figure()?.getAttribute('aria-expanded')).toBe('false')
    expect(seen.at(-1)).toEqual({ doing: 'idle', unfolded: false, dragging: false })
  })

  it('整个的画法收到的笺口就是外壳给的那一个；包着自带的画时按钮照样经它开笺', async () => {
    const made = await mounted(createFakeClient())
    const seen: CompanionDrawing[] = []
    made.shell.putRender<CompanionDrawing>('session.companion', given => {
      seen.push(given.props)
      return <div {...given.part}>{given.builtIn()}</div>
    })
    act(() => made.rerender(TENANT))
    expect(seen.at(-1)?.note).toBe(made.note)
    fireEvent.click(figure()!)
    expect(made.note.calls).toEqual([{ kind: 'toggle', element: figure() }])
  })
})

describe('随身入口：跟着打开着的会话', () => {
  async function opened(fake: FakeClient) {
    const made = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    fireEvent.click(screen.getByRole('button', { name: '甲' }))
    await settle()
    ;(await fake.next('read-history')).answer({
      outcome: 'succeeded',
      body: page([userEntry('1', '1', '早')], '1'),
    })
    await settle()
    return made
  }

  it('知道打开着的是哪个会话、它在做什么', async () => {
    const fake = createFakeClient()
    const made = await opened(fake)
    const seen: CompanionFigureDrawing[] = []
    const whole: CompanionDrawing[] = []
    made.shell.putRender<CompanionFigureDrawing>('session.companion.figure', given => {
      seen.push(given.props)
      return null
    })
    made.shell.putRender<CompanionDrawing>('session.companion', given => {
      whole.push(given.props)
      return given.builtIn()
    })
    act(() => made.rerender(TENANT))
    expect(whole.at(-1)?.current).toBe('ses_a')
    expect(seen.at(-1)?.doing).toBe('idle')
    act(() => fake.observations[0]!.push(stateFrame('run_1', '2')))
    await settle()
    expect(seen.at(-1)?.doing).toBe('thinking')
  })

  it('回复流着字时不重画：一帧帧的增量到来，画法不被再调', async () => {
    const fake = createFakeClient()
    const made = await opened(fake)
    let drawn = 0
    made.shell.putRender<CompanionFigureDrawing>('session.companion.figure', () => {
      drawn += 1
      return null
    })
    act(() => made.rerender(TENANT))
    const observation = fake.observations[0]!
    act(() => observation.push(stateFrame('run_1', '2')))
    await settle()
    act(() =>
      observation.push({
        kind: 'snapshot',
        projection: 'model-output-v1',
        value: snapshotTree('c1', '2', [['0', '你']]),
      }),
    )
    await settle()
    const before = drawn
    for (let i = 2; i < 12; i += 1) {
      act(() =>
        observation.push({
          kind: 'delta',
          projection: 'model-output-v1',
          value: deltaTree({ cursor: `c${i - 1}`, revision: '2' }, `c${i}`, '2', [['0', '好']]),
        }),
      )
      await settle()
    }
    expect(drawn).toBe(before)
  })
})
