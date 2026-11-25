// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSteady } from '../src/view/steady.ts'

type Thing = Readonly<{ id: string; at: number }>
const textOf = (thing: Thing) => String(thing.at)

describe('useSteady', () => {
  it('gives the same list again while it is given the same read', () => {
    const read: readonly Thing[] = [{ id: 'a', at: 1 }]
    const { result, rerender } = renderHook(({ list }) => useSteady(list, textOf), {
      initialProps: { list: read },
    })
    const first = result.current
    rerender({ list: read })
    expect(result.current).toBe(first)
  })

  it('keeps a thing that reads the same, and takes a changed one', () => {
    const a = { id: 'a', at: 1 }
    const b = { id: 'b', at: 1 }
    const { result, rerender } = renderHook(({ list }) => useSteady(list, textOf), {
      initialProps: { list: [a, b] as readonly Thing[] },
    })
    const changed = { id: 'b', at: 2 }
    rerender({ list: [{ id: 'a', at: 1 }, changed] })
    expect(result.current[0]).toBe(a)
    expect(result.current[1]).toBe(changed)
  })
})
