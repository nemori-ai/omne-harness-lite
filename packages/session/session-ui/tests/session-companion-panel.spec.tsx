// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CompanionPanelDrawing } from '../src/parts.ts'
import { sayTargetOf } from '../src/view/companion-panel.tsx'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page, userEntry } from './fixtures/frames.ts'
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

const figure = () => screen.getByRole('button', { name: '对 Agent 说一句话' })
const panel = () =>
  document.querySelector<HTMLElement>('[data-omne-part="session.companion.panel"]')
const field = () => panel()!.querySelector<HTMLTextAreaElement>('textarea')!
const sendButton = () => within(panel()!).getByRole('button', { name: '发送' })
const target = () => within(panel()!).getByRole('combobox', { name: '说给谁' })

async function mounted(fake: FakeClient, ...sessions: ReturnType<typeof listed>[]) {
  const made = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage(sessions))
  await settle()
  return made
}

async function unfolded(fake: FakeClient, ...sessions: ReturnType<typeof listed>[]) {
  const made = await mounted(fake, ...sessions)
  fireEvent.click(figure())
  await settle()
  return made
}

async function withOpen(fake: FakeClient) {
  const made = await mounted(fake, listed('ses_a', '甲'), listed('ses_b', '乙'))
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([userEntry('1', '1', '早')], '1'),
  })
  await settle()
  fireEvent.click(figure())
  await settle()
  return made
}

const write = (words: string): void => {
  fireEvent.change(field(), { target: { value: words } })
}

