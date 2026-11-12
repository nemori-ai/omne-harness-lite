import { writeFileSync } from 'node:fs'
import { calendarSupplyStorageResultFact } from '@omne-harness/calendar-local'
export default {
  participant: 'fixture.after-supply',
  protocol: 'fixture-after-supply/1',
  execute(facts, port) {
    port.requireFact(calendarSupplyStorageResultFact)
    if (facts.mode === 'pause') {
      writeFileSync(facts.marker, 'inside')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000)
    }
    return { kind: 'failed', diagnostic: 'injected after supply write' }
  },
}
