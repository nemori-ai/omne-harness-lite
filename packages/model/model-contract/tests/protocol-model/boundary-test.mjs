import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const output = join(directory, 'boundary-evidence')
mkdirSync(output, { recursive: true })
const files = ['run.mjs', 'self-test.mjs', 'knowledge-test.mjs', 'boundary-test.mjs']
const original = readFileSync(join(directory, 'model.mjs'), 'utf8')
const needle = 'explore({ mutation, keys, depth })'
assert.equal(original.split(needle).length, 2)
const results = []
function run(name, script, args) {
  const child = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 20 * 1024 * 1024,
  })
  writeFileSync(join(output, `${name}.stdout.txt`), child.stdout ?? '')
  writeFileSync(join(output, `${name}.stderr.txt`), child.stderr ?? '')
  assert.equal(child.error, undefined)
  assert.equal(child.signal, null)
  results.push({
    name,
    command: [process.execPath, script, ...args],
    exitCode: child.status,
    signal: child.signal,
  })
  return child
}
for (const kind of ['resource-limit', 'depth-truncation']) {
  const target = join(output, kind)
  mkdirSync(target, { recursive: true })
  const replacement =
    kind === 'resource-limit'
      ? 'explore({ mutation, keys, depth, maxStates: 1 })'
      : 'explore({ mutation, keys, depth: 0 })'
  writeFileSync(join(target, 'model.mjs'), original.replace(needle, replacement))
  for (const name of files) copyFileSync(join(directory, name), join(target, name))
  const direct = run(`${kind}-direct`, join(target, 'model.mjs'), ['none', '1'])
  const parsed = JSON.parse(direct.stdout)
  assert.equal(direct.status, kind === 'resource-limit' ? 2 : 0)
  assert.equal(parsed.status, kind === 'resource-limit' ? 'resource-limit' : 'bounded-prefix-pass')
  if (kind === 'resource-limit') assert.equal(parsed.states, 1)
  else {
    assert.equal(parsed.frontier, 1)
    assert.equal(parsed.transitions, 0)
  }
  const aggregate = run(`${kind}-aggregate`, join(target, 'run.mjs'), [])
  assert.equal(aggregate.status, 1)
  assert.match(
    aggregate.stderr,
    kind === 'resource-limit' ? /unexpected exit/ : /bounded-prefix-pass/,
  )
  const manifest = JSON.parse(readFileSync(join(target, 'evidence/manifest.json'), 'utf8'))
  assert.equal(manifest.runs.length, 1)
  assert.equal(manifest.runs[0].name, 'normal-one-key')
  assert.equal(manifest.runs[0].exitCode, direct.status)
}
const injected = join(output, 'unguarded-f1')
mkdirSync(injected, { recursive: true })
const activation = "mutation === 'query-erases-other-unknown' && domain === 'material'"
assert.equal(original.split(activation).length, 2)
writeFileSync(join(injected, 'model.mjs'), original.replace(activation, "domain === 'material'"))
for (const name of files) copyFileSync(join(directory, name), join(injected, name))
const direct = run('unguarded-f1-direct', join(injected, 'model.mjs'), ['none', '1'])
assert.equal(direct.status, 1)
const counterexample = JSON.parse(direct.stdout)
assert.equal(counterexample.status, 'counterexample')
assert.equal(counterexample.trace.length - 1, 9)
assert.ok(counterexample.failed.includes('P4_unknown_preserved'))
assert.ok(counterexample.failed.includes('P10_knowledge_sound'))
const aggregate = run('unguarded-f1-aggregate', join(injected, 'run.mjs'), [])
assert.equal(aggregate.status, 1)
assert.match(aggregate.stderr, /unexpected exit/)
const rejected = JSON.parse(readFileSync(join(injected, 'evidence/manifest.json'), 'utf8'))
assert.equal(rejected.runs.length, 1)
assert.equal(rejected.runs[0].exitCode, 1)
console.log(JSON.stringify({ status: 'passed', cases: results.length, results }, null, 2))
