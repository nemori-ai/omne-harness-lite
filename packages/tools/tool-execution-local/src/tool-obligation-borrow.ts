import type { ReadTx, Storage } from '@omne-harness-lite/storage'
import type { ExecutionRef, ToolObligationReader } from '@omne-harness-lite/tool-execution-runtime'

type Page = Awaited<ReturnType<ToolObligationReader<ExecutionRef>['next']>>

/** Hold the native snapshot without running the consumer in Storage.read's async scope. */
export async function borrowToolObligations<T>(
  storage: Storage,
  pages: (tx: ReadTx) => () => Promise<Page>,
  use: (reader: ToolObligationReader<ExecutionRef>) => Promise<T>,
): Promise<{ kind: 'used'; value: T } | { kind: 'unavailable' }> {
  const ready = Promise.withResolvers<ToolObligationReader<ExecutionRef> | undefined>()
  const finish = Promise.withResolvers<void>()
  const reads: unknown[] = []
  let phase: 'open' | 'closed' = 'open',
    invalid = false
  let pending: Promise<Page> | undefined
  const original = storage.read(async tx => {
    const load = pages(tx)
    let buffered: Page | undefined = await load()
    if (buffered.kind === 'unavailable') {
      invalid = true
      ready.resolve(undefined)
      return
    }
    let ended = false
    function next(): Promise<Page> {
      if (phase === 'closed') return Promise.resolve({ kind: 'unavailable' })
      if (pending || invalid) {
        invalid = true
        return Promise.resolve({ kind: 'unavailable' })
      }
      const reading = Promise.resolve().then(async (): Promise<Page> => {
        const page = buffered ?? (ended ? { kind: 'end' } : await load())
        buffered = undefined
        if (page.kind === 'unavailable') invalid = true
        if (page.kind === 'end') ended = true
        return page
      })
      pending = reading
      void reading.then(
        () => {
          pending = undefined
        },
        error => {
          invalid = true
          reads.push(error)
          pending = undefined
        },
      )
      return reading
    }
    ready.resolve(Object.freeze({ next }))
    await finish.promise
  })
  // Observe immediately, including failure before the first page can be published.
  const released = original.then(
    () => ({ kind: 'released' as const }),
    error => {
      ready.resolve(undefined)
      return { kind: 'failed' as const, error }
    },
  )
  let consumer:
    { kind: 'unused' } | { kind: 'value'; value: T } | { kind: 'failed'; error: unknown } = {
    kind: 'unused',
  }
  const reader = await ready.promise
  try {
    if (reader) consumer = { kind: 'value', value: await use(reader) }
  } catch (error) {
    consumer = { kind: 'failed', error }
  }
  phase = 'closed'
  if (pending) await pending.catch(() => {})
  finish.resolve()
  const result = await released
  const errors = [...(consumer.kind === 'failed' ? [consumer.error] : []), ...reads]
  if (result.kind === 'failed') errors.push(result.error)
  throwFailures(errors)
  return consumer.kind === 'value' && !invalid
    ? { kind: 'used', value: consumer.value }
    : { kind: 'unavailable' }
}

function throwFailures(errors: readonly unknown[]) {
  const unique = [...new Set(errors)]
  if (unique.length === 1) throw unique[0]
  if (unique.length > 1) throw new AggregateError(unique, 'Tool obligation borrow failed')
}
