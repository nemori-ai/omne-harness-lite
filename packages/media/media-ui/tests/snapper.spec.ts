import { describe, expect, it, vi } from 'vitest'
import type { PickedFile } from '../src/model/attachment-tray.ts'
import { Snapper, shotName, type ScreenAnswer, type ScreenSource } from '../src/model/snapper.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const TAKEN = new Date(2026, 10, 24, 13, 5, 9).getTime()

function sourceOf(answers: Array<() => Promise<ScreenAnswer>>, openSettings?: () => void) {
  const capture = vi.fn(() => (answers.shift() ?? (() => Promise.reject(new Error('no answer'))))())
  const source: ScreenSource = {
    available: async () => true,
    capture,
    ...(openSettings === undefined ? {} : { openSettings }),
  }
  return { source, capture }
}

function snapperOf(source: ScreenSource) {
  const delivered: PickedFile[] = []
  const snapper = new Snapper({ source, deliver: file => delivered.push(file) })
  return { snapper, delivered }
}

describe('shotName', () => {
  it('names a screenshot by the local time it was taken', () => {
    expect(shotName(TAKEN)).toBe('屏幕截图 13.05.09.png')
  })
})

describe('Snapper', () => {
  it('starts idle; a press captures once and hands the picture to the tray as a PNG named by its time', async () => {
    const { source, capture } = sourceOf([async () => ({ kind: 'shot', png: PNG, takenAt: TAKEN })])
    const { snapper, delivered } = snapperOf(source)
    expect(snapper.read()).toEqual({ kind: 'idle' })
    const pressed = snapper.press()
    expect(snapper.read()).toEqual({ kind: 'capturing' })
    await pressed
    expect(capture).toHaveBeenCalledTimes(1)
    expect(snapper.read()).toEqual({ kind: 'idle' })
    expect(delivered).toHaveLength(1)
    const [file] = delivered
    expect([file?.name, file?.type, file?.size]).toEqual(['屏幕截图 13.05.09.png', 'image/png', 7])
    expect(await file?.read()).toEqual(PNG)
    expect(file?.blob?.type).toBe('image/png')
    expect(new Uint8Array((await file?.blob?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(PNG)
  })

  it('ignores a press while it captures', async () => {
    let finish: (answer: ScreenAnswer) => void = () => undefined
    const { source, capture } = sourceOf([() => new Promise(done => (finish = done))])
    const { snapper } = snapperOf(source)
    const first = snapper.press()
    await snapper.press()
    expect(capture).toHaveBeenCalledTimes(1)
    finish({ kind: 'failed', reason: '屏幕后端出错' })
    await first
  })

  it('asks for the permission when the system has not given it, and opens the settings when the source can', async () => {
    const opened = vi.fn()
    const { source } = sourceOf([async () => ({ kind: 'not-authorized' })], opened)
    const { snapper, delivered } = snapperOf(source)
    await snapper.press()
    expect(snapper.read()).toEqual({ kind: 'needs-permission', canOpenSettings: true })
    expect(delivered).toEqual([])
    snapper.openSettings()
    expect(opened).toHaveBeenCalledTimes(1)
    expect(snapper.read()).toEqual({ kind: 'needs-permission', canOpenSettings: true })
  })

  it('says it cannot open the settings when the source has no way to', async () => {
    const { source } = sourceOf([async () => ({ kind: 'not-authorized' })])
    const { snapper } = snapperOf(source)
    await snapper.press()
    expect(snapper.read()).toEqual({ kind: 'needs-permission', canOpenSettings: false })
    snapper.openSettings()
  })

  it('says why when the capture fails or the source cannot be reached, and a press tries again', async () => {
    const { source, capture } = sourceOf([
      async () => ({ kind: 'failed', reason: '屏幕后端出错' }),
      () => Promise.reject(new Error('fetch failed')),
      async () => ({ kind: 'shot', png: PNG, takenAt: TAKEN }),
    ])
    const { snapper, delivered } = snapperOf(source)
    await snapper.press()
    expect(snapper.read()).toEqual({ kind: 'failed', reason: '屏幕后端出错' })
    await snapper.press()
    expect(snapper.read()).toEqual({ kind: 'failed', reason: '截图的请求没有发出去' })
    await snapper.press()
    expect(snapper.read()).toEqual({ kind: 'idle' })
    expect(capture).toHaveBeenCalledTimes(3)
    expect(delivered).toHaveLength(1)
  })

  it('does not tell a listener that unsubscribed', async () => {
    const { source } = sourceOf([async () => ({ kind: 'failed', reason: '屏幕后端出错' })])
    const { snapper } = snapperOf(source)
    const heard = vi.fn()
    snapper.subscribe(heard)()
    await snapper.press()
    expect(heard).not.toHaveBeenCalled()
  })

  it('hands nothing over when it was disposed while it captured', async () => {
    let finish: (answer: ScreenAnswer) => void = () => undefined
    const { source } = sourceOf([() => new Promise(done => (finish = done))])
    const { snapper, delivered } = snapperOf(source)
    const pressed = snapper.press()
    snapper.dispose()
    finish({ kind: 'shot', png: PNG, takenAt: TAKEN })
    await pressed
    expect(delivered).toEqual([])
  })

  it('tells its listeners each change, and stops after dispose', async () => {
    const { source } = sourceOf([
      async () => ({ kind: 'shot', png: PNG, takenAt: TAKEN }),
      async () => ({ kind: 'shot', png: PNG, takenAt: TAKEN }),
    ])
    const { snapper, delivered } = snapperOf(source)
    const heard = vi.fn()
    const unsubscribe = snapper.subscribe(heard)
    await snapper.press()
    expect(heard).toHaveBeenCalledTimes(2)
    unsubscribe()
    snapper.dispose()
    await snapper.press()
    expect(delivered).toHaveLength(1)
    expect(heard).toHaveBeenCalledTimes(2)
  })
})