describe('随身入口的小框：展开与收起', () => {
  it('按形象展开，小框是一个有名字的框，字段拿到焦点；再按收起', async () => {
    await unfolded(createFakeClient())
    expect(figure().getAttribute('aria-expanded')).toBe('true')
    expect(panel()?.getAttribute('role')).toBe('dialog')
    expect(panel()?.getAttribute('aria-label')).toBe('对 Agent 说一句话')
    expect(panel()?.classList.contains('omne-ink-bubble')).toBe(true)
    expect(document.activeElement).toBe(field())
    fireEvent.click(figure())
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
    expect(panel()?.hasAttribute('inert') ?? true).toBe(true)
  })

  it('Escape 收起，焦点回到形象', async () => {
    await unfolded(createFakeClient())
    fireEvent.keyDown(field(), { key: 'Escape' })
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(figure())
  })

  it('在别处按下收起；在小框里、在形象上按下不收', async () => {
    await unfolded(createFakeClient())
    fireEvent.pointerDown(field())
    expect(figure().getAttribute('aria-expanded')).toBe('true')
    fireEvent.pointerDown(document.body)
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
  })

  it('展开时按形象：这一下不算在别处，形象自己的点按把小框收起', async () => {
    await unfolded(createFakeClient())
    fireEvent.pointerDown(figure())
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(figure())
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
  })

  it('被拖起来时收起', async () => {
    const made = await unfolded(createFakeClient())
    act(() => made.rerender(TENANT, { corner: { x: 'end', y: 'end' }, dragging: true }))
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('随身入口的小框：说给谁', () => {
  it('没有打开的会话时是新会话；有打开的会话时跟着它', async () => {
    await unfolded(createFakeClient(), listed('ses_a', '甲'))
    expect(target().textContent).toContain('新会话')
    cleanup()
    await withOpen(createFakeClient())
    expect(target().textContent).toContain('甲')
  })

  it('按下拉里的一项：小框不收，说给谁换成选的那一个；之后在别处按下照样收起', async () => {
    await unfolded(createFakeClient(), listed('ses_a', '甲'), listed('ses_b', '乙'))
    fireEvent.keyDown(target(), { key: 'Enter' })
    const option = (await screen.findAllByRole('option')).find(item => item.textContent === '乙')!
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('true')
    expect(target().textContent).toContain('乙')
    fireEvent.pointerDown(document.body)
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
  })

  it('选过之后不再跟着；选的会话不在列表里也说给它', () => {
    const sessions = [{ session: 'ses_a', name: '甲' }]
    expect(sayTargetOf('follow', null)).toEqual({ kind: 'new' })
    expect(sayTargetOf('follow', 'ses_a')).toEqual({ kind: 'session', session: 'ses_a' })
    expect(sayTargetOf('new', 'ses_a')).toEqual({ kind: 'new' })
    expect(sayTargetOf('ses_b', 'ses_a')).toEqual({ kind: 'session', session: 'ses_b' })
    expect(sessions).toHaveLength(1)
  })
})

describe('随身入口的小框：发出去与结局', () => {
  it('说给新会话：建会话、发这句话；受理了字段清空，写一行回执，带去对话页的钮', async () => {
    const fake = createFakeClient()
    const made = await unfolded(fake)
    write('帮我看看日程')
    fireEvent.click(sendButton())
    const create = await fake.next('create-session')
    await settle()
    expect(sendButton().hasAttribute('disabled')).toBe(true)
    create.answer({ outcome: 'succeeded', body: { session: 'ses_new', recovered: false } })
    const send = await fake.next('send-input')
    expect(send.body).toMatchObject({ session: 'ses_new' })
    expect(JSON.stringify(send.body)).toContain('帮我看看日程')
    send.answer({ outcome: 'succeeded', body: {} })
    await settle()
    expect(field().value).toBe('')
    expect(panel()?.textContent).toContain('已发出')
    fireEvent.click(within(panel()!).getByRole('button', { name: '去对话页看' }))
    expect(made.shell.navigated.at(-1)).toBe('conversation')
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
  })

  it('说给打开着的会话：这句话落在那个会话里', async () => {
    const fake = createFakeClient()
    await withOpen(fake)
    write('再说一句')
    fireEvent.click(sendButton())
    const send = await fake.next('send-input')
    expect(send.body).toMatchObject({ session: 'ses_a' })
    expect(fake.calls.some(call => call.operation === 'create-session')).toBe(false)
  })

  it('没发出：失败语气写原因，字留在字段里', async () => {
    const fake = createFakeClient()
    await withOpen(fake)
    write('再说一句')
    fireEvent.click(sendButton())
    ;(await fake.next('send-input')).answer({ outcome: 'frozen' })
    await settle()
    expect(within(panel()!).getByRole('alert').textContent).toBe(
      '没有发出：这个会话已冻结，不能再发消息。',
    )
    expect(field().value).toBe('再说一句')
    expect(sendButton().hasAttribute('disabled')).toBe(false)
  })

  it('不知道：中性的一句，请人到对话页看，不说成发出了也不说成没发出', async () => {
    const fake = createFakeClient()
    await withOpen(fake)
    write('再说一句')
    fireEvent.click(sendButton())
    ;(await fake.next('send-input')).answer({ outcome: 'unknown' })
    ;(await fake.next('query-send-input')).answer({ outcome: 'unknown' })
    await settle()
    expect(panel()?.textContent).toContain('结果不知道')
    expect(panel()?.textContent).not.toContain('已发出')
    expect(within(panel()!).queryByRole('alert')).toBeNull()
    expect(within(panel()!).getByRole('button', { name: '去对话页看' })).toBeTruthy()
  })

  it('回车发送；输入法组字时回车不发送；Shift 加回车不发送；没有字时发送钮按不了', async () => {
    const fake = createFakeClient()
    await withOpen(fake)
    expect(sendButton().hasAttribute('disabled')).toBe(true)
    write('你好')
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true })
    await settle()
    expect(fake.calls.some(call => call.operation === 'send-input')).toBe(false)
    fireEvent.keyDown(field(), { key: 'Enter' })
    await fake.next('send-input')
  })

  it('再写字，上一次的结局那一行收掉', async () => {
    const fake = createFakeClient()
    await withOpen(fake)
    write('再说一句')
    fireEvent.click(sendButton())
    ;(await fake.next('send-input')).answer({ outcome: 'frozen' })
    await settle()
    write('再说一句呀')
    expect(within(panel()!).queryByRole('alert')).toBeNull()
  })
})

describe('随身入口的小框：换画法', () => {
  it('小框的画法收到口与 close，换的是墨框里面的内容；按 close 收起', async () => {
    const fake = createFakeClient()
    const made = await mounted(fake, listed('ses_a', '甲'))
    const seen: CompanionPanelDrawing[] = []
    made.shell.putRender<CompanionPanelDrawing>('session.companion.panel', given => {
      seen.push(given.props)
      return <p data-drawn="panel">自己的小框</p>
    })
    act(() => made.rerender(TENANT))
    fireEvent.click(figure())
    await settle()
    expect(panel()?.classList.contains('omne-ink-bubble')).toBe(true)
    expect(panel()?.querySelector('[data-drawn="panel"]')).not.toBeNull()
    expect(panel()?.querySelector('textarea')).toBeNull()
    const last = seen.at(-1)!
    expect(last.sessions).toEqual([{ session: 'ses_a', name: '甲' }])
    expect(last.current).toBeNull()
    expect(typeof last.say).toBe('function')
    expect(typeof last.show).toBe('function')
    act(() => last.close())
    await settle()
    expect(figure().getAttribute('aria-expanded')).toBe('false')
  })
})
