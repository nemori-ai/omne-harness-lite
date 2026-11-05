// The driver of the identity end-to-end run (K10, AC-9): runs the flow once and writes the evidence file.
// Usage: node tests/e2e-identity/drive.ts <evidence file>. Exit 0 when every step and check matches, 1 otherwise.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { failedChecks, failedSteps, runIdentityFlow } from './flow.ts'

const target = process.argv[2]
if (target === undefined) {
  process.stderr.write('usage: node tests/e2e-identity/drive.ts <evidence file>\n')
  process.exit(2)
}
const record = await runIdentityFlow()
const passed =
  failedSteps(record).length === 0 &&
  failedChecks(record).length === 0 &&
  record.aborted === undefined
let head = 'unknown'
try {
  head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  // the evidence is still useful without the head
}
mkdirSync(dirname(resolve(target)), { recursive: true })
writeFileSync(
  resolve(target),
  `${JSON.stringify({ gitHead: head, platform: process.platform, node: process.version, ...record, passed }, null, 2)}\n`,
  'utf8',
)
for (const step of record.steps) {
  const wrong = step.probes.filter(entry => !entry.ok)
  process.stdout.write(
    `${step.ok ? 'PASS' : 'FAIL'} [step ${String(step.step)}] ${step.label}: ${String(step.outcome)}/${String(step.exitCode)} (expected ${step.expected.outcome}/${String(step.expected.exitCode)})\n`,
  )
  for (const entry of wrong)
    process.stdout.write(
      `     probe ${entry.name}: expected ${entry.expected}, actual ${entry.actual}\n`,
    )
}
for (const entry of record.checks)
  process.stdout.write(
    `${entry.ok ? 'PASS' : 'FAIL'} [check] ${entry.name}${entry.ok ? '' : `: expected ${entry.expected}, actual ${entry.actual}`}\n`,
  )
if (record.aborted !== undefined) process.stdout.write(`ABORTED: ${record.aborted}\n`)
process.exit(passed ? 0 : 1)
