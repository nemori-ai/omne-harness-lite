import { writeFileSync } from 'node:fs'
import { scheduleManagementResultFact } from '@omne-harness/schedule-local'
export default {
  participant: 'fixture.schedule.after',
  protocol: 'fixture-schedule-after/1',
  execute(facts, port) {
    port.requireFact(scheduleManagementResultFact)
    if (facts.mode === 'pause') {
      writeFileSync(facts.marker, 'management-writes-staged')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
    }
    if (facts.mode === 'sql')
      port.execute('SELECT absent_column FROM fixture_schedule_failure LIMIT 1', [])
    throw new Error('Injected failure after management write')
  },
}
