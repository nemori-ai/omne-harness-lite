import { useCallback, useEffect, useRef, useState } from 'react'

/** Why a read gave no answer the page can draw: none of them is an empty result. */
export type Unreadable =
  | 'denied'
  | 'basis-unavailable'
  | 'protocol-rejected'
  | 'unavailable'
  | 'uncertain'
  | 'not-sent'

/** One read as the page holds it. `refused` is an answer of the domain, not a failure to read. */
export type Reading<T> =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'read'; value: T }>
  | Readonly<{ kind: 'refused'; outcome: string; body: unknown }>
  | Readonly<{ kind: 'unreadable'; reason: Unreadable }>

export type Answer = Readonly<{ outcome: string; body?: unknown }>

const UNREADABLE: ReadonlySet<string> = new Set([
  'denied',
  'basis-unavailable',
  'protocol-rejected',
  'unavailable',
  'uncertain',
])

export const READING: Reading<never> = { kind: 'reading' }

/** The answer of a read operation, as the page shows it. */
export function readingOf<T>(answer: Answer): Reading<T> {
  if (answer.outcome === 'succeeded') return { kind: 'read', value: answer.body as T }
  if (UNREADABLE.has(answer.outcome))
    return { kind: 'unreadable', reason: answer.outcome as Unreadable }
  return { kind: 'refused', outcome: answer.outcome, body: answer.body }
}

/** Sends one read; a body the contract refuses never leaves, and that is said, not thrown. */
export async function readOnce<T>(send: () => Promise<Answer>): Promise<Reading<T>> {
  try {
    return readingOf<T>(await send())
  } catch {
    return { kind: 'unreadable', reason: 'not-sent' }
  }
}

export const UNREADABLE_TEXT: Readonly<Record<Unreadable, string>> = {
  denied: '这次登录不能读这个租户的数据。',
  'basis-unavailable': '服务端暂时取不到依据。',
  'protocol-rejected': '服务端不认这次请求。',
  unavailable: '连不上服务端。',
  uncertain: '没有收到确定的答复。',
  'not-sent': '请求没有发出：输入不合规则。',
}

/**
 * Reads on mount and whenever `key` changes, and again on `reload`. An answer that arrives after the
 * key changed or the page went away is dropped, so one tenant's data is never drawn for another.
 */
export function useReading<T>(
  key: string,
  read: (signal: AbortSignal) => Promise<Answer>,
): readonly [Reading<T>, () => void] {
  const [state, setState] = useState<Readonly<{ key: string; reading: Reading<T> }>>({
    key,
    reading: READING,
  })
  const [round, setRound] = useState(0)
  const latest = useRef(read)
  latest.current = read
  useEffect(() => {
    const abort = new AbortController()
    setState({ key, reading: READING })
    void readOnce<T>(() => latest.current(abort.signal)).then(reading => {
      if (!abort.signal.aborted) setState({ key, reading })
    })
    return () => abort.abort()
  }, [key, round])
  const reload = useCallback(() => setRound(value => value + 1), [])
  return [state.key === key ? state.reading : READING, reload]
}
