import { describe, expect, it } from 'vitest'
import { createFigureStore, type FigureView } from '@omne-harness/shell-contract'

const nowhere: FigureView = { foreground: undefined, pages: [] }

describe('createFigureStore', () => {
  it('holds no report at first: idle, nothing waiting', () => {
    expect(createFigureStore().merged(nowhere)).toEqual({ doing: 'idle', waiting: 0 })
  })

  it('replaces the whole report a module gave before', () => {
    const store = createFigureStore()
    const module = {}
    store.report(module, {
      doing: 'thinking',
      moment: { kind: 'received', serial: 1 },
      subject: '第一份',
      waiting: 2,
      waitingPage: 'decisions',
    })
    store.report(module, { doing: 'writing' })
    expect(store.merged({ foreground: module, pages: ['decisions'] })).toEqual({
      doing: 'writing',
      waiting: 0,
    })
  })

  it('withdraws one module report and leaves the others', () => {
    const store = createFigureStore()
    const mine = {}
    const theirs = {}
    store.report(mine, { doing: 'thinking', waiting: 2 })
    store.report(theirs, { doing: 'idle', waiting: 1 })
    store.withdraw(mine)
    expect(store.merged({ foreground: mine, pages: [] })).toEqual({ doing: 'idle', waiting: 1 })
    store.withdraw(mine)
    store.withdraw({})
    expect(store.merged({ foreground: mine, pages: [] })).toEqual({ doing: 'idle', waiting: 1 })
  })

  it('gives the foreground report as it is, with its moment and subject', () => {
    const store = createFigureStore()
    const front = {}
    store.report(front, {
      doing: 'looking',
      moment: { kind: 'received', serial: 3 },
      subject: '会话「周报」',
    })
    expect(store.merged({ foreground: front, pages: [] })).toEqual({
      doing: 'looking',
      moment: { kind: 'received', serial: 3 },
      subject: '会话「周报」',
      waiting: 0,
    })
  })

  it('counts the activity of a module not in front only as background, without its moment or subject', () => {
    const store = createFigureStore()
    const front = {}
    const behind = {}
    store.report(front, { doing: 'idle' })
    store.report(behind, {
      doing: 'writing',
      moment: { kind: 'landed', serial: 9 },
      subject: '后台的会话',
    })
    expect(store.merged({ foreground: front, pages: [] })).toEqual({
      doing: 'background',
      waiting: 0,
    })
    expect(store.merged(nowhere)).toEqual({ doing: 'background', waiting: 0 })
  })

  it('puts the foreground activity before the background', () => {
    const store = createFigureStore()
    const front = {}
    store.report(front, { doing: 'thinking' })
    store.report({}, { doing: 'writing' })
    expect(store.merged({ foreground: front, pages: [] }).doing).toBe('thinking')
  })

  it('takes a foreground that reports background as background', () => {
    const store = createFigureStore()
    const front = {}
    store.report(front, { doing: 'background' })
    expect(store.merged({ foreground: front, pages: [] }).doing).toBe('background')
  })

  it('does not count idle as background', () => {
    const store = createFigureStore()
    const front = {}
    store.report(front, { doing: 'idle' })
    store.report({}, { doing: 'idle' })
    expect(store.merged({ foreground: front, pages: [] }).doing).toBe('idle')
    expect(store.merged(nowhere).doing).toBe('idle')
  })

  it('gives the foreground moment while the foreground is idle', () => {
    const store = createFigureStore()
    const front = {}
    store.report(front, { doing: 'idle', moment: { kind: 'could-not', serial: 4 } })
    expect(store.merged({ foreground: front, pages: [] })).toEqual({
      doing: 'idle',
      moment: { kind: 'could-not', serial: 4 },
      waiting: 0,
    })
  })

  it('adds up the awaiting-answer counts of every module, in front or not', () => {
    const store = createFigureStore()
    const front = {}
    store.report(front, { doing: 'idle', waiting: 2 })
    store.report({}, { doing: 'idle', waiting: 3 })
    store.report({}, { doing: 'thinking' })
    expect(store.merged({ foreground: front, pages: [] }).waiting).toBe(5)
  })

  it('goes to the earliest page in slot order among those named by modules with something waiting', () => {
    const store = createFigureStore()
    store.report({}, { doing: 'idle', waiting: 1, waitingPage: 'later' })
    store.report({}, { doing: 'idle', waiting: 2, waitingPage: 'earlier' })
    store.report({}, { doing: 'idle', waiting: 0, waitingPage: 'first' })
    store.report({}, { doing: 'idle', waiting: 4 })
    const view = (pages: string[]): FigureView => ({ foreground: undefined, pages })
    expect(store.merged(view(['first', 'earlier', 'later'])).waitingPage).toBe('earlier')
    expect(store.merged(view(['first', 'later', 'earlier'])).waitingPage).toBe('later')
  })

  it('names no page when nothing waits, or when the page named is not placed', () => {
    const store = createFigureStore()
    const module = {}
    store.report(module, { doing: 'idle', waiting: 0, waitingPage: 'decisions' })
    expect(store.merged({ foreground: undefined, pages: ['decisions'] })).toEqual({
      doing: 'idle',
      waiting: 0,
    })
    store.report(module, { doing: 'idle', waiting: 1, waitingPage: 'gone' })
    expect(store.merged({ foreground: undefined, pages: ['decisions'] })).toEqual({
      doing: 'idle',
      waiting: 1,
    })
  })

  it('tells its listeners of each report and each withdrawal that took one back', () => {
    const store = createFigureStore()
    const module = {}
    let told = 0
    const stop = store.subscribe(() => (told += 1))
    store.report(module, { doing: 'thinking' })
    store.report(module, { doing: 'writing' })
    store.withdraw(module)
    store.withdraw(module)
    expect(told).toBe(3)
    stop()
    store.report(module, { doing: 'idle' })
    expect(told).toBe(3)
  })
})
