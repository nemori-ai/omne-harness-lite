// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { createCanvasUiModule } from '@omne-harness/canvas-ui/cordis'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { parseInstant } from '@omne-harness/utc-instant'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fakeGate } from './support/fake-modules.tsx'
import { chatPage, settle, setup } from './support/shell-setup.tsx'

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
afterEach(cleanup)

/** The canvas protocol answering a sheet with one note on it; each command is kept and never answered. */
function canvasClient(asked: string[]) {
  const known = {
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
  }
  return new Proxy(known, {
    get: (target, name: string) =>
      name in target
        ? target[name as keyof typeof target]
        : () => {
            asked.push(name)
            return new Promise(() => {})
          },
  })
}

/** A page-layer action on each bare key the paper uses, to see whether the dispatcher runs it too. */
function onBareKeys(ran: string[]) {
  return defineUiModule({
    name: 'bare-keys',
    needs: {},
    apply(shell) {
      for (const chord of ['G', 'L', '/'])
        shell.contribute('actions', {
          id: `test.${chord}`,
          title: chord,
          group: '测试',
          kind: 'ui',
          order: 0,
          keys: [{ chord, layer: 'page' }],
          available: () => true,
          run: () => void ran.push(chord),
        })
    },
  })
}

async function onTheBack(ran: string[], asked: string[]) {
  const t = await setup({ login: 'signed-in', modules: [fakeGate(), chatPage, onBareKeys(ran)] })
  await act(async () => {
    await serveProtocol(t.root, canvasProtocol, canvasClient(asked) as never)
    await t.root.plugin(
      createCanvasUiModule({ preferences: { read: () => null, write: () => {} } }),
    )
    t.state.scope.set(TENANT)
    await settle()
  })
  act(() => void fireEvent.keyDown(window, TURN))
  await act(settle)
  const item = document.querySelector<HTMLElement>('[data-item="a"]')
  if (item === null) throw new Error('the note is not on the paper')
  act(() => item.focus())
  return item
}

const pressOn = (target: HTMLElement, init: KeyboardEventInit): boolean => {
  let taken = false
  act(() => {
    taken = !fireEvent.keyDown(target, init)
  })
  return taken
}

describe('the paper keys under the shell dispatcher', () => {
  it('L and G on a thing are the paper’s: it takes them first, and the dispatcher runs nothing more', async () => {
    const ran: string[] = []
    const asked: string[] = []
    const item = await onTheBack(ran, asked)
    expect(pressOn(item, { key: 'l', code: 'KeyL' })).toBe(true)
    expect(asked).toEqual(['lock'])
    expect(pressOn(item, { key: 'g', code: 'KeyG' })).toBe(true)
    expect(ran).toEqual([])
  })

  it('? on a thing opens the keys of this moment; / is not the paper’s and goes to the dispatcher', async () => {
    const ran: string[] = []
    const item = await onTheBack(ran, [])
    expect(pressOn(item, { key: '/', code: 'Slash' })).toBe(true)
    expect(ran).toEqual(['/'])
    pressOn(item, { key: '?', code: 'Slash', shiftKey: true })
    expect(screen.getByRole('listbox', { name: '此刻能按的键' })).toBeTruthy()
  })
})
