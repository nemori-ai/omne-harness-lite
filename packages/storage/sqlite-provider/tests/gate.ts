import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, vi } from 'vitest'

const realSetTimeout = setTimeout

export const tick = (ms = 2): Promise<void> => new Promise(resolve => realSetTimeout(resolve, ms))

/** Real time for a wrong implementation to show itself. The verdict on a correct one does not depend on it. */
export const chance = (): Promise<void> => tick(50)

export async function until(done: () => boolean): Promise<void> {
  while (!done()) await tick()
}

export function advance(ms: number): void {
  vi.advanceTimersByTime(ms)
}

function watch(pending: Promise<unknown>): { settled: boolean } {
  const state = { settled: false }
  void pending.then(() => {
    state.settled = true
  })
  return state
}

export async function stillPending(pending: Promise<unknown>): Promise<void> {
  const state = watch(pending)
  await chance()
  expect(state.settled).toBe(false)
}

/** Moves the clock to the limit. One millisecond before it the promise must still be pending. */
export async function atLimit<T>(pending: Promise<T>, limitMs: number): Promise<T> {
  advance(limitMs - 1)
  await stillPending(pending)
  advance(1)
  return pending
}

/** How many limits are running. A call that passes through a Worker has started its limit once this grows. */
export const deadlines = (): number => vi.getTimerCount()

export const HOLD = `import { existsSync, writeFileSync } from 'node:fs'
const hold = gate => {
  if (gate === undefined) return
  writeFileSync(gate + '.in', '')
  const cell = new Int32Array(new SharedArrayBuffer(4))
  while (!existsSync(gate + '.go')) Atomics.wait(cell, 0, 0, 1)
}
`

export type Gate = Readonly<{
  path: string
  entered(): Promise<void>
  isEntered(): boolean
  open(): void
}>

let gates = 0
const closed: Gate[] = []

export function gate(dir: string): Gate {
  gates += 1
  const path = join(dir, `gate-${String(gates)}`)
  const isEntered = (): boolean => existsSync(`${path}.in`)
  const made: Gate = {
    path,
    entered: () => until(isEntered),
    isEntered,
    open: () => writeFileSync(`${path}.go`, ''),
  }
  closed.push(made)
  return made
}

/** A Worker that stays in a gate never exits: every cleanup opens what the test left closed. */
export function openGates(): void {
  for (const left of closed.splice(0)) left.open()
}
