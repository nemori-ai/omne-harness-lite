import { setImmediate as nextTurn } from 'node:timers/promises'
import v8 from 'node:v8'
import vm from 'node:vm'

// The bounded-contribution tests watch objects through weak references, which the garbage
// collector clears only when nothing holds them. The collector is exposed by a V8 flag; it is not
// there unless this module has set it, and a test that cannot collect fails instead of skipping.
v8.setFlagsFromString('--expose-gc')
const gc: unknown = vm.runInNewContext('gc')

export async function collectGarbage(): Promise<void> {
  if (typeof gc !== 'function') throw new Error('the garbage collector is not exposed')
  for (let round = 0; round < 4; round += 1) {
    await nextTurn()
    gc()
  }
}
