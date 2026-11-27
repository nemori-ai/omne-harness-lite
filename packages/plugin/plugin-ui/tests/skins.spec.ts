import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { choiceIn, type LookChoice, type LookStore } from '@omne-harness/plugin-ui'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import {
  STYLE_POINT,
  defineKeyedPoint,
  TOKENS_POINT,
  definePart,
  lookScope,
  tenantScope,
} from '@omne-harness/shell-contract'
import { ReferenceShell, serveProtocol, startShellOf } from '@omne-harness/shell-contract/testing'
import { fakeSource, given, givenSkin } from './support/fake-source.ts'

/** The place above the list of one category of the assets page, as the application hands it to the loader. */
const skinsAbove = defineKeyedPoint<Readonly<{ category: string }>>({
  name: 'assets.category',
  subject: { encode: value => value.category, decode: text => ({ category: text }) },
})

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const BOB =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'
const NONE: LookChoice = { kind: 'none' }
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
const colored = (color: string) => ({
  point: STYLE_POINT,
  key: 'notes.send',
  data: { base: { color } },
})

async function world(kept: Readonly<Record<string, LookChoice>> = {}) {
  const started = await startShellOf(Signed)
  started.shell.scope.set(ALICE)
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply: (ctx: Context) => send.declare(ctx.shell),
  })
  const source = fakeSource()
  await serveProtocol(started.root, pluginProtocol, source.client)
  const texts = new Map(
    Object.entries(kept).map(([tenant, choice]) => [tenant, JSON.stringify(choice)]),
  )
  const looks: LookStore = {
    read: tenant => texts.get(tenant) ?? null,
    write: (tenant, text) => void texts.set(tenant, text),
  }
  const store = { get: (tenant: string) => choiceIn(texts.get(tenant) ?? null) }
  await started.root.plugin(
    createPluginUiModule({ backoff: { delayMs: () => 1 }, looks, skinsAbove }),
  )
  /** Who put what stands on the key, and in which scope, for whoever asks as the shell asks now. */
  const standing = () =>
    started.shell
      .changes()
      .standing.filter(each => each.point === STYLE_POINT)
      .map(each => [each.by.join('+'), each.scope])
  const css = () => started.shell.changes().css
  return { ...started, source, store, standing, css }
}

describe('skins on the client tree', () => {
  it('puts a skin in the scope of its own look and the rest in the scope of the tenant; the only skin is worn and remembered', async () => {
    const t = await world()
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      given('brand', 'v1', colored('red')),
    ])
    await vi.waitFor(() => expect(t.shell.look()).toBe('sea'))
    expect(t.standing()).toEqual([['plugin:sea@v1', lookScope(ALICE, 'sea')]])
    expect(t.css()).toContain('color:blue')
    expect(t.store.get(ALICE)).toEqual(named('sea'))
    t.shell.wear(undefined)
    expect(t.standing()).toEqual([['plugin:brand@v1', tenantScope(ALICE)]])
  })

  it('two skins on one key are not a conflict: with nothing chosen none is worn, and the interface is as without a skin', async () => {
    const t = await world()
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      givenSkin('ink', 'v1', colored('black')),
    ])
    await vi.waitFor(() => expect(t.source.reports.at(-1)).toMatchObject({ plugins: [{}, {}] }))
    expect(t.shell.look()).toBeUndefined()
    expect(t.standing()).toEqual([])
    expect(t.shell.changes().conflicts).toEqual([])
    expect(t.store.get(ALICE)).toEqual(NONE)
  })

  it('wears the skin remembered, whichever comes up first', async () => {
    const t = await world({ [ALICE]: named('ink') })
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      givenSkin('ink', 'v1', colored('black')),
    ])
    await vi.waitFor(() => expect(t.shell.look()).toBe('ink'))
    expect(t.standing()).toEqual([['plugin:ink@v1', lookScope(ALICE, 'ink')]])
    expect(t.css()).toContain('color:black')
    expect(t.css()).not.toContain('color:blue')
  })

  it('the skin worn leaves what is to load: the one that is left is worn', async () => {
    const t = await world({ [ALICE]: named('ink') })
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      givenSkin('ink', 'v1', colored('black')),
    ])
    await vi.waitFor(() => expect(t.shell.look()).toBe('ink'))
    t.source.set(ALICE, [givenSkin('sea', 'v1', colored('blue'))])
    await vi.waitFor(() => expect(t.shell.look()).toBe('sea'))
    expect(t.store.get(ALICE)).toEqual(named('sea'))
  })

  it('keeps the skin worn and the choice while the source cannot be read', async () => {
    const t = await world({ [ALICE]: named('sea') })
    t.source.set(ALICE, [givenSkin('sea', 'v1', colored('blue'))])
    await vi.waitFor(() => expect(t.shell.look()).toBe('sea'))
    const before = t.source.asked.length
    t.source.set(ALICE, 'unavailable')
    await vi.waitFor(() => expect(t.source.asked.length).toBeGreaterThan(before + 1))
    expect(t.shell.look()).toBe('sea')
    expect(t.store.get(ALICE)).toEqual(named('sea'))
  })

  it('another tenant signs in: the look is taken off, and the skin of the one before is not seen even under its name', async () => {
    const t = await world({ [ALICE]: named('sea') })
    t.source.set(ALICE, [givenSkin('sea', 'v1', colored('blue'))])
    await vi.waitFor(() => expect(t.shell.look()).toBe('sea'))
    t.shell.scope.set(BOB)
    await vi.waitFor(() => expect(t.source.asked.at(-1)).toBe(BOB))
    expect(t.shell.look()).toBeUndefined()
    t.shell.wear('sea')
    expect(t.standing()).toEqual([])
    expect(t.store.get(BOB)).toEqual(NONE)
  })

  it('a skin with a member the interface does not take fails to load though it is not worn: it is judged in the scope it is put in', async () => {
    const t = await world({ [ALICE]: named('sea') })
    t.source.set(ALICE, [
      givenSkin('sea', 'v1', colored('blue')),
      givenSkin('odd', 'v1', { ...colored('red'), data: { base: { '--omne-accent': 'red' } } }),
    ])
    await vi.waitFor(() =>
      expect(t.source.reports.at(-1)).toMatchObject({
        plugins: [
          {
            name: 'odd',
            state: 'failed',
            reason: `${STYLE_POINT} notes.send: --omne-accent is a token: tokens are put on ${TOKENS_POINT}`,
          },
          { name: 'sea', state: 'loaded' },
        ],
      }),
    )
    await vi.waitFor(() => expect(t.shell.look()).toBe('sea'))
  })

  it('a kind the reader does not know fails to load with the reason, and is not put as a plain plugin', async () => {
    const t = await world()
    const theme = givenSkin('odd', 'v1', colored('pink'))
    t.source.set(ALICE, [{ ...theme, manifest: theme.manifest.replace('"skin"', '"theme"') }])
    await vi.waitFor(() =>
      expect(t.source.reports.at(-1)).toMatchObject({
        plugins: [{ name: 'odd', state: 'failed' }],
      }),
    )
    expect(JSON.stringify(t.source.reports.at(-1))).toContain('the kind \\"theme\\" is not one')
    expect(t.standing()).toEqual([])
    expect(t.css()).not.toContain('pink')
  })
})
