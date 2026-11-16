import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { failed, runR9Flow } from './flow.ts'

const outDir = process.argv[2]
if (outDir === undefined) {
  process.stderr.write('usage: node tests/r9/drive.ts <output directory>\n')
  process.exit(2)
}
mkdirSync(resolve(outDir), { recursive: true })

const record = await runR9Flow()
const bad = failed(record.checks)
writeFileSync(
  join(resolve(outDir), 'flow-record.json'),
  `${JSON.stringify({ ...record, passed: bad.length === 0 }, null, 2)}\n`,
  'utf8',
)
for (const entry of record.checks)
  process.stdout.write(
    `${entry.ok ? 'PASS' : 'FAIL'} [item ${String(entry.item)}] ${entry.name}${entry.ok ? '' : `\n     ${entry.detail}`}\n`,
  )
process.exit(bad.length === 0 ? 0 : 1)
