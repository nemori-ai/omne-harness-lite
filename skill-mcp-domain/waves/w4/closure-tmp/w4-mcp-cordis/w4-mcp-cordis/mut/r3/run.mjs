// Runs the r2 mutants: applies the edits of one mutant (all must match), rebuilds the member,
// runs one test file with vitest's JSON report (OMNE_TEST_REPORT_DIR), records the exit code and
// the failed test names from the report, writes one log per mutant, and restores the file byte
// for byte. Arguments: <worktree root> <mutants.json> [ids…]. A run with id BASE-* is unmutated.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
const [root, list, ...only] = process.argv.slice(2)
const out = new URL('./logs/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const mutants = JSON.parse(readFileSync(list, 'utf8')).filter(m => only.length === 0 || only.includes(m.id))
const rows = []
const run = (cmd, args, cwd, env = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 })
for (const m of mutants) {
  const file = `${root}/${m.file}`
  const original = readFileSync(file)
  let text = original.toString('utf8')
  const missing = (m.edits ?? []).find(e => !text.includes(e.from))
  if (missing) { rows.push({ id: m.id, error: `pattern not found: ${missing.from}` }); continue }
  for (const e of m.edits ?? []) text = e.all ? text.replaceAll(e.from, e.to) : text.replace(e.from, e.to)
  writeFileSync(file, text)
  const member = `${root}/${m.member}`
  const report = `${out}/report-${m.id}`
  rmSync(report, { recursive: true, force: true })
  mkdirSync(report, { recursive: true })
  let log = `# ${m.id} ${m.name}\n# expect: ${m.expect}\n# edits: ${JSON.stringify(m.edits)}\n`
  try {
    const build = run('pnpm', ['run', 'build'], member)
    log += `$ (cd ${m.member} && pnpm run build)\nexit ${build.status}\n${build.stdout}${build.stderr}\n`
    if (build.status !== 0) { writeFileSync(`${out}/${m.id}.log`, log); rows.push({ id: m.id, build: build.status }); continue }
    const args = ['exec', 'vitest', 'run', '--mode', m.mode, ...(m.mode === 'slow' ? ['--typecheck.enabled=false'] : []), m.test]
    const started = Date.now()
    const test = run('pnpm', args, member, { NO_COLOR: '1', VITEST_MAX_WORKERS: '4', OMNE_TEST_REPORT_DIR: report })
    const json = readdirSync(report).find(f => f.endsWith('.json') && !f.endsWith('.timing.json'))
    const results = json === undefined ? undefined : JSON.parse(readFileSync(`${report}/${json}`, 'utf8'))
    const failed = (results?.testResults ?? []).flatMap(f => f.assertionResults.filter(a => a.status === 'failed').map(a => a.fullName))
    const fileErrors = (results?.testResults ?? []).filter(f => f.status === 'failed' && f.assertionResults.length === 0).map(f => f.message)
    const total = results?.numTotalTests
    const command = `(cd ${m.member} && NO_COLOR=1 VITEST_MAX_WORKERS=4 pnpm ${args.join(' ')})`
    log += `$ ${command}\nexit ${test.status}\nseconds ${((Date.now() - started) / 1000).toFixed(1)}\ntotal ${total}\nfailed ${JSON.stringify(failed, null, 1)}\nfileErrors ${JSON.stringify(fileErrors)}\n--- stdout\n${test.stdout}\n--- stderr\n${test.stderr}\n`
    const path = `${out}/${m.id}.log`
    writeFileSync(path, log)
    const sha = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12)
    rows.push({ id: m.id, name: m.name, expect: m.expect, file: m.test, command, exit: test.status, total, failed, fileErrors, log: `logs/${m.id}.log`, sha })
  } finally {
    writeFileSync(file, original)
  }
}
for (const member of new Set(mutants.map(m => m.member))) run('pnpm', ['run', 'build'], `${root}/${member}`)
console.log(JSON.stringify(rows, null, 1))
