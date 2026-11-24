// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import {
  TOKENS_POINT,
  definePart,
  defineRenderPoint,
  lookScope,
  tenantScope,
} from '@omne-harness/shell-contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adoptChanges, tokenOf, tokensOf } from '../src/page/shell/changes-sheet.ts'
import { CHAT, SETTINGS, current, settle, setup } from './support/shell-setup.tsx'

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const EMPTY = '@layer omne-changes{}'
const GREEN = '@layer omne-changes{:root{--omne-accent:#0a7;}}'
const known = (name: string): boolean => name === '--omne-accent'

afterEach(cleanup)

describe('the sheet of the changes', () => {
  it('follows the registry and the tenant on show, and is empty again when the change is taken back', async () => {
    const t = await setup({ login: 'signed-in', knowsToken: known })
    expect(t.state.sheet.get()).toBe(EMPTY)
    const brand = await t.module('brand')
    const take = brand.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, tenantScope(ALICE))
    await settle()
    expect(t.state.sheet.get()).toBe(EMPTY)
    t.state.scope.set(ALICE)
    expect(t.state.sheet.get()).toBe(GREEN)
    t.state.scope.set(BOB)
    expect(t.state.sheet.get()).toBe(EMPTY)
    t.state.scope.set(ALICE)
    await take()
    await settle()
    expect(t.state.sheet.get()).toBe(EMPTY)
  })

  it('follows the look the shell wears: what is put for a look reaches the sheet while that look is worn', async () => {
    const t = await setup({ login: 'signed-in', knowsToken: known })
    t.state.scope.set(ALICE)
    const sea = await t.module('sea')
    sea.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, lookScope(ALICE, 'sea'))
    await settle()
    expect(t.state.sheet.get()).toBe(EMPTY)
    t.service.wear('sea')
    expect(t.state.sheet.get()).toBe(GREEN)
    t.service.wear('ink')
    expect(t.state.sheet.get()).toBe(EMPTY)
    t.service.wear('sea')
    t.state.scope.set(BOB)
    expect(t.state.sheet.get()).toBe(EMPTY)
  })

  it('a token the page does not know does not reach the sheet', async () => {
    const t = await setup({ login: 'signed-in', knowsToken: known })
    t.state.scope.set(ALICE)
    const brand = await t.module('brand')
    brand.shell.putTokens('shell.app', { '--omne-brand': '#0a7' }, tenantScope(ALICE))
    await settle()
    expect(t.state.sheet.get()).toBe(EMPTY)
    expect(t.service.changes().refused.map(out => out.reason)).toEqual([
      '--omne-brand is not a token of the interface',
    ])
  })

  it('names the nearest tokens when it refuses a name, from the tokens the page lists', async () => {
    const tokens = () => [
      { name: '--omne-accent', now: '#0a7' },
      { name: '--omne-surface', now: null },
    ]
    const t = await setup({ login: 'signed-in', knowsToken: known, tokens })
    t.state.scope.set(ALICE)
    const brand = await t.module('brand')
    brand.shell.putTokens('shell.app', { '--accent': '#0a7' }, tenantScope(ALICE))
    await settle()
    expect(t.service.changes().refused.map(out => out.reason)).toEqual([
      '--accent is not a token of the interface. Nearest: --omne-accent. OmneExtensionPoints show shell.tokens lists them all.',
    ])
    const told = t.service.described().points
    expect(told.find(point => point.name === TOKENS_POINT)?.dataKeys).toEqual(tokens())
    expect(told.filter(point => point.dataKeys !== undefined).map(point => point.name)).toEqual([
      'shell.icon',
      TOKENS_POINT,
    ])
  })

  it('lists the tokens the sheets of the page set at the root, by name, with their value now', () => {
    const style = document.createElement('style')
    style.textContent = [
      ':root { --omne-ink: #111; --omne-accent: #0a7; --kami-ink: #000; color: red; }',
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --omne-dark-only: #222; } }',
      '.elsewhere { --omne-not-root: 1px; }',
    ].join('\n')
    document.head.append(style)
    document.documentElement.style.setProperty('--omne-ink', '#111')
    document.documentElement.style.setProperty('--omne-accent', '#0a7')
    try {
      expect(tokensOf(document)()).toEqual([
        { name: '--omne-accent', now: '#0a7' },
        { name: '--omne-dark-only', now: null },
        { name: '--omne-ink', now: '#111' },
      ])
      expect(tokenOf(document)('--omne-dark-only')).toBe(true)
      expect(tokenOf(document)('--omne-not-root')).toBe(false)
    } finally {
      style.remove()
      document.documentElement.style.removeProperty('--omne-ink')
      document.documentElement.style.removeProperty('--omne-accent')
    }
  })

  it('lists no token, and does not throw, where a sheet cannot be read', () => {
    const page = {
      styleSheets: [
        {
          get cssRules(): never {
            throw new DOMException('cross origin', 'SecurityError')
          },
        },
      ],
      documentElement: document.documentElement,
    } as unknown as Document
    expect(tokensOf(page)()).toEqual([])
  })

  it('is adopted by the page after its own sheets, rewritten as the text changes, and let go when stopped', () => {
    let text = EMPTY
    const listeners = new Set<(css: string) => void>()
    const sheet = {
      get: () => text,
      set(css: string) {
        text = css
        for (const listener of Array.from(listeners)) listener(css)
      },
      subscribe(listener: (css: string) => void) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    }
    const before = document.adoptedStyleSheets.length
    const stop = adoptChanges(document, sheet)
    const adopted = document.adoptedStyleSheets.at(-1)!
    expect(document.adoptedStyleSheets).toHaveLength(before + 1)
    sheet.set(':root{--omne-accent:#0a7;}')
    expect(Array.from(adopted.cssRules, rule => rule.cssText).join('')).toContain('--omne-accent')
    stop()
    expect(document.adoptedStyleSheets).toHaveLength(before)
    expect(listeners.size).toBe(0)
  })

  it('a token of the interface is a name under --omne- that the root of the page gives a value', () => {
    document.documentElement.style.setProperty('--omne-accent', '#123')
    document.documentElement.style.setProperty('--kami-ink', '#000')
    const knows = tokenOf(document)
    expect(knows('--omne-accent')).toBe(true)
    expect(knows('--omne-nothing')).toBe(false)
    expect(knows('--kami-ink')).toBe(false)
    document.documentElement.style.removeProperty('--omne-accent')
    document.documentElement.style.removeProperty('--kami-ink')
  })
})

