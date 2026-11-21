// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

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

async function openLong(fake: ReturnType<typeof createFakeClient>): Promise<void> {
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(LONG, 'say hello')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: /say hello/ }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page([], '1') })
  await settle()
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

it('对话头：页头里放形的座位，名字 header、优先级 2，在标题旁；还没有租户、还没有会话时也在', async () => {
  const fake = createFakeClient()
  const { rerender } = await mountModule(fake.client, undefined)
  const seat = () => heading().querySelector('[data-figure-seat]')
  expect(seat()?.getAttribute('data-figure-seat')).toBe('header')
  rerender(TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([]))
  await settle()
  expect(within(heading()).getByRole('heading').textContent).toBe('还没有会话')
  expect(seat()?.getAttribute('data-figure-seat')).toBe('header')
  expect(seats.length).toBeGreaterThan(0)
  expect(seats.every(props => props.name === 'header' && props.priority === 2)).toBe(true)
  expect(seat()?.closest('.omne-session-figure')?.textContent).toBe('Agent')
  expect(seat()?.closest('.omne-session-heading')).toBeNull()
})

/**
 * The layout a browser would give the heading, which happy-dom does not: the title's words want 400, a character of
 * the title is 20, the figure and its name 120, the model 200, the permissions 150, the `⋯` 32; the bar's gap 16,
 * the right end's 8. The title keeps 9.5 characters (eight, the ellipsis and room for rounding): 190.
 */
function layOut(row: number): void {
  const isMore = (element: Element) =>
    element.matches('[aria-label="更多"]') ||
    (element.parentElement?.classList.contains('omne-session-bar-end') === true &&
      element.querySelector('[aria-label="更多"]') !== null)
  const width = (element: HTMLElement): number => {
    if (element.classList.contains('omne-session-figure')) return 120
    if (element.classList.contains('omne-session-choice'))
      return element.querySelector('.omne-session-model') === null ? 150 : 200
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
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('omne-session-title') ? 400 : 0
  })
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const real = computed(element, pseudo)
    const own: Record<string, string> = element.classList.contains('omne-session-title')
      ? { fontSize: '20px', letterSpacing: '0px' }
      : element.classList.contains('omne-session-bar')
        ? { columnGap: '16px' }
        : element.classList.contains('omne-session-bar-end')
          ? { columnGap: '8px' }
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
    .map(choice => (choice.querySelector('.omne-session-model') === null ? '权限处理' : '模型'))

const foldedItems = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map(item => item.textContent)
    .filter(text => text?.startsWith('模型') === true || text?.startsWith('权限处理') === true)

it('头部放不下：标题留 8 个字，先把权限处理、再把模型收进「更多」，菜单里写当前的值', async () => {
  const cases: readonly (readonly [number, readonly string[], readonly string[]])[] = [
    [800, ['模型', '权限处理'], []],
    [600, ['模型'], ['权限处理需要时问我']],
    [400, [], ['模型openai/gpt-x', '权限处理需要时问我']],
  ]
  for (const [row, bar, folded] of cases) {
    layOut(row)
    const fake = createFakeClient()
    await openWithChoices(fake)
    expect([row, shownInBar()]).toEqual([row, bar])
    const hidden = [...heading().querySelectorAll('.omne-session-choice[data-folded]')]
    expect(hidden.every(choice => choice.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(hidden.every(choice => choice.hasAttribute('inert'))).toBe(true)
    expect(foldedItems(await openMore())).toEqual(folded)
    cleanup()
    vi.restoreAllMocks()
  }
})

it('收进「更多」的权限处理照样能改：选一个值就发，回执落在页头', async () => {
  layOut(400)
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
  const said = [...heading().querySelectorAll('.omne-session-receipt')].map(
    node => node.textContent,
  )
  expect(said).toEqual(['已改为「跳过询问」'])
  vi.restoreAllMocks()
})
