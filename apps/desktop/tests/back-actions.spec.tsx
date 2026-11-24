// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { serverPointsContract } from '@omne-harness/client-assembly'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { keymapOf, type KeymapRow } from '@omne-harness/shell-contract'
import { servePoint, serveProtocol } from '@omne-harness/shell-contract/testing'
import { blockingOverlay } from '@omne-harness/ui-kit'
import { parseInstant } from '@omne-harness/utc-instant'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assembly } from '../src/page/assembly.tsx'
import {
  faceActions,
  frameActions,
  regionActions,
  sizeActions,
} from '../src/page/shell/layout-actions.ts'
import { paletteActions, paletteSwitch } from '../src/page/shell/palette.tsx'
import { DesktopShell } from '../src/page/shell/service.ts'
import { fakeGate } from './support/fake-modules.tsx'
import { settle, setup } from './support/shell-setup.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const parsed = parseInstant('2026-11-24T10:00:00Z')
if (!parsed.ok) throw new Error('the instant of the case does not parse')
const WHEN = parsed.value
const MAC = /Mac/.test(navigator.platform)
const TURN = {
  key: 'o',
  code: 'KeyO',
  shiftKey: true,
  ...(MAC ? { metaKey: true } : { ctrlKey: true }),
}

beforeAll(() => {
  const still = () => ({ cancel: () => undefined, finished: Promise.resolve() })
  Object.assign(Element.prototype, { animate: still, scrollIntoView: () => undefined })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Turns at once, as under reduced motion: the sweep turns back between keys, and a turn while one plays only stops it. */
function reducedMotion(): void {
  const real = window.matchMedia.bind(window)
  vi.stubGlobal('matchMedia', (query: string) =>
    query === '(prefers-reduced-motion: reduce)'
      ? { matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }
      : real(query),
  )
}

const never = () => new Promise(() => {})

/** A client that answers what it knows and keeps every other call waiting; `asked` gets the name of each call. */
function answering(known: Record<string, unknown>, asked: string[] = []) {
  return new Proxy(known, {
    get: (target, name: string) =>
      name in target
        ? target[name]
        : () => {
            asked.push(name)
            return never()
          },
  })
}

/** An observation that gives these frames and then stays open until it is let go. */
function waitingStream(first: unknown[]) {
  return (_open: unknown, options: { signal: AbortSignal }) =>
    (async function* () {
      for (const frame of first) yield frame
      await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve()))
      return { kind: 'aborted' }
    })()
}

type Plain = null | string | number | boolean | readonly Plain[] | { readonly [key: string]: Plain }

/** A value as the session protocol carries it in an entry. */
function tree(value: Plain): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean' || typeof value === 'string') return { kind: typeof value, value }
  if (typeof value === 'number') return { kind: 'number', lexeme: JSON.stringify(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value).map(([key, item]) => ({ key, value: tree(item) })),
  }
}

const SEEN = { toHuman: true, toModel: true }

/** One answer of the agent that made a tool call: its line in the transcript opens and shuts. */
const CALLED = {
  entryId: '1',
  revision: '1',
  kind: 'message.assistant',
  payload: tree({
    kind: 'message.assistant',
    message: {
      id: 'msg_1',
      role: 'assistant',
      blocks: [
        { kind: 'text', id: 'b', visibility: SEEN, text: '看一眼' },
        {
          kind: 'tool_call',
          id: 't_1',
          visibility: SEEN,
          callId: 'call_1',
          name: 'read',
          arguments: tree({ path: 'a' }) as Plain,
        },
      ],
    },
  }),
}

const sessionClient = (asked: string[]) =>
  answering(
    {
      'list-sessions': async () => ({
        outcome: 'succeeded',
        body: {
          sessions: [
            {
              session: 'ses_a',
              createdAt: null,
              lastActivityAt: null,
              lifecycle: 'dormant',
              title: '甲',
              relation: 'main',
              parent: null,
              origin: null,
              root: 'ses_a',
              depth: 0,
              attendance: 'attended',
              definition: 'coding',
            },
          ],
          next: null,
          completeness: 'complete',
        },
      }),
      'read-history': async () => ({
        outcome: 'succeeded',
        body: { entries: [CALLED], next: null, exhausted: true, scannedThrough: '900', upper: '1' },
      }),
      'read-permission-mode': async () => ({
        outcome: 'succeeded',
        body: { mode: 'never', revision: '1' },
      }),
      observe: {
        'observe-session': waitingStream([
          { kind: 'state', run: null, revision: '1', phase: null, target: null },
        ]),
      },
    },
    asked,
  )

