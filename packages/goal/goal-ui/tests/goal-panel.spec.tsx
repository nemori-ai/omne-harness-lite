// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GoalDriver } from '../src/model/goal-driver.ts'
import { GoalPanel } from '../src/view/goal-panel.tsx'
import { fakeClient, goalOf, SESSION, TENANT } from './fixtures/client.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'

beforeAll(stubAnimation)
afterEach(cleanup)

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 12; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
  })

async function shown(read?: unknown) {
  const fake = fakeClient()
  if (read !== undefined) fake.script.read = read as never
  const driver = new GoalDriver({ client: fake.client, tenant: TENANT, session: SESSION })
  const view = render(<GoalPanel driver={driver} />)
  await settle()
  fake.streams[0]!.push()
  await settle()
  fake.calls.length = 0
  return { ...fake, driver, view }
}
const reading = (goal: unknown) => ({ outcome: 'succeeded', body: { goal } })
const button = (name: string) => screen.getByRole('button', { name })
const namesOf = (calls: readonly [string, unknown][]) => calls.map(([name]) => name)

describe('the goal panel', () => {
  it('shows how the goal stands, what is still short by number, the formal body, what the agent says and where each revision came from', async () => {
    const { view } = await shown()
    const text = view.container.textContent ?? ''
    expect(text).toContain('处理中修订 1 · 用了 3 轮')
    expect(text).toContain('A1用例全过证据显示没做到（判定）')
    expect(text).toContain('预算20 轮用了 3 轮（系统读的） · 剩 17')
    expect(view.container.querySelector('.goal-body h2')?.textContent).toBe('目的')
    expect(view.container.querySelector('.goal-body')?.textContent).toContain('[A1] 用例全过')
    expect(text).toContain('A1在做 · 还差三条')
    expect(text).toContain('dist/report.html')
    expect(text).toContain('修订 1 · 在确认卡片上确认 · agent 起草 · ')
    expect(text).not.toContain('server-entry')
    const when = view.container.querySelector('.goal-list time')
    expect(when?.getAttribute('datetime')).toBe('2026-11-25T00:00:01.000Z')
    expect(when?.parentElement?.getAttribute('title')).toBe('确认者 server-entry')
    expect(text).toContain('把首页降下来')
    expect(view.container.querySelector('tr[data-open="yes"]')?.textContent).toContain('A1')
    expect(
      view.container.querySelector('[data-omne-part], section')?.getAttribute('aria-label'),
    ).toBe('目标')
  })

  it('says there is none and how to set one, and says as it is when the goal cannot be read', async () => {
    const none = await shown(reading(null))
    expect(none.view.container.textContent).toContain('这段会话没有目标。在对话里敲 /goal')
    expect(screen.queryByRole('button')).toBeNull()
    cleanup()
    const denied = await shown({ outcome: 'denied' })
    expect(denied.view.container.textContent).toContain('你不能看这个会话的目标。')
    expect(screen.getByRole('alert')).toBeTruthy()
    cleanup()
    const away = await shown({ outcome: 'basis-unavailable' })
    expect(away.view.container.textContent).toContain('服务端现在答不了，目标读不到。')
  })

  it('pauses a goal in progress and resumes a paused one, naming the goal it shows', async () => {
    const { calls, script } = await shown()
    expect(screen.queryByRole('button', { name: '恢复目标' })).toBeNull()
    fireEvent.click(button('暂停目标'))
    await settle()
    expect(calls[0]).toMatchObject(['command-goal', { generation: 1, command: { kind: 'pause' } }])
    expect(document.querySelector('.goal-head')?.textContent).toContain('已暂停你停的 · 修订')
    script.command = reading(goalOf()) as never
    fireEvent.click(button('恢复目标'))
    await settle()
    expect(calls[1]).toMatchObject(['command-goal', { command: { kind: 'resume' } }])
    expect(document.querySelector('.goal-head')?.textContent).toContain('处理中修订')
  })

  it('cancels only after the person confirms, and says what cancelling does first', async () => {
    const { calls } = await shown()
    fireEvent.click(button('取消目标'))
    expect(calls).toEqual([])
    expect(document.body.textContent).toContain('不算成功也不算失败。正在跑的这一轮不会停。')
    fireEvent.click(screen.getAllByRole('button', { name: '取消目标' }).at(-1)!)
    await settle()
    expect(calls[0]).toMatchObject(['command-goal', { command: { kind: 'cancel' } }])
  })

  it('offers settling by an exit only when that exit paused the goal, and names it in the command', async () => {
    const stalled = await shown(
      reading(goalOf({ status: 'paused', pause: { by: 'verdict', row: 7, exit: null } })),
    )
    expect(stalled.view.container.textContent).toContain('已暂停连续几次没有进展 · 修订')
    expect(screen.queryByRole('button', { name: /收场/u })).toBeNull()
    cleanup()
    const { calls } = await shown(
      reading(goalOf({ status: 'paused', pause: { by: 'verdict', row: 5, exit: 'X2' } })),
    )
    fireEvent.click(button('照 X2 收场'))
    expect(document.body.textContent).toContain('之后不能恢复')
    fireEvent.click(screen.getAllByRole('button', { name: '照 X2 收场' }).at(-1)!)
    await settle()
    expect(calls[0]).toMatchObject([
      'command-goal',
      { command: { kind: 'settle-by-exit', exit: 'X2' } },
    ])
  })

  it('raises the budget by a direct edit: the exit is replaced by its number, and the panel shows the goal as written', async () => {
    const { calls } = await shown()
    fireEvent.click(button('改目标'))
    fireEvent.change(screen.getByLabelText('X1 的上限（轮）'), { target: { value: '30' } })
    fireEvent.click(button('改成这样'))
    await settle()
    expect(namesOf(calls)).toEqual(['write-goal'])
    expect(screen.queryByRole('form', { name: '改目标' })).toBeNull()
    expect(document.body.textContent).toContain('修订 2')
  })

  it('sends nothing when nothing was changed or a limit is not a number, and says which', async () => {
    const { calls } = await shown()
    fireEvent.click(button('改目标'))
    fireEvent.click(button('改成这样'))
    expect(screen.getByRole('alert').textContent).toContain('没有改动')
    fireEvent.change(screen.getByLabelText('X1 的上限（轮）'), { target: { value: 'many' } })
    fireEvent.click(button('改成这样'))
    expect(screen.getByRole('alert').textContent).toContain('X1 的数要写成正整数')
    await settle()
    expect(calls).toEqual([])
  })

  it('keeps the form open and shows what the server found wrong beside the entry', async () => {
    const { script } = await shown()
    script.write = {
      outcome: 'invalid',
      body: { issues: [{ entry: 'A1', field: 'statement', problem: '不能是空的' }] },
    }
    fireEvent.click(button('改目标'))
    fireEvent.change(screen.getByLabelText('A1 的陈述'), { target: { value: '改了' } })
    fireEvent.click(button('改成这样'))
    await settle()
    expect(screen.getByRole('form', { name: '改目标' })).toBeTruthy()
    const alerts = screen
      .getAllByRole('alert')
      .map(alert => alert.textContent)
      .join('|')
    expect(alerts).toContain('A1 statement：不能是空的')
    expect(alerts).toContain('正文不合格，没有写下。')
    fireEvent.click(button('不改了'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('is read only where nobody attends, and has no actions once the goal is settled, however it ended', async () => {
    const job = await shown(reading(goalOf({ attendance: 'unattended' })))
    expect(job.view.container.textContent).toContain(
      '这个会话无人值守，目标由建它的一方管，这里只读。',
    )
    expect(screen.queryByRole('button')).toBeNull()
    cleanup()
    const ended = await shown(
      reading(
        goalOf({ status: 'settled', outcome: { kind: 'exit', exit: 'X1', counts: 'failure' } }),
      ),
    )
    expect(ended.view.container.querySelector('.goal-head')?.textContent).toContain(
      '失败照退出 X1 收场，算没做成 · 修订',
    )
    expect(ended.view.container.querySelector('.goal-head')?.textContent).not.toContain('达成')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says what a refused command was refused for', async () => {
    const { script } = await shown()
    script.command = { outcome: 'conflict', body: { reason: 'nobody-attends' } }
    fireEvent.click(button('暂停目标'))
    await settle()
    expect(screen.getByRole('alert').textContent).toContain(
      '这个会话无人值守，它的目标只能由建它的一方改。',
    )
    fireEvent.click(button('关闭'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stops watching when it is taken off the screen', async () => {
    const { view, streams } = await shown()
    view.unmount()
    expect(streams[0]!.signal.aborted).toBe(true)
  })
})
