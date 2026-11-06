import { explore } from '../../../../packages/mcp/mcp/tests/model/explore.ts'
import * as s from '../../../../packages/mcp/mcp/tests/model/scenarios.ts'

const fast = {
  REBUILD: s.REBUILD,
  FAULTS: s.FAULTS,
  THROWS: s.THROWS,
  THROWS_EXHAUSTIVE: { ...s.THROWS, exhaustivePaths: true },
}
for (const [name, scenario] of Object.entries(fast)) {
  const t0 = performance.now()
  const r = await explore(scenario)
  const sec = ((performance.now() - t0) / 1000).toFixed(1)
  console.log(`${name}\tstates=${r.states}\truns=${r.runs}\tdepth=${r.depth}\tviolations=${r.violations.length}\tseconds=${sec}`)
}
