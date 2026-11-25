// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineRenderPoint, definePoint, partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { toolProtocol } from '@omne-harness/tool-protocol'
import { CALL_CHILDREN_ID, CALL_OUTPUT_ID, CODE_TOOL, createToolUiModule } from '../src/cordis.ts'
import {
  CallChildren,
  CallChildrenStore,
  CodeCard,
  programOf,
  type ToolCallSubject,
} from '../src/index.ts'
import { startShell } from './fixtures/reference-shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const REFERENCE = '["tool-invocation",2,"call-1","admit-1"]'

afterEach(cleanup)

const item = (ordinal: number, state: string, rest: object = {}) => ({
  ordinal,
  tool: 'Files',
  command: 'read',
  preview: `a${ordinal}.txt`,
  state,
  child: `ref-${ordinal}`,
  ...rest,
})
const page = (items: readonly object[], next: string | null = null) => ({
  outcome: 'succeeded',
  body: { items, next },
})

function client(answers: readonly unknown[]) {
  const list = vi.fn(
    async (_input: unknown) => answers[Math.min(list.mock.calls.length - 1, answers.length - 1)],
  )
  return { client: { 'list-call-children': list }, list }
}

const storeOf = (answers: readonly unknown[]) => {
  const fake = client(answers)
  return { store: new CallChildrenStore(fake.client as never, 60_000), list: fake.list }
}
const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 0)))
const rows = () =>
  [...document.querySelectorAll('[data-omne-part="tool.call-children"] li')].map(row =>
    [...row.querySelectorAll('span')].map(cell => cell.textContent),
  )

describe('the positions under a call as the view keeps them', () => {
  it('reads every page of the table, each from the cursor the page before gave', async () => {
    const { store, list } = storeOf([page([item(1, 'completed')], '1'), page([item(2, 'running')])])
    const stop = store.subscribe(TENANT, REFERENCE, () => {})
    await settle()
    const view = store.read(TENANT, REFERENCE)
    expect(view.kind === 'listed' && view.items.map(one => one.ordinal)).toEqual([1, 2])
    expect(list.mock.calls.map(([input]) => (input as { cursor: unknown }).cursor)).toEqual([
      null,
      '1',
    ])
    stop()
  })

  it('a first read that fails is unreadable; a later one that fails keeps the table read before', async () => {
    const failing = storeOf([{ outcome: 'denied' }])
    const stopFailing = failing.store.subscribe(TENANT, REFERENCE, () => {})
    await settle()
    expect(failing.store.read(TENANT, REFERENCE)).toEqual({ kind: 'unreadable', reason: 'denied' })
    stopFailing()
    const { store } = storeOf([page([item(1, 'running')]), { outcome: 'basis-unavailable' }])
    const stop = store.subscribe(TENANT, REFERENCE, () => {})
    await settle()
    await store.refresh(TENANT, REFERENCE)
    expect(store.read(TENANT, REFERENCE)).toMatchObject({ kind: 'listed', items: [{ ordinal: 1 }] })
    stop()
  })

  it('reads again while it is shown and stops when the last view goes', async () => {
    vi.useFakeTimers()
    try {
      const fake = client([page([item(1, 'running')])])
      const store = new CallChildrenStore(fake.client as never, 2000)
      const stop = store.subscribe(TENANT, REFERENCE, () => {})
      await vi.advanceTimersByTimeAsync(4100)
      expect(fake.list.mock.calls).toHaveLength(3)
      stop()
      await vi.advanceTimersByTimeAsync(4100)
      expect(fake.list.mock.calls).toHaveLength(3)
      expect(store.read(TENANT, REFERENCE)).toEqual({ kind: 'unread' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a read that throws is a read that failed', async () => {
    const store = new CallChildrenStore(
      { 'list-call-children': () => Promise.reject(new Error('down')) } as never,
      60_000,
    )
    const stop = store.subscribe(TENANT, REFERENCE, () => {})
    await settle()
    expect(store.read(TENANT, REFERENCE)).toEqual({ kind: 'unreadable', reason: 'unavailable' })
    stop()
  })
})

describe('the list of positions (Tool 规格「界面模块」)', () => {
  it.each([
    ['queued', '排队中'],
    ['running', '处理中'],
    ['waiting', '待确认'],
    ['background', '在后台'],
    ['completed', '已完成'],
    ['failed', '失败'],
    ['denied', '被拒'],
    ['stopped', '已停止'],
    ['unknown', '未确认'],
  ])('a position that is %s says %s, from the shared table of state words', async (state, word) => {
    const { store } = storeOf([page([item(3, state)])])
    render(<CallChildren store={store} tenant={TENANT} reference={REFERENCE} />)
    const list = await screen.findByRole('list', { name: '子调用' })
    expect(list.getAttribute('data-omne-part')).toBe('tool.call-children')
    expect(rows()).toEqual([['3', 'Files read', 'a3.txt', word]])
    expect(list.querySelector('[data-state-word]')?.textContent).toBe(word)
  })

  it('lists the positions by ordinal, a target without a command by its tool alone', async () => {
    const { store } = storeOf([
      page([
        item(0, 'completed'),
        item(1, 'waiting', { tool: 'Shell', command: null, preview: 'echo hi', child: null }),
      ]),
    ])
    render(<CallChildren store={store} tenant={TENANT} reference={REFERENCE} />)
    await screen.findByRole('list', { name: '子调用' })
    expect(rows()).toEqual([
      ['0', 'Files read', 'a0.txt', '已完成'],
      ['1', 'Shell', 'echo hi', '待确认'],
    ])
    const waiting = document.querySelector('[data-child-state="waiting"] [data-state-word]')
    expect(waiting?.getAttribute('data-fact')).toBe('waiting')
  })

  it.each([
    ['a call with no table', [page([])]],
    ['a table that cannot be read', [{ outcome: 'denied' }]],
    ['a table not read yet', [new Promise(() => {})]],
  ])('draws nothing for %s', async (_what, answers) => {
    const { store } = storeOf(answers)
    const { container } = render(
      <CallChildren store={store} tenant={TENANT} reference={REFERENCE} />,
    )
    await settle()
    expect(container.innerHTML).toBe('')
  })
})

describe('the call of Code in the conversation', () => {
  const subject = (rest: Partial<ToolCallSubject> = {}): ToolCallSubject => ({
    session: 'ses_a',
    call: 'call_model_1',
    name: 'Code',
    arguments: { command: 'execute', code: 'return 1 + 1' },
    state: 'completed',
    result: '2',
    ...rest,
  })
  const generic = () => <div data-testid="own-row">Code</div>

  it('keeps the row of the conversation and adds the program as code behind 程序', async () => {
    const { store, list } = storeOf([page([item(1, 'completed')])])
    render(<CodeCard store={store} tenant={TENANT} subject={subject()} generic={generic} />)
    const card = screen.getByTestId('own-row').parentElement
    expect(card?.getAttribute('data-omne-part')).toBe('tool.code-card')
    const fold = screen.getByRole('button', { name: '程序' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(fold)
    expect(document.querySelector('.code-surface pre')?.textContent).toBe('return 1 + 1')
    expect(document.querySelector('.code-surface-name')?.textContent).toBe('TypeScript')
    await settle()
    expect(list).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: '子调用' })).toBeNull()
  })

  it('lists the calls the program made when the call is named by its Tool reference', async () => {
    const { store, list } = storeOf([page([item(1, 'failed')])])
    render(
      <CodeCard
        store={store}
        tenant={TENANT}
        subject={subject({ call: REFERENCE })}
        generic={generic}
      />,
    )
    await screen.findByRole('list', { name: '子调用' })
    expect(rows()).toEqual([['1', 'Files read', 'a1.txt', '失败']])
    expect(list.mock.calls[0]?.[0]).toMatchObject({ reference: REFERENCE, cursor: null })
  })

  it.each([
    ['a program kept in a file', { command: 'execute', path: 'count.ts' }],
    ['arguments not read yet', undefined],
    ['an empty program', { command: 'execute', code: '' }],
  ])('has no 程序 for %s', (_what, given) => {
    const { store } = storeOf([])
    render(
      <CodeCard
        store={store}
        tenant={TENANT}
        subject={subject({ arguments: given, call: null })}
        generic={generic}
      />,
    )
    expect(screen.getByTestId('own-row')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '程序' })).toBeNull()
    expect(programOf(given)).toBeNull()
  })
})

