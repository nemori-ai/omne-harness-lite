// One history-cost run on the release tree (C8, V7b), on the assembly of `assembly.ts`. Every call
// is one Tools call in a new session of the same tenant. Seeding calls leave their body
// unread; the measured calls read it back page by page. The run measures `measured` calls after 20
// settled calls and `measured` calls after 200, each from `send-input` to the terminal of its Run,
// and marks each call's phase for `sql-probe.ts`, so the SQL counts of a call can be compared at
// both history sizes.
//
// node --import ./tests/history-cost/sql-probe.ts tests/history-cost/run.ts <out> <kind> [measured]
// Build `apps/cli` and the workspace first. Writes `<out>/samples.json`; the probe writes
// `<out>/sql-trace/`, and the run ends by judging them with `summarize.ts`: the exit code is
// non-zero when the run or a ruling of `summarize.ts` fails. With `HISTORY_COST_TRACE_DIR` unset
// nothing is counted or judged. The wall-clock numbers of this run compare two times of one
// process, so they are reported only; `control.ts` is the paired wall-clock comparison (V7c).
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { payloadKind, startAssembly } from './assembly.ts'

const [outArg, kindArg, measuredArg] = process.argv.slice(2)
if (outArg === undefined) throw new Error('give an output directory')
const kind = payloadKind(kindArg)
const measured = Number(measuredArg ?? '10')
const HISTORIES = [20, 200] as const

const out = resolve(outArg)
mkdirSync(out, { recursive: true })
const assembly = await startAssembly(kind)
const { author } = assembly
const home = join(assembly.base, 'home')

type Sample = Readonly<{
  ordinal: number
  settledBefore: number
  measured: boolean
  elapsedMs: number
  pages: number
  requests: number
}>

const samples: Sample[] = []
let outcome: Record<string, unknown> = { ok: false }
try {
  await assembly.ready()
  await assembly.enrol(home, 'history-cost')
  const last = (HISTORIES.at(-1) ?? 0) + measured
  for (let ordinal = 1; ordinal <= last; ordinal += 1) {
    const settledBefore = ordinal - 1
    const measuring = HISTORIES.some(n => settledBefore >= n && settledBefore < n + measured)
    if ((HISTORIES as readonly number[]).includes(settledBefore))
      assembly.storageSnapshot(join(out, `storage-${String(settledBefore)}.json`))
    const result = await assembly.call(home, ordinal, {
      readBack: measuring,
      settleMs: measuring ? 500 : 0,
    })
    samples.push({
      ordinal,
      settledBefore,
      measured: measuring,
      ...result,
    })
    writeFileSync(join(out, 'samples.json'), `${JSON.stringify(samples, null, 2)}\n`)
  }
  outcome = {
    ok: true,
    kind,
    bytes: author.bytes,
    measured,
    histories: HISTORIES,
    calls: samples.length,
  }
} catch (error) {
  outcome = { ok: false, kind, error: String(error), stderr: assembly.stderr }
} finally {
  const exitCode = await assembly.close()
  outcome['exitCode'] = exitCode
  if (exitCode !== 0) outcome['ok'] = false
  writeFileSync(join(out, 'result.json'), `${JSON.stringify(outcome, null, 2)}\n`)
  console.log(JSON.stringify(outcome).slice(0, 2000))
  const flush: unknown = Reflect.get(globalThis, 'historyCostFlush')
  // A run without the probe has nothing to judge; a measured run is judged by `summarize.ts`.
  const judged =
    typeof flush === 'function' && outcome['ok'] === true
      ? (flush(),
        spawnSync(
          process.execPath,
          [fileURLToPath(new URL('summarize.ts', import.meta.url)), out],
          {
            stdio: 'inherit',
          },
        ).status)
      : 0
  process.exitCode = outcome['ok'] === true && judged === 0 ? 0 : 1
}
