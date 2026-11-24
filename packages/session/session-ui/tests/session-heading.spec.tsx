// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page } from './fixtures/frames.ts'
import { mountModule, providerOf, TAKEN } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const LONG = `ses_${'0123456789abcdef'.repeat(4)}`

type SeatProps = ComponentProps<typeof import('@omne-harness/ui-kit').FigureSeat>
const seats = vi.hoisted(() => [] as SeatProps[])

vi.mock('@omne-harness/ui-kit', async importOriginal => {
  const kit = await importOriginal<typeof import('@omne-harness/ui-kit')>()
  return {
    ...kit,
    FigureSeat: (props: SeatProps) => {
      seats.push(props)
      return kit.FigureSeat(props)
    },
  }
})

afterEach(() => {
  cleanup()
  seats.length = 0
  vi.restoreAllMocks()
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

function heading(): HTMLElement {
  const banner = screen.getByRole('region', { name: '对话' }).querySelector('header')
  if (banner === null) throw new Error('no page header')
  return banner
}

async function openLong(fake: ReturnType<typeof createFakeClient>): Promise<Context> {
  const { root } = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(LONG, 'say hello')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: /say hello/ }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page([], '1') })
  await settle()
  return root
}

async function openMore(): Promise<HTMLElement> {
  fireEvent.pointerDown(within(heading()).getByRole('button', { name: '更多' }), {
    button: 0,
    ctrlKey: false,
  })
  return screen.findByRole('menu')
}

it('页头：主标题是列表里的名字；常驻的只有标题与座位，标识与归档收进「更多」', async () => {
  const fake = createFakeClient()
  await openLong(fake)
  const banner = heading()
  expect(within(banner).getByRole('heading').textContent).toBe('say hello')
  expect(banner.textContent).not.toContain(LONG.slice(0, 12))
  expect(within(banner).queryByRole('button', { name: '归档' })).toBeNull()
  expect(within(banner).queryByRole('button', { name: '复制会话标识' })).toBeNull()
  const menu = await openMore()
  const id = within(menu).getByTitle(LONG)
  expect(id.textContent).toBe(`${LONG.slice(0, 12)}…`)
  expect(id.previousElementSibling?.textContent).toBe('会话标识')
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map(item => item.textContent),
  ).toEqual(['复制会话标识', '归档'])
})

