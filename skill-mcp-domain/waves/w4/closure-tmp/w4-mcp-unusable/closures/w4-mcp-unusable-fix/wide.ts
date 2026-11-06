// Prints the explorer's readings for `wide` (lifecycle.spec.ts, slow tier).
import { explore } from '../../../packages/mcp/mcp/tests/model/explore.ts'
import { WIDE } from '../../../packages/mcp/mcp/tests/model/scenarios.ts'

const r = await explore(WIDE)
console.log(`WIDE\tstates=${r.states}\truns=${r.runs}\tdepth=${r.depth}\tviolations=${r.violations.length}\telapsedMs=${r.elapsedMs}`)
