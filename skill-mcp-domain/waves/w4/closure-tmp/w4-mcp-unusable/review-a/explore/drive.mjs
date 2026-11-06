// Usage: node --conditions=source --experimental-strip-types drive.mjs <copy-root> <label>
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const [root, label] = process.argv.slice(2)
const model = resolve(root, 'packages/mcp/mcp/tests/model')
const { explore } = await import(pathToFileURL(`${model}/explore.ts`).href)
const { WIDE } = await import(pathToFileURL(`${model}/scenarios.ts`).href)
const t0 = performance.now()
const r = await explore(WIDE, (s, runs, d) => process.stderr.write(`progress ${label} states=${s} runs=${runs} depth=${d} t=${Math.round((performance.now()-t0)/1000)}s\n`))
console.log(JSON.stringify({ label, scenario: r.scenario.name, states: r.states, runs: r.runs, depth: r.depth, frontier: r.frontier, elapsedMs: r.elapsedMs, wallMs: Math.round(performance.now()-t0), violations: r.violations.length, failureEndings: r.failureEndings ?? null }))