it('「更多」里复制会话标识：复制整串，菜单不收，回执是这一项自己的字', async () => {
  const writeText = vi.fn(async (_text: string) => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const fake = createFakeClient()
  await openLong(fake)
  const menu = await openMore()
  await act(async () =>
    fireEvent.click(within(menu).getByRole('menuitem', { name: '复制会话标识' })),
  )
  expect(writeText).toHaveBeenCalledWith(LONG)
  expect(screen.getByRole('menu')).toBe(menu)
  expect(within(menu).getByRole('menuitem', { name: '已复制会话标识' })).toBeTruthy()
})

it('「更多」里归档：不问，按下就发；结果是页头里出现一次的回执，列表重读', async () => {
  const fake = createFakeClient()
  await openLong(fake)
  const menu = await openMore()
  fireEvent.click(within(menu).getByRole('menuitem', { name: '归档' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  const archive = await fake.next('archive-session')
  expect(archive.body).toMatchObject({ session: LONG })
  archive.answer({
    outcome: 'succeeded',
    body: { kind: 'archived', controlId: 'c', runs: 1, backgroundCalls: 2 },
  })
  await settle()
  const said = [...heading().querySelectorAll('.omne-session-receipt')]
  expect(said.map(node => [node.getAttribute('role'), node.textContent])).toEqual([
    ['status', '已归档；收起 1 轮，撤回 2 项后台调用'],
  ])
  expect((await fake.next('list-sessions')).body).toMatchObject({ cursor: null })
})

it('观察：在连时页头什么都不画；断开重连时页头下面一行中性的字，写第几次', async () => {
  const fake = createFakeClient()
  await openLong(fake)
  const page = screen.getByRole('region', { name: '对话' })
  expect(page.textContent).not.toContain('正在连接')
  expect(page.textContent).not.toContain('重连')
  const observation = fake.observations[0]
  if (observation === undefined) throw new Error('no observation')
  act(() => observation.end({ kind: 'uncertain' }))
  await settle()
  const line = page.querySelector('.omne-session-connection')
  expect(line?.textContent).toBe('更新断开了，正在第 1 次重连')
  expect(line?.getAttribute('role')).toBe('status')
  expect(heading().contains(line ?? null)).toBe(false)
  expect(line?.parentElement?.classList.contains('omne-session-main')).toBe(true)
})

it('页头：会话还不在列表里时，主标题是「新会话」', async () => {
  const fake = createFakeClient()
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: LONG, recovered: false },
  })
  await settle()
  expect(within(heading()).getByRole('heading').textContent).toBe('新会话')
})

it('没有会话时没有头部、座位不在，形留在家；主区正中只有一行，不画成标题', async () => {
  const fake = createFakeClient()
  const { rerender } = await mountModule(fake.client, undefined)
  const page = () => screen.getByRole('region', { name: '对话' })
  expect(page().querySelector('header')).toBeNull()
  expect(page().querySelector('[data-figure-seat]')).toBeNull()
  expect(page().textContent).toBe('')
  rerender(TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  expect(page().querySelector('header')).toBeNull()
  expect(page().querySelector('[data-figure-seat]')).toBeNull()
  expect(within(page()).queryByRole('heading')).toBeNull()
  expect(page().textContent).toBe('点「新建会话」开始一段对话。')
  const line = within(page()).getByText('点「新建会话」开始一段对话。')
  expect(line.closest('.omne-empty')?.getAttribute('data-empty')).toBe('none')
  expect(seats).toEqual([])
})

it('对话头：页头里放形的座位，名字 header、优先级 2，在正中、名字在它右边；会话打开了才有', async () => {
  const fake = createFakeClient()
  await openLong(fake)
  const seat = () => heading().querySelector('[data-figure-seat]')
  expect(seat()?.getAttribute('data-figure-seat')).toBe('header')
  expect(seats.length).toBeGreaterThan(0)
  expect(seats.every(props => props.name === 'header' && props.priority === 2)).toBe(true)
  expect(seat()?.closest('.omne-session-figure')?.textContent).toBe('Agent')
  expect(seat()?.nextElementSibling?.textContent).toBe('Agent')
  expect([...heading().children].map(child => child.className)).toEqual([
    'omne-session-title',
    'omne-session-figure',
    'omne-session-bar-end',
  ])
  expect(seat()?.closest('.omne-session-heading')).toBeNull()
})

/**
 * The layout a browser would give the heading, which happy-dom does not: the figure and its name 120, the model 200,
 * the workspace 180, the permissions 150, the `⋯` 32; the bar's gap 16, the right end's 8, and `corner` kept clear at the end's far
 * side. The title and the end each have a side column, (row − 120 − 2 × 16) / 2: the end wants 398, 240 with the
 * permissions folded, 32 with both.
 */
const CHOICE_WIDTHS = [
  ['.omne-session-model', 200],
  ['.omne-session-workspace', 180],
] as const

function layOut(row: number, corner = 0): void {
  const isMore = (element: Element) =>
    element.matches('[aria-label="更多"]') ||
    (element.parentElement?.classList.contains('omne-session-bar-end') === true &&
      element.querySelector('[aria-label="更多"]') !== null)
  const width = (element: HTMLElement): number => {
    if (element.classList.contains('omne-session-figure')) return 120
    if (element.classList.contains('omne-session-choice'))
      return CHOICE_WIDTHS.find(([name]) => element.querySelector(name) !== null)?.[1] ?? 150
    return isMore(element) ? 32 : 0
  }
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return width(this)
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('omne-session-bar') ? row : 0
  })
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const real = computed(element, pseudo)
    const own: Record<string, string> = element.classList.contains('omne-session-bar')
      ? { columnGap: '16px' }
      : element.classList.contains('omne-session-bar-end')
        ? { columnGap: '8px', marginInlineEnd: `${corner}px` }
        : {}
    return new Proxy(real, {
      get: (target, key) => {
        if (typeof key === 'string' && key in own) return own[key]
        const value = Reflect.get(target, key) as unknown
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value
      },
    })
  })
}

async function openWithChoices(fake: ReturnType<typeof createFakeClient>): Promise<void> {
  await openLong(fake)
  ;(await fake.next('read-model-selection')).answer({
    outcome: 'succeeded',
    body: { model: 'openai/gpt-x', revision: '1' },
  })
  ;(await fake.next('read-permission-mode')).answer({
    outcome: 'succeeded',
    body: { mode: 'auto_permission', revision: '4' },
  })
  await settle()
}

