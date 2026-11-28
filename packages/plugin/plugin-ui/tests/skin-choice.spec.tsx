// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { choiceIn, type LookChoice, type LookStore } from '@omne-harness/plugin-ui'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { STYLE_POINT, defineKeyedPoint, definePart } from '@omne-harness/shell-contract'
import { ReferenceShell, serveProtocol, startShellOf } from '@omne-harness/shell-contract/testing'
import type { Wear, WearView } from '../src/looks.ts'
import { SkinChoice, noteOf } from '../src/view/skin-choice.tsx'
import { fakeSource, given, givenSkin } from './support/fake-source.ts'

/** The place above the list of one category of the assets page, as the application hands it to the loader. */
const skinsAbove = defineKeyedPoint<Readonly<{ category: string }>>({
  title: 'test',
  name: 'assets.category',
  subject: { encode: value => value.category, decode: text => ({ category: text }) },
})

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const named = (name: string): LookChoice => ({ kind: 'named', name })

class Signed extends ReferenceShell {
  private readonly listeners = new Set<(scope: string | undefined) => void>()
  override readonly scope = {
    get: () => this.tenant,
    set: (scope: string | undefined) => {
      this.tenant = scope
      this.rescope()
      for (const listener of this.listeners) listener(scope)
    },
    subscribe: (listener: (scope: string | undefined) => void) => {
      this.listeners.add(listener)
      return () => void this.listeners.delete(listener)
    },
  }
}

const send = definePart({
  name: 'notes.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  depths: ['style'],
})
const aboveCategory = defineKeyedPoint<Readonly<{ category: string }>>({
  title: 'test',
  name: 'assets.category',
  subject: { encode: value => value.category, decode: text => ({ category: text }) },
})
const colored = (color: string) => ({
  point: STYLE_POINT,
  key: 'notes.send',
  data: { base: { color } },
})
const broken = { ...colored('red'), data: { base: { '--omne-accent': 'red' } } }

afterEach(cleanup)

async function world(kept?: LookChoice) {
  const started = await startShellOf(Signed)
  started.shell.scope.set(ALICE)
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply: (ctx: Context) => send.declare(ctx.shell),
  })
  await started.root.plugin({
    name: 'assets-ui',
    inject: ['shell'],
    apply: (ctx: Context) => aboveCategory.declare(ctx.shell),
  })
  const source = fakeSource()
  await serveProtocol(started.root, pluginProtocol, source.client)
  const texts = new Map<string, string>()
  if (kept !== undefined) texts.set(ALICE, JSON.stringify(kept))
  const looks: LookStore = {
    read: tenant => texts.get(tenant) ?? null,
    write: (tenant, text) => void texts.set(tenant, text),
  }
  await started.root.plugin(
    createPluginUiModule({ backoff: { delayMs: () => 1 }, looks, skinsAbove }),
  )
  const above = (key: string) =>
    aboveCategory.slot(started.shell, key, { category: key }, items => items.map(item => item.node))
  const show = () => render(<div>{above('skin')}</div>)
  const kept_ = () => choiceIn(texts.get(ALICE) ?? null)
  return { ...started, source, above, show, kept: kept_ }
}

const radio = (name: string) => screen.getByRole('radio', { name })
const checked = () =>
  screen
    .getAllByRole('radio')
    .filter(each => each.getAttribute('aria-checked') === 'true')
    .map(each => each.getAttribute('aria-label'))

describe('where a person switches the skin', () => {
  it('is put above the list of the category skin and of no other, and shows nothing while the tenant has no skin', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.source.reports.at(-1)).toMatchObject({ plugins: [{}] }))
    expect(render(<div>{t.above('plugin')}</div>).container.textContent).toBe('')
    expect(t.show().container.textContent).toBe('')
  })

  it('lists the built-in look and each skin by name, marks the one worn, and asks for a choice where two are up and none is chosen', async () => {
    const t = await world()
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      givenSkin('ink', 'v1', colored('black')),
    ])
    await vi.waitFor(() => expect(t.source.reports.at(-1)).toMatchObject({ plugins: [{}, {}] }))
    t.show()
    expect(screen.getAllByRole('radio').map(each => each.getAttribute('aria-label'))).toEqual([
      '自带的样子',
      'ink',
      'sea',
    ])
    expect(checked()).toEqual([])
    expect(screen.getByText(/选一套，整个界面一起换/u)).toBeDefined()
    expect(screen.queryByText('在用')).toBeNull()
  })

  it('a click on a skin wears it at once and remembers it; a click on the built-in look takes it off', async () => {
    const t = await world()
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      givenSkin('ink', 'v1', colored('black')),
    ])
    await vi.waitFor(() => expect(t.source.reports.at(-1)).toMatchObject({ plugins: [{}, {}] }))
    t.show()
    act(() => void fireEvent.click(radio('ink')))
    expect(t.shell.look()).toBe('ink')
    expect(t.shell.changes().css).toContain('color:black')
    expect(checked()).toEqual(['ink'])
    expect(radio('ink').closest('label')?.textContent).toContain('在用')
    expect(t.kept()).toEqual(named('ink'))
    act(() => void fireEvent.click(radio('sea')))
    expect(t.shell.look()).toBe('sea')
    expect(t.shell.changes().css).not.toContain('color:black')
    act(() => void fireEvent.click(radio('自带的样子')))
    expect(t.shell.look()).toBeUndefined()
    expect(checked()).toEqual(['自带的样子'])
    expect(radio('自带的样子').closest('label')?.textContent).toContain('在用')
    expect(t.kept()).toEqual({ kind: 'builtin' })
  })

  it('a skin that did not load says why and cannot be chosen; the one remembered that did not load stays chosen and is not worn', async () => {
    const t = await world(named('odd'))
    t.source.set(ALICE, [givenSkin('sea', 'v1', colored('blue')), givenSkin('odd', 'v1', broken)])
    await vi.waitFor(() =>
      expect(t.source.reports.at(-1)).toMatchObject({
        plugins: [{ name: 'odd', state: 'failed' }, { name: 'sea' }],
      }),
    )
    t.show()
    expect(radio('odd').hasAttribute('disabled')).toBe(true)
    expect(radio('odd').closest('label')?.textContent).toMatch(/没装上：/u)
    expect(checked()).toEqual(['odd'])
    expect(t.shell.look()).toBeUndefined()
    expect(radio('自带的样子').closest('label')?.textContent).toContain('在用')
    expect(radio('odd').closest('label')?.textContent).not.toContain('在用')
  })

  it('follows what changes while it is shown: a skin that comes up later appears', async () => {
    const t = await world()
    t.source.set(ALICE, [givenSkin('sea', 'v1', colored('blue'))])
    await vi.waitFor(() => expect(t.shell.look()).toBe('sea'))
    t.show()
    expect(checked()).toEqual(['sea'])
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      givenSkin('ink', 'v1', colored('black')),
    ])
    await vi.waitFor(() => expect(screen.queryByRole('radio', { name: 'ink' })).not.toBeNull())
    expect(checked()).toEqual(['sea'])
  })
})

