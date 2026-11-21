import type { ModelFailure } from '@omne-harness/model-contract'
import { definite, delayAfter, workLeft, type PushProgress } from './push-values.ts'

type Input<T> = Readonly<{
  keyOf(target: T): string | undefined
  paused(ms: number): Promise<boolean>
  wake(target: T): void
  delaysMs: readonly number[]
}>

export function createPushAgain<T>(input: Input<T>) {
  const marked = new Set<string>()
  const waiting = new Set<string>()
  const pauses = new Map<string, number>()

  async function later(key: string, target: T): Promise<void> {
    if (waiting.has(key)) return
    waiting.add(key)
    const failures = pauses.get(key) ?? 0
    pauses.set(key, failures + 1)
    const elapsed = await input.paused(delayAfter(input.delaysMs, failures))
    waiting.delete(key)
    if (elapsed) input.wake(target)
  }

  return {
    mark<R extends T>(target: R, failure?: ModelFailure): R {
      const key = input.keyOf(target)
      if (key !== undefined && (failure === undefined || !definite(failure))) marked.add(key)
      return target
    },
    settle(key: string, target: T, record: PushProgress | undefined): void {
      const owed = marked.delete(key) || (record !== undefined && workLeft(record))
      if (owed) void later(key, target)
      else pauses.delete(key)
    },
    waits: (key: string): boolean => waiting.has(key),
  }
}
