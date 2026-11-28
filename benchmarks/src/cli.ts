import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { perf } from '@omne-harness/perf-harness'
import { ROOT, settingOf } from './setting.ts'
import { SUITES } from './suites.ts'

const HEAVY = new Set(['run', 'compare'])

const given = process.argv.slice(2)
const args = given[0] === '--' ? given.slice(1) : given

if (HEAVY.has(args[0] ?? '') && !process.env['OMNE_TEST_SLOT_HELD']) {
  const queued = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts', 'with-test-slot.mjs'),
      process.execPath,
      ...process.execArgv,
      process.argv[1] ?? '',
      ...args,
    ],
    { stdio: 'inherit' },
  )
  process.exitCode = queued.status ?? 2
} else {
  process.exitCode = await perf(args, settingOf(ROOT, SUITES), {
    out: line => process.stdout.write(`${line}\n`),
    err: line => process.stderr.write(`${line}\n`),
  })
}
