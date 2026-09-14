import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { members, files, imports, validateImport, closure } from './boundaries.mjs'

const tool = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(tool, '../..')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const inventory = await members(repo)
const baseline = await json(join(repo, 'docs/proposals/agent-runtime/source-baseline/upstream-baseline.json'))
const lock = await readFile(join(repo, 'pnpm-lock.yaml'), 'utf8')
assert.ok((await readFile(join(repo, 'pnpm-workspace.yaml'), 'utf8')).includes('packages/*/*'))
for (const [, name] of lock.matchAll(/^  '(@deepseek-ai\/[^']+)':/gm)) {
  assert.ok(['@deepseek-ai/cordis@4.0.2', '@deepseek-ai/cosmokit@1.8.3'].includes(name), `unexpected resolved package: ${name}`)
}

let records = 0
for (const member of inventory) {
  const { root, manifest } = member
  assert.equal(manifest.private, true)
  assert.deepEqual(Object.keys(manifest.exports), ['./baseline'])
  const provenance = await json(join(root, 'provenance.json'))
  assert.equal(provenance.commit, baseline.commit)
  assert.equal(new Set(provenance.files.map(e => e.snapshot)).size, provenance.files.length)
  if (provenance.cordis_release) assert.ok(lock.includes(provenance.cordis_release.dist.integrity), 'official Cordis integrity')
  const covered = new Set()
  for (const entry of provenance.files) {
    assert.equal(hash(await readFile(join(root, entry.snapshot))), entry.sha256, entry.snapshot)
    const earlier = baseline.files.find(e => e.path === entry.upstream_path)
    if (earlier) assert.equal(entry.sha256, earlier.sha256, entry.upstream_path)
    for (const target of entry.targets) {
      await readFile(join(root, target))
      covered.add(target)
    }
    records++
  }
  for (const entry of provenance.project_files ?? []) {
    assert.ok(entry.purpose.length > 0)
    await readFile(join(root, entry.path))
    covered.add(entry.path)
  }
  assert.ok(provenance.files.some(e => e.upstream_path === 'LICENSE' && e.snapshot === 'LICENSE'), `MIT provenance: ${root}`)
  for (const directory of ['src', 'dist', 'tests']) {
    let paths
    try { paths = await files(join(root, directory)) }
    catch (error) { if (directory === 'tests' && error.code === 'ENOENT') continue; throw error }
    if (directory === 'src') assert.ok(paths.some(p => p.endsWith('.ts')), `empty product package: ${root}`)
    for (const file of paths.filter(p => /\.(ts|js|mjs)$/.test(p))) {
      if (directory === 'src') assert.ok(covered.has(relative(root, file)), `unmapped active source: ${file}`)
      for (const specifier of imports(await readFile(file, 'utf8'), file)) validateImport(specifier, file, member, inventory, directory === 'tests')
    }
  }
  closure(member, inventory)
}
console.log(`PASS: ${inventory.length} responsibility leaves, dependency boundaries, ${records} source records`)

const scratch = await mkdtemp(join(tmpdir(), 'omne-package-artifacts-'))
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const tarballs = new Map()
let passed = false
try {
  for (const { root, manifest } of inventory) {
    const raw = JSON.parse(run('pnpm', ['pack', '--json', '--pack-destination', scratch], root))
    const packed = Array.isArray(raw) ? raw[0] : raw
    const paths = packed.files.map(f => f.path)
    for (const path of paths) assert.ok(path.startsWith('dist/') || ['package.json', 'LICENSE', 'README.md', 'UPSTREAM.md', 'provenance.json'].includes(path), `artifact contains non-distribution file: ${path}`)
    for (const entry of Object.values(manifest.exports)) {
      for (const path of [entry.types, entry.import]) assert.ok(paths.includes(path.slice(2)), `missing public artifact: ${path}`)
    }
    for (const path of ['LICENSE','README.md','UPSTREAM.md','provenance.json']) assert.ok(paths.includes(path))
    tarballs.set(manifest.name, `file:${resolve(scratch, packed.filename)}`)
  }
  const store = dirname(run('pnpm', ['store', 'path'], repo).trim())
  async function consume(label, roots, selected, fixture = '', extras = {}) {
    const consumer = join(scratch, label)
    await mkdir(consumer)
    const dependencies = Object.fromEntries(roots.map(p => [p.manifest.name, tarballs.get(p.manifest.name)]))
    // Only the declared transitive closure is available. Unrelated leaves and
    // workspace source links cannot conceal a missing dependency.
    const overrides = Object.fromEntries([...selected].map(p => [p.manifest.name, tarballs.get(p.manifest.name)]))
    await writeFile(join(consumer, 'package.json'), JSON.stringify({
      name: 'artifact-consumer-' + label, private: true, type: 'module',
      dependencies: { ...dependencies, ...extras },
      devDependencies: { typescript: '6.0.3', '@types/node': '24.13.4' },
      pnpm: { overrides },
    }, null, 2))
    run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', store], consumer)
    for (const member of roots) {
      const installed = join(consumer, 'node_modules', member.manifest.name)
      assert.equal(await readFile(join(installed, 'LICENSE'), 'utf8'), await readFile(join(member.root, 'LICENSE'), 'utf8'))
      const manifest = await json(join(installed, 'package.json'))
      assert.ok(!JSON.stringify(manifest.dependencies).includes('workspace:'), 'pack must rewrite workspace edges')
      assert.ok(!(await realpath(installed)).startsWith(repo + '/'), 'consumer resolved workspace source')
    }
    const imports = roots.flatMap((p, n) => Object.keys(p.manifest.exports).map(key => `import * as m${n} from '${p.manifest.name}/${key.slice(2)}'; void m${n};`)).join('\n')
    await writeFile(join(consumer, 'consumer.ts'), imports + '\n' + fixture)
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2024', module: 'NodeNext', strict: true, noEmitOnError: true, outDir: 'build', types: ['node'],
    }, include: ['*.ts'] }))
    if (label === 'composition') {
      for (const file of ['agent.ts', 'projection.ts']) await writeFile(join(consumer, file), await readFile(join(tool, 'fixtures', file)))
    }
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumer)
    process.stdout.write(run(process.execPath, ['build/consumer.js'], consumer))
    if (label === 'composition') {
      for (const file of ['agent', 'projection']) process.stdout.write(run(process.execPath, [`build/${file}.js`], consumer))
    }
    console.log(`PASS: isolated ${label}, ${selected.size} declared product artifact(s), strict declarations + runtime`)
  }
  for (const member of inventory) await consume(member.manifest.name.split('/')[1], [member], closure(member, inventory))
  await consume('composition', inventory, new Set(inventory), await readFile(join(tool, 'fixtures/composition.ts'), 'utf8'), { '@deepseek-ai/cordis': '4.0.2', zod: '4.4.3' })
  passed = true
} catch (error) {
  if (error.stdout) process.stderr.write(String(error.stdout))
  if (error.stderr) process.stderr.write(String(error.stderr))
  console.error(`Failed artifact evidence retained: ${scratch}`)
  throw error
} finally {
  if (passed) await rm(scratch, { recursive: true, force: true })
}