const canvasClient = () =>
  answering({
    look: async () => ({
      outcome: 'succeeded',
      body: {
        sheet: {
          width: 1600,
          height: 900,
          grid: 8,
          size: { min: { width: 120, height: 64 }, max: { width: 900, height: 900 } },
          footprint: { width: 160, height: 80 },
        },
        items: [
          {
            id: 'a',
            reference: { kind: 'test.note', ref: 'n1' },
            state: 'on',
            at: { x: 80, y: 80 },
            size: { width: 200, height: 120 },
            rank: 1,
            pile: null,
            locked: false,
            by: { kind: 'human' },
            when: WHEN,
          },
        ],
        piles: [],
        revision: 1,
      },
    }),
    kinds: async () => ({ outcome: 'succeeded', body: { kinds: [] } }),
    observe: { 'observe-changes': () => (async function* () {})() },
  })

const silent = () => answering({ observe: {} })

/** The whole desktop application signed in, a session open on the conversation page, and the back on show with the focus on a thing on the paper. */
async function onTheBack() {
  const navigated = vi.spyOn(DesktopShell.prototype, 'navigate')
  const asked: string[] = []
  const t = await setup({ login: 'signed-in', modules: [fakeGate()] })
  await act(async () => {
    await servePoint(t.root, serverPointsContract, {
      keys: () => undefined,
      subscribe: () => () => undefined,
    })
    for (const protocol of assembly.protocols) {
      const client =
        protocol.name === sessionProtocol.name
          ? sessionClient(asked)
          : protocol.name === canvasProtocol.name
            ? canvasClient()
            : silent()
      await serveProtocol(t.root, protocol, client as never)
    }
    for (const module of assembly.modules) await t.root.plugin(module)
    t.state.scope.set(TENANT)
    await settle()
  })
  await openFirst()
  const box = composer()!
  act(() => void fireEvent.change(box, { target: { value: '还没发的草稿' } }))
  press(TURN)
  if (onShow() !== 'back') throw new Error('the back is not on show')
  toPaper()
  return { t, navigated, asked }
}

const face = (name: 'front' | 'back') =>
  document.querySelector<HTMLElement>(`[data-face="${name}"]`)
const onShow = () => (face('front')?.hasAttribute('inert') === true ? 'back' : 'front')
const composer = () =>
  document.querySelector<HTMLTextAreaElement>('textarea[aria-label="输入消息"]')
const thing = () => document.querySelector<HTMLElement>('[data-item="a"]')

function toPaper(): HTMLElement {
  const item = thing()
  if (item === null) throw new Error('the thing is not on the paper')
  act(() => item.focus())
  return item
}

/** A key pressed where the focus is, as the person presses it; tells whether something took it. */
function press(init: KeyboardEventInit, at: Element = document.activeElement ?? document.body) {
  let taken = false
  act(() => {
    taken = !fireEvent.keyDown(at, { bubbles: true, cancelable: true, ...init })
  })
  return taken
}

/** A printable key typed where the focus is: a field it lands in gets the letter. */
function type(letter: string): void {
  const at = document.activeElement
  if (press({ key: letter, code: `Key${letter.toUpperCase()}` }, at ?? document.body)) return
  if (at instanceof HTMLTextAreaElement)
    act(() => void fireEvent.change(at, { target: { value: `${at.value}${letter}` } }))
}

const SIGN: Readonly<Record<string, string>> = {
  '/': 'Slash',
  '.': 'Period',
  ',': 'Comma',
  '?': 'Slash',
  '=': 'Equal',
  '-': 'Minus',
}

/** The key press a chord of this platform stands for; with ⌥ held a printable key types something else. */
function pressOf(chord: string): KeyboardEventInit {
  const parts = chord.split('+')
  const key = parts.pop() ?? ''
  const alt = parts.includes('Alt')
  const code = /^[A-Z]$/u.test(key)
    ? `Key${key}`
    : /^\d$/u.test(key)
      ? `Digit${key}`
      : (SIGN[key] ?? key)
  return {
    key: key === 'Plus' ? '+' : key.length > 1 ? key : alt ? '≠' : key.toLowerCase(),
    code,
    metaKey: parts.includes('Meta') || (MAC && parts.includes('Mod')),
    ctrlKey: parts.includes('Ctrl') || (!MAC && parts.includes('Mod')),
    altKey: alt,
    shiftKey: parts.includes('Shift'),
  }
}

