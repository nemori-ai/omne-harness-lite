// Prints the explorer's readings for the fast-tier scenarios (lifecycle.spec.ts, calls.spec.ts).
import { explore } from '../../../packages/mcp/mcp/tests/model/explore.ts'
import * as s from '../../../packages/mcp/mcp/tests/model/scenarios.ts'

const fast = {
  REBUILD: s.REBUILD,
  FAULTS: s.FAULTS,
  THROWS: s.THROWS,
  THROWS_EXHAUSTIVE: { ...s.THROWS, exhaustivePaths: true },
  CALL: s.CALL,
  ABORT: s.ABORT,
  CALL_FAULTS: s.CALL_FAULTS,
  MARKS: s.MARKS,
  CONTINUE: s.CONTINUE,
  CALL_SHUTDOWN: s.CALL_SHUTDOWN,
  FOREIGN_CANCEL: s.FOREIGN_CANCEL,
  FOREIGN_TASK: s.FOREIGN_TASK,
}
for (const [name, scenario] of Object.entries(fast)) {
  const r = await explore(scenario)
  console.log(`${name}\tstates=${r.states}\truns=${r.runs}\tdepth=${r.depth}\tviolations=${r.violations.length}\tendings=${JSON.stringify(r.failureEndings ?? null)}`)
}