describe('the drawing of a part in the desktop shell', () => {
  const note = definePart<{ words: string }>({
    name: 'notes.message',
    label: '一条笔记',
    summary: '写下的一条',
    depths: ['render'],
  })
  const shown = () => document.querySelector('[data-note]')?.getAttribute('data-note')

  function Broken(): never {
    throw new Error('this drawing is broken')
  }

  it('is the one put on it for the tenant on show; one that throws while it is drawn falls back to what shipped', async () => {
    const t = await setup({ login: 'signed-in' })
    const host = await t.module('notes-ui')
    note.declare(host.shell)
    await act(async () => {
      t.state.scope.set(ALICE)
      await settle()
    })
    render(
      <>
        {note.draw(
          t.service,
          () => (
            <p data-note="built-in" />
          ),
          { words: 'abc' },
        )}
      </>,
    )
    expect(shown()).toBe('built-in')
    const brand = await t.module('brand')
    let take: (() => unknown) | undefined
    await act(async () => {
      take = brand.shell.putRender<{ words: string }>(
        'notes.message',
        ({ props, part }) => <p data-note={`mine:${props.words}`} {...part} />,
        tenantScope(ALICE),
      )
      await settle()
    })
    expect(shown()).toBe('mine:abc')
    expect(document.querySelector('[data-note]')?.getAttribute('data-omne-part')).toBe(
      'notes.message',
    )
    await act(async () => {
      t.state.scope.set(BOB)
      await settle()
    })
    expect(shown()).toBe('built-in')
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      t.state.scope.set(ALICE)
      await take?.()
      brand.shell.putRender('notes.message', () => <Broken />, tenantScope(ALICE))
      await settle()
    })
    expect(shown()).toBe('built-in')
    quiet.mockRestore()
  })

  it('a point that draws by key draws what is put on the key, framed by the host; one that throws while it is drawn falls back to the generic drawing', async () => {
    const calls = defineRenderPoint<{ name: string }>({
      name: 'notes.tool-call',
      key: 'the name of the tool',
      summary: 'How a call of one tool is drawn.',
    })
    const t = await setup({ login: 'signed-in' })
    const host = await t.module('notes-ui')
    calls.declare(host.shell)
    const call = (name: string) =>
      calls.draw(
        t.service,
        name,
        { name },
        () => <p data-note={`generic:${name}`} />,
        drawn => <div data-frame={name}>{drawn}</div>,
      )
    render(
      <>
        {call('files.write')}
        {call('files.read')}
      </>,
    )
    const notes = () =>
      Array.from(document.querySelectorAll('[data-note]'), note => [
        note.getAttribute('data-note'),
        note.parentElement?.getAttribute('data-frame') ?? null,
      ])
    expect(notes()).toEqual([
      ['generic:files.write', null],
      ['generic:files.read', null],
    ])
    const files = await t.module('files-ui')
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let take: (() => unknown) | undefined
    await act(async () => {
      take = calls.put(files.shell, 'files.write', () => <Broken />)
      calls.put(files.shell, 'files.read', ({ subject }) => (
        <p data-note={`mine:${subject.name}`} />
      ))
      await settle()
    })
    expect(notes()).toEqual([
      ['generic:files.write', null],
      ['mine:files.read', 'files.read'],
    ])
    await act(async () => {
      await take?.()
      calls.put(files.shell, 'files.write', () => <p data-note="mended" />)
      await settle()
    })
    expect(notes()).toEqual([
      ['mended', 'files.write'],
      ['mine:files.read', 'files.read'],
    ])
    quiet.mockRestore()
  })

  it('wearing a look does not draw a page anew: the page on show stays the same element and stays the one chosen, though the order of the pages changes', async () => {
    const t = await setup({ login: 'signed-in', knowsToken: known })
    await t.provide(CHAT)
    await t.provide(SETTINGS)
    await act(async () => {
      t.state.scope.set(ALICE)
      await settle()
    })
    const shown = () => document.querySelector('.shell-page[data-page="chat"]')
    const before = shown()
    const chosen = current()
    expect(before).not.toBeNull()
    const sea = await t.module('sea')
    await act(async () => {
      sea.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, lookScope(ALICE, 'sea'))
      sea.shell.putLayout('shell.pages', ['settings', 'chat'], lookScope(ALICE, 'sea'))
      await settle()
    })
    expect(t.service.items('pages').map(page => page.id)).toEqual(['chat', 'settings'])
    await act(async () => {
      t.service.wear('sea')
      await settle()
    })
    expect(t.service.items('pages').map(page => page.id)).toEqual(['settings', 'chat'])
    expect(t.state.sheet.get()).toBe(GREEN)
    expect(shown()).toBe(before)
    expect(current()).toEqual(chosen)
  })

  it('the pages follow the layout of the tenant on show', async () => {
    const t = await setup({ login: 'signed-in' })
    await t.provide(CHAT)
    await t.provide(SETTINGS)
    const ids = () => t.service.items('pages').map(page => page.id)
    const drawn = () =>
      Array.from(document.querySelectorAll('.shell-page'), page => page.getAttribute('data-page'))
    expect(ids()).toEqual(['chat', 'settings'])
    const brand = await t.module('brand')
    await act(async () => {
      brand.shell.putLayout('shell.pages', ['settings', 'chat'], tenantScope(ALICE))
      await settle()
    })
    expect(ids()).toEqual(['chat', 'settings'])
    await act(async () => {
      t.state.scope.set(ALICE)
      await settle()
    })
    expect(ids()).toEqual(['settings', 'chat'])
    expect(drawn()).toEqual(['settings', 'chat'])
  })
})