const shownInBar = () =>
  [...heading().querySelectorAll('.omne-session-choice')]
    .filter(choice => !choice.hasAttribute('data-folded'))
    .map(choice =>
      choice.querySelector('.omne-session-model') !== null
        ? '模型'
        : choice.querySelector('.omne-session-workspace') !== null
          ? '工作区'
          : '权限处理',
    )

const foldedItems = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map(item => item.textContent)
    .filter(text => ['模型', '工作区', '权限处理'].some(name => text?.startsWith(name) === true))

it('头部三栏放不下：右端只用自己那一栏，留出远端让开的宽，先把权限处理、再把模型收进「更多」，菜单里写当前的值', async () => {
  const cases: readonly (readonly [number, number, readonly string[], readonly string[]])[] = [
    [1000, 0, ['模型', '权限处理'], []],
    [800, 0, ['模型'], ['权限处理需要时问我']],
    [560, 0, [], ['模型openai/gpt-x', '权限处理需要时问我']],
    [1000, 100, ['模型'], ['权限处理需要时问我']],
  ]
  for (const [row, corner, bar, folded] of cases) {
    layOut(row, corner)
    const fake = createFakeClient()
    await openWithChoices(fake)
    expect([row, corner, shownInBar()]).toEqual([row, corner, bar])
    const hidden = [...heading().querySelectorAll('.omne-session-choice[data-folded]')]
    expect(hidden.every(choice => choice.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(hidden.every(choice => choice.hasAttribute('inert'))).toBe(true)
    expect(foldedItems(await openMore())).toEqual(folded)
    cleanup()
    vi.restoreAllMocks()
  }
})

it('收进「更多」的推理强度沿用型号能力，选择后读回会话档位', async () => {
  layOut(560)
  const fake = createFakeClient()
  const root = await openLong(fake)
  const model = 'test/reasoner'
  await act(async () => {
    providerOf(root, TAKEN.modelChoices).attach({
      list: async () => ({
        kind: 'listed',
        choices: [
          { route: model, selectable: true, note: null, reasoningEfforts: ['high', 'xhigh'] },
        ],
      }),
    })
  })
  ;(await fake.next('read-model-selection')).answer({
    outcome: 'succeeded',
    body: { model, revision: '1', reasoningEffort: 'high' },
  })
  ;(await fake.next('read-permission-mode')).answer({
    outcome: 'succeeded',
    body: { mode: 'auto_permission', revision: '1' },
  })
  await settle()
  const menu = await openMore()
  fireEvent.keyDown(within(menu).getByRole('menuitem', { name: /^推理强度/ }), {
    key: 'ArrowRight',
  })
  const choices = await screen.findByRole('menu', { name: /^推理强度/ })
  expect(
    within(choices)
      .getByRole('menuitemradio', { name: /low.*此型号未提供/u })
      .getAttribute('aria-disabled'),
  ).toBe('true')
  fireEvent.click(within(choices).getByRole('menuitemradio', { name: 'xhigh' }))
  const change = await fake.next('select-model')
  expect(change.body).toMatchObject({ session: LONG, model, reasoningEffort: 'xhigh' })
  change.answer({ outcome: 'succeeded', body: { controlId: 'c', model, credential: 'available' } })
  await settle()
  ;(await fake.next('read-model-selection')).answer({
    outcome: 'succeeded',
    body: { model, revision: '2', reasoningEffort: 'xhigh' },
  })
  await settle()
  expect(within(await openMore()).getByRole('menuitem', { name: /^推理强度/ }).textContent).toBe(
    '推理强度xhigh',
  )
})

it('收进「更多」的权限处理照样能改：选一个值就发；改成了页头不写「已改为……」，菜单里写新的值', async () => {
  layOut(560)
  const fake = createFakeClient()
  await openWithChoices(fake)
  const menu = await openMore()
  const trigger = within(menu).getByRole('menuitem', { name: /^权限处理/ })
  fireEvent.keyDown(trigger, { key: 'ArrowRight' })
  const choices = await screen.findByRole('menu', { name: /^权限处理/ })
  fireEvent.click(within(choices).getByRole('menuitemradio', { name: '跳过询问' }))
  const change = await fake.next('change-permission-mode')
  expect(change.body).toMatchObject({
    session: LONG,
    mode: 'bypass-permissions',
    expectedRevision: '4',
  })
  change.answer({ outcome: 'succeeded', body: { mode: 'bypass-permissions', revision: '5' } })
  await settle()
  ;(await fake.next('read-permission-mode')).answer({
    outcome: 'succeeded',
    body: { mode: 'bypass-permissions', revision: '5' },
  })
  await settle()
  expect(heading().querySelector('.omne-session-receipt')).toBeNull()
  expect(heading().textContent).not.toMatch(/已改为/u)
  const again = await openMore()
  expect(within(again).getByRole('menuitem', { name: /^权限处理/ }).textContent).toBe(
    '权限处理跳过询问',
  )
  vi.restoreAllMocks()
})

const BLOG = { workspace: 'wsp_blog', instance: 'wsi_blog' }
const SHOP = { workspace: 'wsp_shop', instance: 'wsi_shop' }

it('头部放不下：工作区最先收进「更多」，菜单里写当前的工作区与工作目录，照样能换', async () => {
  layOut(1000)
  const fake = createFakeClient()
  const root = await openLong(fake)
  const holder = providerOf(root, TAKEN.workspaceChoices)
  await act(async () => {
    holder.attach({
      list: async () => ({
        kind: 'listed',
        choices: [
          { ...BLOG, label: 'blog', selectable: true, note: null },
          { ...SHOP, label: 'shop', selectable: true, note: null },
        ],
      }),
    })
  })
  const attached = (workspace: typeof BLOG, revision: string) => ({
    outcome: 'succeeded' as const,
    body: {
      workspace,
      state: 'attached',
      directory: `/srv/${workspace.instance.slice(4)}`,
      reason: null,
      revision,
    },
  })
  ;(await fake.next('read-workspace-selection')).answer(attached(BLOG, '1'))
  ;(await fake.next('read-model-selection')).answer({
    outcome: 'succeeded',
    body: { model: 'openai/gpt-x', revision: '1' },
  })
  ;(await fake.next('read-permission-mode')).answer({
    outcome: 'succeeded',
    body: { mode: 'auto_permission', revision: '4' },
  })
  await settle()
  expect(shownInBar()).toEqual(['模型', '权限处理'])
  const menu = await openMore()
  expect(foldedItems(menu)).toEqual(['工作区blog'])
  expect(within(menu).getByTitle('工作目录：/srv/blog').textContent).toBe('工作目录：/srv/blog')
  fireEvent.keyDown(within(menu).getByRole('menuitem', { name: /^工作区/ }), { key: 'ArrowRight' })
  const choices = await screen.findByRole('menu', { name: /^工作区/ })
  expect(
    within(choices)
      .getAllByRole('menuitemradio')
      .map(item => item.textContent),
  ).toEqual(['不选工作区', 'blog', 'shop'])
  fireEvent.click(within(choices).getByRole('menuitemradio', { name: 'shop' }))
  const moved = await fake.next('select-workspace')
  expect(moved.body).toMatchObject({ session: LONG, workspace: SHOP })
  moved.answer({ outcome: 'succeeded', body: { controlId: 'c', directory: '/srv/shop' } })
  await settle()
  ;(await fake.next('read-workspace-selection')).answer(attached(SHOP, '2'))
  await settle()
  expect(heading().querySelector('.omne-session-receipt')?.textContent).toBe('已换到 /srv/shop')
  expect(foldedItems(await openMore())).toEqual(['工作区shop'])
})

const menuItems = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map(item => item.textContent)

it.each([
  [
    '没有工作区可选：只写工作目录，不写工作区',
    {
      outcome: 'succeeded',
      body: {
        workspace: null,
        state: 'default',
        directory: '/srv/default',
        reason: null,
        revision: '1',
      },
    },
    '工作目录：/srv/default',
  ],
  ['工作目录读不到：写读不到', { outcome: 'unknown' }, '工作目录读不到：unknown'],
] as const)('头部放不下、工作区收进「更多」时，%s', async (_, read, said) => {
  layOut(1000)
  const fake = createFakeClient()
  await openLong(fake)
  ;(await fake.next('read-workspace-selection')).answer(read)
  ;(await fake.next('read-model-selection')).answer({
    outcome: 'succeeded',
    body: { model: 'openai/gpt-x', revision: '1' },
  })
  ;(await fake.next('read-permission-mode')).answer({
    outcome: 'succeeded',
    body: { mode: 'auto_permission', revision: '4' },
  })
  await settle()
  expect(shownInBar()).toEqual(['模型', '权限处理'])
  const items = menuItems(await openMore())
  expect(items).toContain(said)
  expect(items.filter(text => text?.startsWith('工作区') === true)).toEqual([])
})
