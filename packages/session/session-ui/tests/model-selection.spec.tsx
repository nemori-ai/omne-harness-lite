// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  ModelSelectionStore,
  selectText,
  type ModelChoiceListing,
  type ModelChoiceSource,
} from '../src/model/model-selection.ts'
import { ModelAction } from '../src/view/model-selection.tsx'

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    setPointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})
afterEach(cleanup)

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 's-1'
const GPT = 'openai/gpt-x'
const CLAUDE = 'anthropic/claude-y'
const LOCKED = 'openai/locked-z'

const selection = (model: string, revision: string) => ({
  outcome: 'succeeded' as const,
  body: { model, revision },
})
const selected = (
  model: string,
  credential: 'available' | 'missing' | 'unknown' = 'available',
) => ({
  outcome: 'succeeded' as const,
  body: { controlId: 'k', model, credential },
})

function storeWith(reads: readonly unknown[], answer: unknown = selected(CLAUDE)) {
  const read = vi.fn(
    async (_body: unknown) =>
      reads[Math.min(read.mock.calls.length - 1, reads.length - 1)] as never,
  )
  const select = vi.fn(async (_body: unknown) => answer as never)
  let made = 0
  const store = new ModelSelectionStore(
    { 'read-model-selection': read, 'select-model': select } as never,
    () => `id-${(made += 1)}`,
  )
  return { store, read, select }
}

const LISTED: ModelChoiceListing = {
  kind: 'listed',
  choices: [
    { route: GPT, selectable: true, note: null, reasoningEfforts: ['low', 'medium', 'high'] },
    { route: CLAUDE, selectable: true, note: '还没有配置凭据，选了也暂时调不了' },
    { route: LOCKED, selectable: false, note: '不能选：被锁定' },
  ],
}
const sourceOf = (listing: ModelChoiceListing): ModelChoiceSource & { asked: string[] } => {
  const asked: string[] = []
  return {
    asked,
    list: async tenant => {
      asked.push(tenant)
      return listing
    },
  }
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function choose(label: string, option: string): Promise<void> {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(option) }))
  await settle()
}

describe('the model of a session, as Session answered it last', () => {
  it('says each answer of a change, and an unknown one as not known', () => {
    expect(selectText(selected(CLAUDE))).toBe(`已换成 ${CLAUDE}`)
    expect(selectText(selected(CLAUDE, 'missing'))).toBe(
      `已换成 ${CLAUDE}；它还没有配置凭据，暂时调不了`,
    )
    expect(selectText({ outcome: 'invalid', body: { reason: 'locked' } })).toBe(
      '没有换：这个模型被锁定',
    )
    expect(selectText({ outcome: 'invalid', body: { reason: 'unknown-name' } })).toBe(
      '没有换：没有这个模型',
    )
    expect(
      selectText({
        outcome: 'invalid',
        body: { reason: 'excluded', detail: 'unsupported-effort' },
      }),
    ).toBe('没有换：这个模型不支持所选推理强度')
    expect(selectText({ outcome: 'archived', body: {} })).toBe('没有换：会话已归档')
    expect(selectText({ outcome: 'frozen', body: {} })).toBe('没有换：会话已冻结')
    expect(selectText({ outcome: 'unknown' })).toBe('不知道换没换成，已重新读取')
    expect(selectText({ outcome: 'unavailable' })).toBe('连不上服务，没有换')
    expect(selectText({ outcome: 'denied' })).toBe('没有换成：denied')
  })

  it('asks the change under an identity of its own, then reads the model again', async () => {
    const { store, read, select } = storeWith([selection(GPT, '4'), selection(CLAUDE, '5')])
    store.subscribe(TENANT, SESSION, () => {})
    await store.load(TENANT, SESSION)
    expect(store.read(TENANT, SESSION)).toEqual({ kind: 'read', model: GPT, revision: '4' })
    expect(await store.select(TENANT, SESSION, CLAUDE)).toBe(`已换成 ${CLAUDE}`)
    expect(select.mock.calls[0]?.[0]).toMatchObject({
      session: SESSION,
      model: CLAUDE,
      controlId: 'id-1',
    })
    expect(read).toHaveBeenCalledTimes(2)
    expect(store.read(TENANT, SESSION)).toEqual({ kind: 'read', model: CLAUDE, revision: '5' })
    await store.select(TENANT, SESSION, GPT)
    expect(select.mock.calls[1]?.[0]).toMatchObject({ controlId: 'id-2' })
  })

  it('a model that cannot be read is said as unreadable, not as none', async () => {
    const { store } = storeWith([{ outcome: 'basis-unavailable' }])
    store.subscribe(TENANT, SESSION, () => {})
    await store.load(TENANT, SESSION)
    expect(store.read(TENANT, SESSION)).toEqual({
      kind: 'unreadable',
      reason: 'basis-unavailable',
    })
  })

  it('a tenant that cannot be read sends nothing', async () => {
    const { store, read, select } = storeWith([selection(GPT, '1')])
    store.subscribe('not a tenant', SESSION, () => {})
    await store.load('not a tenant', SESSION)
    expect(store.read('not a tenant', SESSION)).toEqual({ kind: 'unreadable', reason: 'invalid' })
    expect(await store.select('not a tenant', SESSION, GPT)).toBe('没有送达：租户读不懂')
    expect(read).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })
})

