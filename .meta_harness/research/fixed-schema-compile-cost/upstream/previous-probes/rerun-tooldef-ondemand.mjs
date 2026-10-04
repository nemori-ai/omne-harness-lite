// Re-run of the "on-demand compile alone" comparison on tool-definition, plus the standalone
// import, interleaved per round (fresh process per sample) so load drift hits all configs alike.
// Uses research-libs/bench-tooldef.mjs unchanged. Usage: node rerun-tooldef-ondemand.mjs <rounds>
import { execFileSync } from 'node:child_process'
import { loadavg } from 'node:os'

const LIBS = '/tmp/claude-1001/-data-qiwei-repos-omne-harness-lite/0d12f3b6-aa72-4661-a80c-d0422eb23a91/scratchpad/research-libs'
const rounds = Number(process.argv[2] ?? 5)
const configs = [
  ['ajv runtime, all 21', ['ajv-runtime', 'all']],
  ['ajv runtime, only ToolDefinition', ['ajv-runtime', 'one']],
  ['ajv standalone module, all 21', ['ajv-standalone', 'all']],
]
const run = args =>
  JSON.parse(execFileSync(process.execPath, ['bench-tooldef.mjs', ...args], { cwd: LIBS, encoding: 'utf8' }).trim().split('\n').at(-1))
for (const [, args] of configs) run(args) // unmeasured warm-up
const median = v => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const samples = configs.map(() => [])
const loads = [loadavg()[0]]
for (let r = 0; r < rounds; r++) {
  configs.forEach(([, args], i) => samples[i].push(run(args)))
  loads.push(loadavg()[0])
}
console.log(`rounds=${rounds} node=${process.version} load1 per round: ${loads.map(l => l.toFixed(2)).join(' ')}`)
configs.forEach(([label], i) => {
  const keys = Object.keys(samples[i][0])
  console.log(label.padEnd(36), JSON.stringify(Object.fromEntries(keys.map(k => [k, +median(samples[i].map(s => s[k])).toFixed(1)]))))
})
