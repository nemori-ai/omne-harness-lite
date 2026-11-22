// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SIZE_TIERS,
  type SizeRoot,
  type SizeTier,
  createSizeController,
  sizeStepForKey,
  stepSize,
  useSizeFactor,
} from '../src/index.ts'

function setup(stored: string | null | undefined) {
  const root: SizeRoot = { dataset: { size: 'large' } }
  const read = vi.fn(() => stored)
  const write = vi.fn<(tier: SizeTier) => void>()
  const controller = createSizeController({ read, write, root })
  return { root, read, write, controller }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete document.documentElement.dataset['size']
})

describe('the size controller', () => {
  it('knows four tiers and starts from the middle one', () => {
    expect(SIZE_TIERS).toEqual(['small', 'medium', 'large', 'reading'])
    expect(setup(null).controller.current()).toBe('medium')
  })

  it.each(['small', 'large', 'reading'] as const)(
    'a stored %s is written on the page as data-size',
    tier => {
      const { root, read, write, controller } = setup(tier)
      expect(controller.current()).toBe(tier)
      expect(root.dataset.size).toBe(tier)
      expect(read).toHaveBeenCalledTimes(1)
      expect(write).not.toHaveBeenCalled()
    },
  )

  it.each(['medium', null, undefined, '', 'huge', 'MEDIUM'])(
    'a stored %s is the middle tier, and the page carries no data-size',
    stored => {
      const { root, controller } = setup(stored)
      expect(controller.current()).toBe('medium')
      expect('size' in root.dataset).toBe(false)
    },
  )

  it('set puts the tier on the page first and then hands it to write', () => {
    const { root, write, controller } = setup(null)
    const seen: (string | undefined)[] = []
    write.mockImplementation(() => void seen.push(root.dataset.size))
    controller.set('reading')
    expect(write).toHaveBeenCalledExactlyOnceWith('reading')
    expect(seen).toEqual(['reading'])
    expect(controller.current()).toBe('reading')
    controller.set('medium')
    expect(write).toHaveBeenLastCalledWith('medium')
    expect('size' in root.dataset).toBe(false)
  })

  it('keeps the page on the new tier when write throws, and lets the failure through', () => {
    const { root, write, controller } = setup('small')
    const heard: SizeTier[] = []
    controller.subscribe(tier => void heard.push(tier))
    write.mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => controller.set('large')).toThrow('full')
    expect(root.dataset.size).toBe('large')
    expect(controller.current()).toBe('large')
    expect(heard).toEqual(['large'])
  })

  it('tells each listener about a change once, and not after it lets go', () => {
    const { controller } = setup(null)
    const heard: SizeTier[] = []
    const off = controller.subscribe(tier => void heard.push(tier))
    controller.set('large')
    controller.set('large')
    controller.set('small')
    off()
    controller.set('reading')
    expect(heard).toEqual(['large', 'small'])
  })

  it('writes on the real document root when none is injected, with no data-size at the middle tier', () => {
    document.documentElement.dataset['size'] = 'reading'
    const controller = createSizeController({ read: () => 'medium', write: () => undefined })
    expect(document.documentElement.hasAttribute('data-size')).toBe(false)
    controller.set('large')
    expect(document.documentElement.getAttribute('data-size')).toBe('large')
    controller.set('medium')
    expect(document.documentElement.hasAttribute('data-size')).toBe(false)
  })

  it('never reads or writes storage by itself', () => {
    const touched = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map(name =>
      vi.spyOn(Storage.prototype, name),
    )
    const controller = createSizeController({ read: () => 'large', write: () => undefined })
    controller.subscribe(() => undefined)
    for (const tier of SIZE_TIERS) controller.set(tier)
    controller.set(stepSize(controller.current(), 'larger'))
    for (const spy of touched) expect(spy).not.toHaveBeenCalled()
  })
})

describe('one tier at a time', () => {
  it('goes one tier larger or smaller and stops at either end', () => {
    expect(SIZE_TIERS.map(tier => stepSize(tier, 'larger'))).toEqual([
      'medium',
      'large',
      'reading',
      'reading',
    ])
    expect(SIZE_TIERS.map(tier => stepSize(tier, 'smaller'))).toEqual([
      'small',
      'small',
      'medium',
      'large',
    ])
  })

  it('goes back to the middle tier from any tier', () => {
    expect(SIZE_TIERS.map(tier => stepSize(tier, 'standard'))).toEqual([
      'medium',
      'medium',
      'medium',
      'medium',
    ])
  })

  const key = (key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
    key,
    metaKey: modifiers.metaKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
  })

  it.each([
    ['=', 'larger'],
    ['+', 'larger'],
    ['-', 'smaller'],
    ['_', 'smaller'],
    ['0', 'standard'],
  ] as const)(
    'reads %s with Command on macOS and with Control elsewhere as %s',
    (pressed, step) => {
      expect(sizeStepForKey(key(pressed, { metaKey: true }), 'mac')).toBe(step)
      expect(sizeStepForKey(key(pressed, { ctrlKey: true }), 'other')).toBe(step)
    },
  )

  it('reads nothing else as a size key', () => {
    expect(sizeStepForKey(key('='), 'mac')).toBeUndefined()
    expect(sizeStepForKey(key('=', { ctrlKey: true }), 'mac')).toBeUndefined()
    expect(sizeStepForKey(key('=', { metaKey: true }), 'other')).toBeUndefined()
    expect(sizeStepForKey(key('=', { metaKey: true, ctrlKey: true }), 'mac')).toBeUndefined()
    expect(sizeStepForKey(key('=', { metaKey: true, ctrlKey: true }), 'other')).toBeUndefined()
    expect(sizeStepForKey(key('9', { metaKey: true }), 'mac')).toBeUndefined()
    expect(sizeStepForKey(key('Equal', { ctrlKey: true }), 'other')).toBeUndefined()
  })
})

describe('the size factor', () => {
  it('reads the factor the page has and follows data-size, without touching storage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const style = document.createElement('style')
    style.textContent =
      ":root { --omne-size: 1; } :root[data-size='small'] { --omne-size: 0.75; } :root[data-size='reading'] { --omne-size: 1.5; }"
    document.head.append(style)
    const { result } = renderHook(() => useSizeFactor())
    expect(result.current).toBe(1)
    const mark = (tier: string | undefined) =>
      act(async () => {
        if (tier === undefined) delete document.documentElement.dataset['size']
        else document.documentElement.dataset['size'] = tier
        await Promise.resolve()
      })
    await mark('reading')
    expect(result.current).toBe(1.5)
    await mark('small')
    expect(result.current).toBe(0.75)
    await mark(undefined)
    expect(result.current).toBe(1)
    style.remove()
    expect(getItem).not.toHaveBeenCalled()
  })
})
