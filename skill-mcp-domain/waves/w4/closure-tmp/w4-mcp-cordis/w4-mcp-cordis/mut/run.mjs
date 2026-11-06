// Applies the edits of one mutant to a source file, rebuilds the member, runs one test file,
// records the exit code and the failed test names, and restores the file byte for byte.
import { execSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
const root = process.argv[2]
const mutants = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const out = []
for (const m of mutants) {
  const file = `${root}/${m.file}`
  const original = readFileSync(file)
  let text = original.toString('utf8')
  const missing = m.edits.find(e => !text.includes(e.from))
  if (missing) { out.push({ name: m.name, error: `pattern not found: ${missing.from}` }); continue }
  for (const e of m.edits) text = text.replace(e.from, e.to)
  writeFileSync(file, text)
  try {
    const member = `${root}/${m.member}`
    const build = spawnSync('pnpm', ['run', 'build'], { cwd: member, encoding: 'utf8' })
    if (build.status !== 0) { out.push({ name: m.name, build: build.status, error: build.stdout.slice(-600) }); continue }
    const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--mode', m.mode ?? 'slow', m.test], {
      cwd: member, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', VITEST_MAX_WORKERS: '4' },
    })
    const failed = [...run.stdout.matchAll(/^\s*×\s+(.*?)\s+\d+ms$/gm)].map(x => x[1])
    out.push({ name: m.name, exit: run.status, failed })
  } finally {
    writeFileSync(file, original)
  }
}
for (const member of new Set(mutants.map(m => m.member))) execSync('pnpm run build', { cwd: `${root}/${member}` })
console.log(JSON.stringify(out, null, 1))
