import { EventEmitter } from 'node:events'
import { expect, it } from 'vitest'
import { setRawChecked } from '../src/tui/raw-mode.ts'

class RawStream extends EventEmitter {
  isRaw = true
  fail = false
  setRawMode(enabled: boolean): this {
    if (this.fail) {
      this.emit('error', new Error('raw mode failed'))
      return this
    }
    this.isRaw = enabled
    return this
  }
}
it('recognizes Node synchronous error emission when setRawMode returns without throwing', () => {
  const stream = new RawStream()
  stream.fail = true
  expect(() => setRawChecked(stream, false)).toThrow('input-restore-failed')
  expect(stream.isRaw).toBe(true)
  expect(stream.listenerCount('error')).toBe(0)
})
it('restores normally, retaining external error listeners', () => {
  const stream = new RawStream(),
    observed: unknown[] = []
  const listener = (error: unknown) => {
    observed.push(error)
  }
  stream.on('error', listener)
  setRawChecked(stream, false)
  expect(stream.isRaw).toBe(false)
  expect(stream.listeners('error')).toEqual([listener])
})
it('does not accept an unchanged raw-state flag as successful restoration', () => {
  const stream = new RawStream()
  stream.setRawMode = () => stream
  expect(() => setRawChecked(stream, false)).toThrow('input-restore-failed')
})