describe('the list of models, from whoever is attached', () => {
  it('there is no list until a source is attached, and none again once it is taken away', async () => {
    const { store } = storeWith([selection(GPT, '1')])
    const told = vi.fn()
    store.subscribeChoices(TENANT, told)
    expect(store.choices(TENANT)).toEqual({ kind: 'absent' })
    await store.loadChoices(TENANT)
    expect(store.choices(TENANT)).toEqual({ kind: 'absent' })

    const source = sourceOf(LISTED)
    const detach = store.attach(source)
    await settle()
    expect(source.asked).toEqual([TENANT])
    expect(store.choices(TENANT)).toEqual(LISTED)
    expect(told).toHaveBeenCalled()

    told.mockClear()
    detach()
    expect(store.choices(TENANT)).toEqual({ kind: 'absent' })
    expect(told).toHaveBeenCalledTimes(1)
  })

  it('a source that throws is a list that could not be read', async () => {
    const { store } = storeWith([selection(GPT, '1')])
    store.attach({ list: () => Promise.reject(new Error('down')) })
    await store.loadChoices(TENANT)
    expect(store.choices(TENANT)).toEqual({ kind: 'unavailable', reason: '没有送达' })
  })

  it('a list that arrives after its source was taken away is dropped', async () => {
    const { store } = storeWith([selection(GPT, '1')])
    let answer: (listing: ModelChoiceListing) => void = () => {}
    const detach = store.attach({ list: () => new Promise(resolve => (answer = resolve)) })
    const loading = store.loadChoices(TENANT)
    detach()
    const later = sourceOf({ kind: 'unavailable', reason: '模型的列表暂时读不到' })
    store.attach(later)
    await store.loadChoices(TENANT)
    answer(LISTED)
    await loading
    expect(store.choices(TENANT)).toEqual({ kind: 'unavailable', reason: '模型的列表暂时读不到' })
  })

  it('taking away an earlier source does not take away the one attached after it', () => {
    const { store } = storeWith([selection(GPT, '1')])
    const detachFirst = store.attach(sourceOf(LISTED))
    store.attach(sourceOf(LISTED))
    detachFirst()
    expect(store.choices(TENANT).kind).not.toBe('absent')
  })
})