describe('the tool-ui module places both', () => {
  const detail = definePoint<{ readonly session: string; readonly call: string }>({
    name: 'session.call-detail',
    subject: {
      encode: value => JSON.stringify([value.session, value.call]),
      decode: text => {
        const [session, call] = JSON.parse(text) as [string, string]
        return { session, call }
      },
    },
  })
  const toolCall = defineRenderPoint<ToolCallSubject>({
    name: 'session.tool-call',
    key: 'the name of the tool',
    summary: 'How a call of one tool is drawn in the conversation.',
  })

  it('puts the list before the output under a call, and a drawing on the calls of Code', async () => {
    const { root, shell } = await startShell()
    detail.declare(shell)
    toolCall.declare(shell)
    await serveProtocol(root, toolProtocol, {
      ...client([page([item(1, 'completed')])]).client,
      'read-call-output': async () => ({ outcome: 'succeeded', body: { kind: 'none' } }),
    })
    await root.plugin(createToolUiModule({ callDetail: detail, toolCall }))
    await new Promise(resolve => setTimeout(resolve, 0))
    ;(shell.scope as { get: () => string | undefined }).get = () => TENANT
    const attached = (root.shell as unknown as { items(slot: 'attached'): { id: string }[] })
      .items('attached')
      .map(entry => entry.id)
    expect(attached).toEqual([CALL_CHILDREN_ID, CALL_OUTPUT_ID])
    const own = () => <div data-testid="own-row">row</div>
    const code = { session: 's', call: null, name: 'Code', arguments: { code: 'return 1' } }
    const drawn = (name: string) =>
      toolCall.draw(shell, name, { ...code, name, state: 'completed', result: null }, own)
    render(<>{drawn(CODE_TOOL)}</>)
    expect(screen.getByRole('button', { name: '程序' })).toBeTruthy()
    cleanup()
    render(<>{drawn('Files')}</>)
    expect(screen.queryByRole('button', { name: '程序' })).toBeNull()
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
      ['tool.call-children', 'session.side.background-call'],
      ['tool.call-output', 'session.side.background-call'],
      ['tool.code-card', 'session.transcript'],
    ])
  })
})
