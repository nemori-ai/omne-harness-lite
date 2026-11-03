import { writeFileSync } from 'node:fs'
import { calendarPersistenceResultFact } from '@omne-harness/calendar-local'

export default {
  participant: 'fixture.after-calendar-write',
  protocol: 'fixture-after-calendar-write/1',
  execute(facts, port) {
    port.requireFact(calendarPersistenceResultFact)
    if (facts.mode === 'pause') {
      writeFileSync(facts.marker, 'inside transaction')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000)
    }
    return { kind: 'failed', diagnostic: 'injected after Calendar writes' }
  },
}
