// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import {
  TOKENS_POINT,
  definePart,
  defineRenderPoint,
  lookScope,
  tenantScope,
} from '@omne-harness/shell-contract'
import { inkLookChanged } from '@omne-harness/ui-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adoptChanges, tokenOf, tokensOf } from '../src/page/shell/changes-sheet.ts'
import { giveBack, heldFocus } from '../src/page/shell/kept-focus.ts'
import { CHAT, SETTINGS, current, settle, setup } from './support/shell-setup.tsx'

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const EMPTY = '@layer omne-changes{}'
const GREEN = '@layer omne-changes{:root{--omne-accent:#0a7;}}'
const known = (name: string): boolean => name === '--omne-accent'

vi.mock('@omne-harness/ui-kit', async original => {
  const kit = await original<typeof import('@omne-harness/ui-kit')>()
  return { ...kit, inkLookChanged: vi.fn(kit.inkLookChanged) }
})

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
      'shell.piece',
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

  it('tells the ink the look changed each time it writes the sheet, the first time too, and not once stopped', () => {
    let text = EMPTY
    let listener: ((css: string) => void) | undefined
    const sheet = {
      get: () => text,
      set(css: string) {
        text = css
        listener?.(css)
      },
      subscribe(next: (css: string) => void) {
        listener = next
        return () => void (listener = undefined)
      },
    }
    const told = vi.mocked(inkLookChanged)
    told.mockClear()
    const stop = adoptChanges(document, sheet)
    expect(told).toHaveBeenCalledTimes(1)
    sheet.set(GREEN)
    expect(told).toHaveBeenCalledTimes(2)
    stop()
    sheet.set(EMPTY)
    expect(told).toHaveBeenCalledTimes(2)
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

describe('the focus where a drawing is changed', () => {
  const editor = definePart({
    name: 'notes.editor',
    label: '编辑框',
    summary: '写字的地方',
    depths: ['render'],
  })
  const field = () => document.querySelector<HTMLTextAreaElement>('[data-omne-part="notes.field"]')

  async function drawn() {
    const t = await setup({ login: 'signed-in' })
    const host = await t.module('notes-ui')
    editor.declare(host.shell)
    await act(async () => {
      t.state.scope.set(ALICE)
      await settle()
    })
    render(
      <>
        <input aria-label="elsewhere" />
        {editor.draw(
          t.service,
          () => (
            <div {...editor.props}>
              <textarea data-omne-part="notes.field" defaultValue="hello world" />
            </div>
          ),
          undefined,
        )}
      </>,
    )
    const brand = await t.module('brand')
    const put = async (render: Parameters<typeof brand.shell.putRender>[1]) => {
      let take: (() => unknown) | undefined
      await act(async () => {
        take = brand.shell.putRender('notes.editor', render, tenantScope(ALICE))
        await settle()
      })
      return async () => {
        await act(async () => {
          await take?.()
          await settle()
        })
      }
    }
    return { put }
  }

  it('goes back to the field of the same part, with the same selection, each time the drawing is put, changed, or taken back', async () => {
    const { put } = await drawn()
    const before = field()!
    before.focus()
    before.setSelectionRange(2, 5)
    const takeFirst = await put(({ part, builtIn }) => <section {...part}>{builtIn()}</section>)
    expect(field()).not.toBe(before)
    expect(document.activeElement).toBe(field())
    expect([field()!.selectionStart, field()!.selectionEnd]).toEqual([2, 5])
    field()!.setSelectionRange(6, 11)
    await takeFirst()
    await put(({ part, builtIn }) => (
      <article {...part}>
        <header>mine</header>
        <div>{builtIn()}</div>
      </article>
    ))
    expect(document.activeElement).toBe(field())
    expect([field()!.selectionStart, field()!.selectionEnd]).toEqual([6, 11])
  })

  it('stays where it is when it was not in the part that is drawn anew', async () => {
    const { put } = await drawn()
    const elsewhere = document.querySelector<HTMLInputElement>('[aria-label="elsewhere"]')!
    elsewhere.focus()
    await put(({ part, builtIn }) => <section {...part}>{builtIn()}</section>)
    expect(document.activeElement).toBe(elsewhere)
  })
})

describe('where the focus is held, and where it is given back', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })
  const page = (html: string) => {
    document.body.innerHTML = html
  }
  const the = <E extends Element>(selector: string) => document.querySelector<E>(selector)!
  /** The change: what is in the part is drawn anew, so the focus falls back to the page. */
  const redraw = (part: string, html: string) => {
    const host = [...document.querySelectorAll('[data-omne-part]')].find(
      each => each.getAttribute('data-omne-part') === part,
    )!
    const anew = document.createElement('div')
    anew.innerHTML = html
    host.replaceWith(anew.firstElementChild!)
  }

  it('is held by nothing on the page itself, nor outside every part', () => {
    page('<input aria-label="loose" /><div data-omne-part="a.b"><input /></div>')
    expect(heldFocus(document)).toBeNull()
    the<HTMLInputElement>('[aria-label="loose"]').focus()
    expect(heldFocus(document)).toBeNull()
  })

  it('is held by the part it is in, its place among what takes focus there, its kind, and the selection a field has', () => {
    page(
      '<div data-omne-part="a.b"><button>x</button><input value="hello" /><input type="checkbox" /></div><button data-omne-part="a.c">y</button>',
    )
    const field = the<HTMLInputElement>('[data-omne-part="a.b"] input')
    field.focus()
    field.setSelectionRange(1, 3, 'backward')
    expect(heldFocus(document)).toEqual({
      part: 'a.b',
      index: 1,
      tag: 'INPUT',
      selection: { start: 1, end: 3, direction: 'backward' },
    })
    the<HTMLInputElement>('[type="checkbox"]').focus()
    expect(heldFocus(document)).toMatchObject({ index: 2, selection: null })
    the<HTMLButtonElement>('[data-omne-part="a.c"]').focus()
    expect(heldFocus(document)).toEqual({ part: 'a.c', index: -1, tag: 'BUTTON', selection: null })
  })

  it('goes back to the element in the same place, of the same kind, with the selection cut to the new text, without scrolling', () => {
    page('<div data-omne-part="a.b"><button>x</button><textarea>hello world</textarea></div>')
    const old = the<HTMLTextAreaElement>('textarea')
    old.focus()
    old.setSelectionRange(3, 11)
    const held = heldFocus(document)!
    redraw(
      'a.b',
      '<section data-omne-part="a.b"><button>x</button><textarea>hello</textarea></section>',
    )
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    giveBack(document, held)
    const now = the<HTMLTextAreaElement>('textarea')
    expect(document.activeElement).toBe(now)
    expect([now.selectionStart, now.selectionEnd]).toEqual([3, 5])
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('goes back to the element that carries the part, and to the first of those inside, each to its own', () => {
    page(
      '<div data-omne-part="a.b"><button data-omne-part="a.b.c">in</button><button>next</button></div>',
    )
    the<HTMLButtonElement>('[data-omne-part="a.b.c"]').focus()
    const self = heldFocus(document)!
    redraw('a.b.c', '<button data-omne-part="a.b.c">in</button>')
    giveBack(document, self)
    expect(document.activeElement).toBe(the('[data-omne-part="a.b.c"]'))
    page('<div data-omne-part="a.b" tabindex="-1"><button>first</button></div>')
    the<HTMLButtonElement>('button').focus()
    const first = heldFocus(document)!
    expect(first.index).toBe(0)
    redraw('a.b', '<div data-omne-part="a.b" tabindex="-1"><button>first</button></div>')
    giveBack(document, first)
    expect(document.activeElement).toBe(the('button'))
  })

  it('goes back to a field without a selection without asking one of it', () => {
    page('<div data-omne-part="a.b"><input type="checkbox" /></div>')
    the<HTMLInputElement>('input').focus()
    const held = heldFocus(document)!
    redraw('a.b', '<div data-omne-part="a.b"><input type="checkbox" /></div>')
    const select = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange')
    giveBack(document, held)
    expect(document.activeElement).toBe(the('input'))
    expect(select).not.toHaveBeenCalled()
  })

  it('keeps the selection to fields that have one on both sides, when the kind of field changed with the drawing', () => {
    page('<div data-omne-part="a.b"><input type="checkbox" /></div>')
    the<HTMLInputElement>('input').focus()
    const box = heldFocus(document)!
    redraw('a.b', '<div data-omne-part="a.b"><input value="text" /></div>')
    expect(() => giveBack(document, box)).not.toThrow()
    expect(document.activeElement).toBe(the('input'))
    the<HTMLInputElement>('input').setSelectionRange(1, 3)
    const text = heldFocus(document)!
    redraw('a.b', '<div data-omne-part="a.b"><input type="checkbox" /></div>')
    const select = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange')
    giveBack(document, text)
    expect(document.activeElement).toBe(the('input'))
    expect(select).not.toHaveBeenCalled()
  })

  it('is held by nothing where the page has no element with the focus', () => {
    page('<div data-omne-part="a.b"><textarea>hi</textarea></div>')
    the<HTMLTextAreaElement>('textarea').focus()
    const none = new Proxy(document, {
      get: (target, key) =>
        key === 'activeElement' ? null : (Reflect.get(target, key, target) as unknown),
    })
    expect(heldFocus(none)).toBeNull()
  })

  it('goes back where the page has no element with the focus at all', () => {
    page('<div data-omne-part="a.b"><textarea>hi</textarea></div>')
    the<HTMLTextAreaElement>('textarea').focus()
    const held = heldFocus(document)!
    redraw('a.b', '<div data-omne-part="a.b"><textarea>hi</textarea></div>')
    const none = new Proxy(document, {
      get: (target, key) =>
        key === 'activeElement' ? null : (Reflect.get(target, key, target) as unknown),
    })
    giveBack(none, held)
    expect(document.activeElement).toBe(the('textarea'))
  })

  it('stays on an element that has the focus, and gives none where the part, the place, or the kind is gone', () => {
    page('<div data-omne-part="a.b"><textarea>hi</textarea></div><input aria-label="other" />')
    the<HTMLTextAreaElement>('textarea').focus()
    const held = heldFocus(document)!
    redraw('a.b', '<div data-omne-part="a.b"><textarea>hi</textarea></div>')
    const other = the<HTMLInputElement>('[aria-label="other"]')
    other.focus()
    giveBack(document, held)
    expect(document.activeElement).toBe(other)
    other.blur()
    for (const html of [
      '<div data-omne-part="a.x"><textarea></textarea></div>',
      '<div data-omne-part="a.b"></div>',
      '<div data-omne-part="a.b"><input /></div>',
      '<p data-omne-part="x&quot;]"><textarea></textarea></p>',
    ]) {
      page(html)
      expect(() => giveBack(document, held)).not.toThrow()
      expect(document.activeElement).toBe(document.body)
    }
  })
})