describe('what a row says of its skin', () => {
  const view = (choice: LookChoice, worn?: string) => ({ listed: true, skins: [], worn, choice })
  const none: LookChoice = { kind: 'none' }

  it('says it is in use when it is worn, whatever its state', () => {
    expect(noteOf({ name: 'sea', state: 'loading' }, view(named('sea'), 'sea'))).toBe('在用')
  })

  it.each<[string, Parameters<typeof noteOf>[0], LookChoice, string]>([
    ['up and not worn', { name: 'sea', state: 'loaded' }, none, ''],
    ['loading, chosen', { name: 'sea', state: 'loading' }, named('sea'), '已选，正在装，装上就换'],
    ['loading, another chosen', { name: 'sea', state: 'loading' }, named('ink'), '正在装'],
    [
      'failed with a reason',
      { name: 'sea', state: 'failed', reason: 'no part' },
      none,
      '没装上：no part',
    ],
    ['failed with none', { name: 'sea', state: 'failed' }, none, '没装上：没有说原因'],
    [
      'held back',
      { name: 'sea', state: 'held' },
      none,
      '应用连着两次没起来，这一套已停下。发布新的一版，或禁用它',
    ],
  ])('%s', (_, now, choice, note) => {
    expect(noteOf(now, view(choice))).toBe(note)
  })
})

describe('the block as drawn from what the wear shows', () => {
  const none: LookChoice = { kind: 'none' }
  const still = (view: WearView | undefined): Wear => ({
    open: () => undefined,
    settle: () => undefined,
    close: () => undefined,
    view: () => view,
    choose: () => undefined,
    watch: () => () => undefined,
  })
  const drawn = (view: WearView) => {
    render(<SkinChoice wear={still(view)} />)
    const row = (label: string) => screen.getByRole('radio', { name: label })
    return {
      hint: document.querySelector('.plugin-skins-hint')?.textContent,
      note: (label: string) =>
        row(label).closest('label')?.querySelector('.plugin-skin-note')?.textContent,
      disabled: (label: string) => row(label).hasAttribute('disabled'),
    }
  }

  it.each<[string, WearView | undefined]>([
    ['before the skins are known', undefined],
    [
      'while the list is not read',
      { listed: false, skins: [{ name: 'sea', state: 'loaded' }], worn: undefined, choice: none },
    ],
    ['where there is none', { listed: true, skins: [], worn: undefined, choice: none }],
  ])('draws nothing %s', (_, view) => {
    const { container } = render(<SkinChoice wear={still(view)} />)
    expect(container.innerHTML).toBe('')
  })

  it('asks a person to choose while nothing is chosen, and says nothing on the look it shipped with', () => {
    const t = drawn({
      listed: true,
      skins: [{ name: 'sea', state: 'loaded' }],
      worn: undefined,
      choice: none,
    })
    expect(t.hint).toMatch(/^选一套/u)
    expect(t.note('自带的样子')).toBe('')
  })

  it('once chosen, asks to click another; the look it shipped with says it is in use only while it is worn', () => {
    const worn = drawn({
      listed: true,
      skins: [{ name: 'sea', state: 'loaded' }],
      worn: 'sea',
      choice: named('sea'),
    })
    expect(worn.hint).toMatch(/^点另一套/u)
    expect(worn.note('自带的样子')).toBe('')
    expect(worn.note('sea')).toBe('在用')
    cleanup()
    const own = drawn({
      listed: true,
      skins: [{ name: 'sea', state: 'loaded' }],
      worn: undefined,
      choice: { kind: 'builtin' },
    })
    expect(own.note('自带的样子')).toBe('在用')
  })

  it('a skin still loading can be chosen; one that failed or was held back cannot', () => {
    const t = drawn({
      listed: true,
      skins: [
        { name: 'sea', state: 'loading' },
        { name: 'ink', state: 'failed', reason: 'no part' },
        { name: 'odd', state: 'held' },
      ],
      worn: undefined,
      choice: none,
    })
    expect(t.disabled('sea')).toBe(false)
    expect(t.disabled('ink')).toBe(true)
    expect(t.disabled('odd')).toBe(true)
  })
})
