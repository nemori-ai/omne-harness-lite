// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { choiceIn, type LookChoice, type LookStore } from '@omne-harness/plugin-ui'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { STYLE_POINT, defineKeyedPoint, definePart } from '@omne-harness/shell-contract'
import { ReferenceShell, serveProtocol, startShellOf } from '@omne-harness/shell-contract/testing'
import { fakeSource, given, givenSkin } from './support/fake-source.ts'

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
  name: 'assets.category',
  subject: { encode: value => value.category, decode: text => ({ category: text }) },
})
const colored = (color: string) => ({
  point: STYLE_POINT,
  key: 'notes.send',
  data: { base: { color } },
})
const broken = { ...colored('red'), key: 'notes.nowhere' }

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
  await started.root.plugin(createPluginUiModule({ backoff: { delayMs: () => 1 }, looks }))
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
