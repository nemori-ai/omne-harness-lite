import { describe, expect, it } from 'vitest'
import { storedCanvasPreferences } from '../src/page/canvas-preferences.ts'

describe('画布在本机记着的偏好', () => {
  it('看着哪一块与远近、磁吸各记在 omne.canvas. 之下，写了就原样读得回', () => {
    const held = new Map<string, string>()
    const preferences = storedCanvasPreferences(() => ({
      getItem: key => held.get(key) ?? null,
      setItem: (key, value) => void held.set(key, value),
    }))
    expect(preferences.read('view')).toBeNull()
    preferences.write('view', '{"x":1,"y":2,"zoom":1}')
    preferences.write('magnet', 'off')
    expect(preferences.read('view')).toBe('{"x":1,"y":2,"zoom":1}')
    expect([...held.keys()]).toEqual(['omne.canvas.view', 'omne.canvas.magnet'])
  })
})
