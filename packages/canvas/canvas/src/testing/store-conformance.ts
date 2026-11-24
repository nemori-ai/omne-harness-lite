import { MAIN_CANVAS, tenantIdSchema } from '@omne-harness/canvas-contract'
import type { CanvasStore, StoreRead } from '../store.ts'

export type StoreConformanceCase = Readonly<{
  name: string
  /** Runs the case against a store of its own; rejects with what did not hold. */
  run(open: () => Promise<CanvasStore>): Promise<void>
}>

const T1 = tenantIdSchema.parse('conformance-tenant-1')
const T2 = tenantIdSchema.parse('conformance-tenant-2')

function same(actual: unknown, expected: unknown, what: string): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${what}: expected ${right}, got ${left}`)
}

function read<T>(answer: StoreRead<T>, what: string): T {
  if (answer.kind !== 'read') throw new Error(`${what}: the read answered ${answer.kind}`)
  return answer.value
}

/** What every store of the canvas answers, whatever it keeps the facts in. */
export const storeConformanceCases: readonly StoreConformanceCase[] = [
  {
    name: 'a canvas nothing was committed to reads at revision 0, with no item and no pile',
    async run(open) {
      const store = await open()
      for (const tenant of [T1, T2])
        same(
          read(await store.look(tenant, MAIN_CANVAS), `the canvas of ${tenant}`),
          { revision: 0, items: [], piles: [] },
          `the canvas of ${tenant}`,
        )
    },
  },
]
