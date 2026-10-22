import { describe, expect, it } from 'vitest'
import { canonical } from '../src/canonical.ts'

describe('canonical input equality', () => {
  it.each([
    [undefined, 'undefined'],
    [null, 'null'],
    [true, 'true'],
    [3, '3'],
    ['a,b', '"a,b"'],
  ])('keeps the primitive value %s distinct', (value, text) => {
    expect(canonical(value)).toBe(text)
  })

  it('ignores object key order at every level', () => {
    const left = { z: 3, m: { y: 2, a: 1 }, a: 0 }
    const right = { a: 0, m: { a: 1, y: 2 }, z: 3 }
    expect(canonical(left)).toBe('{"a":0,"m":{"a":1,"y":2},"z":3}')
    expect(canonical(left)).toBe(canonical(right))
  })

  it('omits undefined object members without omitting null or array members', () => {
    expect(canonical({ absent: undefined, nested: { absent: undefined } })).toBe(
      canonical({ nested: {} }),
    )
    expect(canonical({ present: null })).not.toBe(canonical({ present: undefined }))
    expect(canonical([undefined])).not.toBe(canonical([]))
  })

  it('preserves array order and separates elements from delimiter characters', () => {
    expect(canonical(['a,b'])).toBe('["a,b"]')
    expect(canonical(['a', 'b'])).toBe('["a","b"]')
    expect(canonical(['a,b'])).not.toBe(canonical(['a', 'b']))
    expect(canonical(['a', 'b'])).not.toBe(canonical(['b', 'a']))
    expect(canonical({ 'a:b': 'c' })).not.toBe(canonical({ a: 'b:c' }))
    expect(canonical([['a'], 'b'])).not.toBe(canonical(['a', ['b']]))
  })

  it('uses the bytes of a view within its offset and length', () => {
    const bytes = new Uint8Array([99, 1, 2, 88])
    const view = new DataView(bytes.buffer, 1, 2)
    expect(canonical(view)).toBe('bytes(1,2)')
    expect(canonical(view)).toBe(canonical(new Uint8Array([1, 2])))
    expect(canonical(view)).not.toBe(canonical(bytes))
  })
})
