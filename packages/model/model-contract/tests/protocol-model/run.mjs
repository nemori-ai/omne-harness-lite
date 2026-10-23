import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mutations } from './model.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const output = join(directory, 'evidence')
mkdirSync(output, { recursive: true })
const runs = []
function execute(name, script, args, expectedExit, expectedProperty) {
  const started = performance.now()
  const result = spawnSync(process.execPath, [join(directory, script), ...args], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 20 * 1024 * 1024,
  })
  writeFileSync(join(output, `${name}.stdout.json`), result.stdout ?? '')
  writeFileSync(join(output, `${name}.stderr.txt`), result.stderr ?? '')
  const entry = {
    name,
    command: [process.execPath, join(directory, script), ...args],
    exitCode: result.status,
    signal: result.signal,
    durationMs: Math.round(performance.now() - started),
  }
  runs.push(entry)
  assert.equal(result.error, undefined, `${name}: subprocess did not execute`)
  assert.equal(result.status, expectedExit, `${name}: unexpected exit; see evidence`)
  const parsed = JSON.parse(result.stdout)
  if (expectedProperty) {
    assert.equal(parsed.status, 'counterexample')
    assert.ok(
      parsed.failed.includes(expectedProperty),
      `${name}: must detect ${expectedProperty}, got ${parsed.failed}`,
    )
    assert.ok(parsed.trace.length > 1)
  } else if (script === 'model.mjs') {
    assert.equal(parsed.status, 'closed-graph-pass')
    assert.equal(parsed.frontier, 0)
    assert.ok(parsed.actions['cleanup-releases-body'] > 0)
    assert.ok(parsed.actions['save-and-deliver-account-2'] > 0)
  } else if (script === 'self-test.mjs') assert.equal(parsed.scenarios, 7)
  else {
    assert.equal(parsed.status, 'passed')
    assert.equal(parsed.cases, script === 'knowledge-test.mjs' ? 78 : 6)
  }
  Object.assign(entry, {
    status: parsed.status,
    states: parsed.states,
    transitions: parsed.transitions,
    failed: parsed.failed,
    scenarios: parsed.scenarios,
    cases: parsed.cases,
  })
  console.log(
    `${name}: exit=${result.status}, ${parsed.status}, states=${parsed.states ?? '-'}, transitions=${parsed.transitions ?? '-'}`,
  )
}
try {
  execute('normal-one-key', 'model.mjs', ['none', '1'], 0)
  execute('normal-two-key', 'model.mjs', ['none', '2'], 0)
  execute('directed-scenarios', 'self-test.mjs', [], 0)
  execute('knowledge-regressions', 'knowledge-test.mjs', [], 0)
  for (const [mutation, property] of Object.entries(mutations))
    execute(mutation, 'model.mjs', [mutation, '1'], 1, property)
  execute('incomplete-entry-rejection', 'boundary-test.mjs', [], 0)
} finally {
  const hashes = Object.fromEntries(
    ['model.mjs', 'self-test.mjs', 'run.mjs', 'knowledge-test.mjs', 'boundary-test.mjs'].map(
      name => [
        name,
        createHash('sha256')
          .update(readFileSync(join(directory, name)))
          .digest('hex'),
      ],
    ),
  )
  writeFileSync(
    join(output, 'manifest.json'),
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
        hashes,
        runs,
      },
      null,
      2,
    ),
  )
}
