import { useRef, useState } from 'react'

type Held<T> = Readonly<{ text: string; value: T }>

/** The value given before while the new one reads the same, so what is drawn from it is not drawn again for nothing. */
export function useSame<T>(value: T): T {
  const held = useRef<Held<T> | undefined>(undefined)
  const text = JSON.stringify(value)
  if (held.current?.text !== text) held.current = { text, value }
  return held.current.value
}

/** Each thing read the same as before, by its text, keeps the object it was before; a changed one is the new one. */
export function useSteady<T extends Readonly<{ id: string }>>(
  read: readonly T[],
  textOf: (value: T) => string,
): readonly T[] {
  const held = useRef<Readonly<{ read: readonly T[]; steady: readonly T[] }> | undefined>(undefined)
  const by = useRef(new Map<string, Held<T>>())
  if (held.current?.read === read) return held.current.steady
  const next = new Map<string, Held<T>>()
  const steady = read.map(value => {
    const text = textOf(value)
    const was = by.current.get(value.id)
    const kept = was !== undefined && was.text === text ? was.value : value
    next.set(value.id, { text, value: kept })
    return kept
  })
  by.current = next
  held.current = { read, steady }
  return steady
}

/** One object whose fields are always those of the latest value: what reads it at a later moment reads that moment's. */
export function useLatest<T extends object>(value: T): T {
  const held = useRef(value)
  held.current = value
  const [latest] = useState(
    () => new Proxy({} as T, { get: (_, key) => Reflect.get(held.current, key) as unknown }),
  )
  return latest
}