/** Every key of the action table the application puts together, in this platform's chords. */
function keys(t: Awaited<ReturnType<typeof onTheBack>>['t']): readonly KeymapRow[] {
  const actions = [
    ...regionActions(),
    ...sizeActions(t.size),
    ...frameActions(),
    ...faceActions(t.state.face, true),
    ...paletteActions(paletteSwitch()),
    ...t.state.slots.items('actions'),
  ]
  return keymapOf(actions, {}, MAC)
}

const WATCHED = ['aria-expanded', 'aria-pressed', 'data-state', 'data-width', 'data-open', 'hidden']

/** What a person could see change on the folded front: the open state of every control, and what the composer holds. */
function frontNow(): string {
  const front = face('front')
  if (front === null) return ''
  const states = [...front.querySelectorAll('*')].flatMap((element, at) =>
    WATCHED.filter(name => element.hasAttribute(name)).map(
      name => `${at}:${name}=${element.getAttribute(name)}`,
    ),
  )
  return [...states, `composer=${composer()?.value ?? ''}`].join('\n')
}

const toolLine = () =>
  document.querySelector('[data-omne-part="session.transcript.tool-call"] [aria-expanded]')

/** The session 甲 open on the conversation page, with its tool call line drawn. */
async function openFirst(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await act(settle)
  if (composer() === null) throw new Error('the session is not open on the conversation page')
  if (toolLine() === null) throw new Error('the tool call has no line that opens')
}

/** Back to how the case began: what is open closed, 甲 open on the front, the back on show, the focus on the thing. */
async function again(): Promise<void> {
  for (let round = 0; round < 3 && blockingOverlay() !== undefined; round += 1)
    press({ key: 'Escape' })
  if (toolLine() === null) {
    if (onShow() === 'back') press(TURN)
    await openFirst()
  }
  if (onShow() === 'front') press(TURN)
  toPaper()
}

describe('on the back the keys do not act on the folded front (FE-I57)', () => {
  it('every key of the application, pressed on the back, leaves the folded front alone, or turns to it on purpose', async () => {
    reducedMotion()
    const { t, navigated, asked } = await onTheBack()
    // A new session stays being made here, as the client never answers, so the key that starts one goes last.
    const all = keys(t).filter(row => row.layer !== 'overlay')
    const rows = [
      ...all.filter(row => row.action !== 'session.new'),
      ...all.filter(row => row.action === 'session.new'),
    ]
    expect(rows.map(row => row.action)).toEqual(
      expect.arrayContaining([
        'session.pick-permission',
        'session.side-panel',
        'session.details',
        'shell.sidebar',
      ]),
    )
    const wrong: string[] = []
    for (const row of rows) {
      await again()
      const field = row.layer === 'composer' ? document.createElement('textarea') : null
      if (field !== null) {
        face('back')?.append(field)
        act(() => field.focus())
      }
      const before = frontNow()
      const held = document.activeElement
      const went = navigated.mock.calls.length
      press(pressOf(row.chord))
      await act(settle)
      field?.remove()
      const where = `${row.action} (${row.chord})`
      const focus = document.activeElement
      if (focus !== held && focus?.closest('[inert]') != null)
        wrong.push(`${where}: put the focus in the folded face`)
      if (onShow() === 'front') {
        if (row.action !== 'shell.turn-face' && navigated.mock.calls.length === went)
          wrong.push(`${where}: turned to the front without going to a page`)
      } else if (frontNow() !== before) wrong.push(`${where}: changed the folded front`)
    }
    expect(wrong).toEqual([])
    expect(asked.filter(name => name === 'send-input' || name === 'interrupt-input')).toEqual([])
  })

  it('/ on the back turns to the conversation page with the focus in the composer, so what is typed next goes there (S1)', async () => {
    await onTheBack()
    expect(press({ key: '/', code: 'Slash' })).toBe(true)
    await waitFor(() => expect(document.querySelector('[data-control="flip"]')).toBeNull(), {
      timeout: 3000,
    })
    expect(onShow()).toBe('front')
    expect(document.activeElement).toBe(composer())
    type('a')
    expect(composer()?.value).toBe('还没发的草稿/a')
  })

  it('what opens on the back by right shuts with Escape and gives the focus back to the paper', async () => {
    reducedMotion()
    await onTheBack()
    const item = thing()
    for (const opening of [{ key: '?', code: 'Slash', shiftKey: true }, { ...pressOf('Mod+K') }]) {
      press(opening)
      expect(blockingOverlay()).toBeDefined()
      press({ key: 'Escape' })
      await act(settle)
      expect(blockingOverlay()).toBeUndefined()
      expect(document.activeElement).toBe(item)
      expect(onShow()).toBe('back')
    }
  })
})
