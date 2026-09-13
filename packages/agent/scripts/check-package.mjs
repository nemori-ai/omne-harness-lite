import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../..')
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const provenance = await readJson(join(packageRoot, 'provenance.json'))
const originalBaseline = await readJson(join(repoRoot, 'docs/proposals/agent-runtime/source-baseline/upstream-baseline.json'))
assert.equal(provenance.commit, originalBaseline.commit)
for (const entry of provenance.files) {
  const bytes = await readFile(join(packageRoot, entry.snapshot))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.snapshot)
  const previous = originalBaseline.files.find(file => file.path === entry.upstream_path)
  if (previous) assert.equal(entry.sha256, previous.sha256, entry.upstream_path)
}
const manifest = await readJson(join(packageRoot, 'package.json'))
assert.equal(manifest.private, true)
assert.deepEqual(Object.keys(manifest.exports), ['./baseline', './scope-baseline'])
assert.deepEqual(manifest.dependencies, { '@deepseek-ai/cordis': '4.0.2' })
const lock = await readFile(join(repoRoot, 'pnpm-lock.yaml'), 'utf8')
assert.ok(lock.includes(provenance.cordis_release.dist.integrity), 'official Cordis integrity missing from lock')
// Only resolved package records; optional peer declarations are not installed packages.
for (const [, name] of lock.matchAll(/^  '(@deepseek-ai\/[^']+)':/gm)) {
  assert.ok(['@deepseek-ai/cordis@4.0.2', '@deepseek-ai/cosmokit@1.8.3'].includes(name), `unexpected resolved package: ${name}`)
}
const scratch = await mkdtemp(join(tmpdir(), 'omne-agent-artifact-'))
let passed = false
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], packageRoot))
  const paths = packed.files.map(file => file.path)
  for (const path of paths) {
    assert.ok(path.startsWith('dist/') || ['package.json', 'LICENSE', 'README.md', 'UPSTREAM.md', 'provenance.json'].includes(path), `unexpected artifact file: ${path}`)
  }
  for (const expected of ['dist/index.js', 'dist/index.d.ts', 'LICENSE', 'README.md', 'UPSTREAM.md', 'provenance.json']) assert.ok(paths.includes(expected), expected)
  const consumer = join(scratch, 'consumer')
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({
    name: 'agent-artifact-check', private: true, type: 'module',
    dependencies: { [manifest.name]: `file:${join(scratch, packed.filename)}`, '@deepseek-ai/cordis': '4.0.2' },
    devDependencies: { typescript: manifest.devDependencies.typescript, '@types/node': manifest.devDependencies['@types/node'] },
  }, null, 2))
  // All packages are already in the pnpm store from the locked workspace install.
  // Outside the repository, offline: no src aliases or ancestor workspace modules.
  const store = run('pnpm', ['store', 'path'], repoRoot).trim()
  run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', dirname(store)], consumer)
  const cordis = await readJson(join(consumer, 'node_modules/@deepseek-ai/cordis/package.json'))
  assert.equal(cordis.version, '4.0.2')
  const consumerLock = await readFile(join(consumer, 'pnpm-lock.yaml'), 'utf8')
  assert.ok(consumerLock.includes(provenance.cordis_release.dist.integrity))
  assert.equal(await readFile(join(consumer, 'node_modules', manifest.name, 'LICENSE'), 'utf8'), await readFile(join(packageRoot, 'LICENSE'), 'utf8'))
  await writeFile(join(consumer, 'consumer.ts'), await readFile(join(packageRoot, 'scripts/fixtures/consumer.ts')))
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2024', module: 'NodeNext', strict: true, noEmitOnError: true, outDir: 'build', types: ['node'],
  }, include: ['consumer.ts'] }))
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumer)
  process.stdout.write(run(process.execPath, ['build/consumer.js'], consumer))
  console.log(`PASS: ${provenance.files.length} upstream records, ${paths.length} artifact files, official Cordis integrity`)
  passed = true
} catch (error) {
  if (error.stdout) process.stderr.write(String(error.stdout))
  if (error.stderr) process.stderr.write(String(error.stderr))
  console.error(`Artifact check failed; retained evidence: ${scratch}`)
  throw error
} finally {
  if (passed) await rm(scratch, { recursive: true, force: true })
}
