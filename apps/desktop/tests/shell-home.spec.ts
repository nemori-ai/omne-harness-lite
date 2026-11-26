import type { FigureView, MergedFigure, PageItem } from '@omne-harness/shell-contract'
import { describe, expect, it } from 'vitest'
import { goHome, homeOf, mergedOf } from '../src/page/shell/home.ts'
import type { ShellState } from '../src/page/shell/state.ts'

const pages = (...ids: string[]) => ids.map(id => ({ id }) as PageItem)
const idle = (over: Partial<MergedFigure> = {}): MergedFigure => ({
  doing: 'idle',
  waiting: 0,
  ...over,
})

/** The parts of the shell's state the home reads, each a plain value the case sets. */
function shell(
  over: Readonly<{
    pages?: readonly PageItem[]
    shown?: string
    face?: 'front' | 'back'
    owners?: Readonly<Record<string, readonly object[]>>
    merged?: MergedFigure
  }> = {},
) {
  const views: FigureView[] = []
  const chosen: string[] = []
  let face = over.face ?? 'front'
  let turns = 0
  const state = {
    slots: { items: () => over.pages ?? pages('a', 'b') },
    pageOwners: new Map(Object.entries(over.owners ?? {})),
    figure: {
      merged: (view: FigureView) => {
        views.push(view)
        return over.merged ?? idle()
      },
    },
    page: { get: () => over.shown, choose: (page: string) => chosen.push(page) },
    face: {
      get: () => face,
      turn: () => {
        turns += 1
        face = face === 'front' ? 'back' : 'front'
      },
    },
  } as unknown as ShellState
  return { state, views, chosen, face: () => face, turns: () => turns }
}

describe('the module in front of the figure', () => {
  it('is the one that put the page on show, and none when two put it, nobody did, or none is on show', () => {
    const one = {}
    const other = {}
    const world = shell({ owners: { a: [one], b: [one, other] } })
    mergedOf(world.state, pages('a', 'b'), 'a')
    mergedOf(world.state, pages('a', 'b'), 'b')
    mergedOf(world.state, pages('a', 'b'), 'c')
    mergedOf(world.state, pages('a', 'b'), undefined)
    expect(world.views.map(view => view.foreground)).toEqual([one, undefined, undefined, undefined])
    expect(world.views[0]?.pages).toEqual(['a', 'b'])
  })
})

describe('the page the home goes to', () => {
  it('is the page waiting for an answer, and the earliest when the waiting names none', () => {
    expect(homeOf(idle({ waiting: 1, waitingPage: 'b' }), pages('a', 'b'))).toBe('b')
    expect(homeOf(idle({ waiting: 2 }), pages('a', 'b'))).toBe('a')
    expect(homeOf(idle(), pages())).toBeUndefined()
  })
})

describe('a press on the home', () => {
  it('on the front goes to the page without turning', () => {
    const world = shell({ merged: idle({ waiting: 1, waitingPage: 'b' }) })
    goHome(world.state)
    expect(world.chosen).toEqual(['b'])
    expect(world.turns()).toBe(0)
  })

  it('on the back turns to the front once, then goes to the page', () => {
    const world = shell({ face: 'back' })
    goHome(world.state)
    expect(world.face()).toBe('front')
    expect(world.turns()).toBe(1)
    expect(world.chosen).toEqual(['a'])
  })

  it('with no page to go to does nothing, not even turn', () => {
    const world = shell({ face: 'back', pages: [] })
    goHome(world.state)
    expect(world.chosen).toEqual([])
    expect(world.turns()).toBe(0)
  })
})