describe('the model in the heading of a conversation', () => {
  it('without a list it shows the model as text and offers no choice', async () => {
    const { store } = storeWith([selection(GPT, '1')])
    render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    expect(screen.getByText(`模型：${GPT}`)).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('with a list it offers the models; one that cannot be picked is disabled with its reason', async () => {
    const { store, select } = storeWith([selection(GPT, '1'), selection(CLAUDE, '2')])
    store.attach(sourceOf(LISTED))
    render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    const trigger = screen.getByRole('combobox', { name: '模型' })
    expect(trigger.textContent).toContain(GPT)
    fireEvent.keyDown(trigger, { key: 'Enter' })
    const locked = await screen.findByRole('option', { name: /locked-z/u })
    expect(locked.getAttribute('aria-disabled')).toBe('true')
    expect(locked.textContent).toContain('不能选：被锁定')
    fireEvent.click(screen.getByRole('option', { name: /claude-y/u }))
    await settle()
    expect(select.mock.calls[0]?.[0]).toMatchObject({ session: SESSION, model: CLAUDE })
    expect(screen.getByRole('status').textContent).toBe(`已换成 ${CLAUDE}`)
    expect(screen.getByRole('combobox', { name: '模型' }).textContent).toContain(CLAUDE)
  })

  it('offers the four efforts, disables unsupported xhigh and reads back the selected effort', async () => {
    const { store, select } = storeWith(
      [
        selection(GPT, '1'),
        { outcome: 'succeeded', body: { model: GPT, revision: '2', reasoningEffort: 'high' } },
      ],
      selected(GPT),
    )
    store.attach(sourceOf(LISTED))
    render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    fireEvent.keyDown(screen.getByRole('combobox', { name: '推理强度' }), { key: 'Enter' })
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      '模型默认',
      'low',
      'medium',
      'high',
      'xhigh（此型号未提供）',
    ])
    expect(
      screen.getByRole('option', { name: /xhigh.*此型号未提供/u }).getAttribute('aria-disabled'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: 'high' }))
    await settle()
    expect(select.mock.calls[0]?.[0]).toMatchObject({ model: GPT, reasoningEffort: 'high' })
    expect(screen.getByRole('combobox', { name: '推理强度' }).textContent).toContain('high')
  })

  it.each([
    [['high'], undefined, 'high'],
    [[], '未提供 high，切换并使用模型默认强度', undefined],
  ] as const)(
    'makes the effort used after switching explicit for a target offering %j',
    async (offered, note, expected) => {
      const { store, select } = storeWith([
        { outcome: 'succeeded', body: { model: GPT, revision: '1', reasoningEffort: 'high' } },
        selection(CLAUDE, '2'),
      ])
      store.attach(
        sourceOf({
          kind: 'listed',
          choices: [
            { route: GPT, selectable: true, note: null, reasoningEfforts: ['high'] },
            { route: CLAUDE, selectable: true, note: null, reasoningEfforts: offered },
          ],
        }),
      )
      render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
      await settle()
      fireEvent.keyDown(screen.getByRole('combobox', { name: '模型' }), { key: 'Enter' })
      const target = screen.getByRole('option', { name: /claude-y/ })
      if (note !== undefined) expect(target.textContent).toContain(note)
      fireEvent.click(target)
      await settle()
      expect(select.mock.calls[0]?.[0]).toEqual({
        tenant: expect.anything(),
        model: CLAUDE,
        session: SESSION,
        controlId: 'id-1',
        ...(expected === undefined ? {} : { reasoningEffort: expected }),
      })
    },
  )

  it('keeps the confirmed effort after a rejected change and refreshes available efforts', async () => {
    const confirmed = {
      outcome: 'succeeded',
      body: { model: GPT, revision: '1', reasoningEffort: 'medium' },
    }
    const { store } = storeWith([confirmed], {
      outcome: 'invalid',
      body: { reason: 'excluded', detail: 'unsupported-effort' },
    })
    const source = sourceOf(LISTED)
    store.attach(source)
    render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    const count = source.asked.length
    await choose('推理强度', '^high$')
    expect(screen.getByRole('combobox', { name: '推理强度' }).textContent).toContain('medium')
    expect(screen.getByRole('status').textContent).toBe('没有换：这个模型不支持所选推理强度')
    expect(source.asked.length).toBe(count + 1)
  })

  it('a refused change is said, and the model shown is the one read again', async () => {
    const { store } = storeWith([selection(GPT, '1')], {
      outcome: 'invalid',
      body: { reason: 'withdrawn' },
    })
    store.attach(sourceOf(LISTED))
    render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    await choose('模型', 'claude-y')
    expect(screen.getByRole('status').textContent).toBe('没有换：这个模型已撤下')
    expect(screen.getByRole('combobox', { name: '模型' }).textContent).toContain(GPT)
  })

  it('the current model stays shown when the list does not have it', async () => {
    const { store } = storeWith([selection('other/gone', '1')])
    store.attach(sourceOf(LISTED))
    render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    expect(screen.getByRole('combobox', { name: '模型' }).textContent).toContain('other/gone')
  })

  it('a model that cannot be read is said, with or without a list', async () => {
    const { store } = storeWith([{ outcome: 'denied' }])
    store.attach(sourceOf(LISTED))
    render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    expect(screen.getByRole('status').textContent).toBe('模型读不到：denied')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('what was said about one session is not shown on the next', async () => {
    const { store } = storeWith([selection(GPT, '1')])
    store.attach(sourceOf(LISTED))
    const view = render(<ModelAction store={store} tenant={TENANT} session={SESSION} />)
    await settle()
    await choose('模型', 'claude-y')
    expect(screen.queryByRole('status')).not.toBeNull()
    view.rerender(<ModelAction store={store} tenant={TENANT} session="s-2" />)
    await settle()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
