import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdtemp, mkdir, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '../..')
const json = async p => JSON.parse(await readFile(p, 'utf8'))
const manifest = await json(join(root, 'package.json'))
const provenance = await json(join(root, 'provenance.json'))
assert.equal(manifest.private, true)
assert.ok(Object.keys(manifest.exports).every(k => k.startsWith('./baseline/')))
for (const entry of provenance.files) {
  assert.equal(createHash('sha256').update(await readFile(join(root, entry.snapshot))).digest('hex'), entry.sha256, entry.snapshot)
  for (const target of entry.targets) await readFile(join(root, target))
}
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await scan(path)
    else if (/\.(?:ts|js)$/.test(path)) {
      const source = await readFile(path, 'utf8')
      for (const [, imported] of source.matchAll(/(?:from\s*|import\()\s*['"](@deepseek-ai\/[^'"]+)['"]/g)) {
        assert.equal(imported, '@deepseek-ai/cordis', `excluded dependency in ${path}: ${imported}`)
      }
    }
  }
}
await scan(join(root, 'src'))
await scan(join(root, 'dist'))
const scratch = await mkdtemp(join(tmpdir(), 'omne-dsh-artifact-'))
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let passed = false
try {
  const pack = cwd => {
    const raw = JSON.parse(run('pnpm', ['pack', '--json', '--pack-destination', scratch], cwd))
    return Array.isArray(raw) ? raw[0] : raw
  }
  const agent = pack(join(repo, 'packages/agent'))
  const own = pack(root)
  for (const file of own.files) assert.ok(file.path.startsWith('dist/') || ['package.json', 'LICENSE', 'README.md', 'UPSTREAM.md', 'provenance.json'].includes(file.path), file.path)
  const consumer = join(scratch, 'consumer')
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({
    name: 'dsh-source-artifact-check', private: true, type: 'module',
    dependencies: {
      [manifest.name]: `file:${resolve(scratch, own.filename)}`,
      '@omne-harness-lite/agent': `file:${resolve(scratch, agent.filename)}`,
      '@deepseek-ai/cordis': '4.0.2',
    },
    devDependencies: { typescript: '6.0.3', '@types/node': '24.13.4' },
    // Private workspace packages are intentionally unpublished. Resolve every
    // transitive agent edge to the exact delivered artifact, never source files.
    pnpm: { overrides: { '@omne-harness-lite/agent': `file:${resolve(scratch, agent.filename)}` } },
  }, null, 2))
  const store = run('pnpm', ['store', 'path'], repo).trim()
  run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', dirname(store)], consumer)
  const all = Object.keys(manifest.exports).map((key, n) => `import * as module${n} from '${manifest.name}/${key.slice(2)}'; void module${n};`).join('\n')
  await writeFile(join(consumer, 'consumer.ts'), all + '\n' + await readFile(join(root, 'scripts/consumer.ts'), 'utf8'))
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2024', module: 'NodeNext', strict: true, noEmitOnError: true, outDir: 'build', types: ['node'],
  }, include: ['consumer.ts'] }))
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumer)
  process.stdout.write(run(process.execPath, ['build/consumer.js'], consumer))
  assert.equal(await readFile(join(consumer, 'node_modules', manifest.name, 'LICENSE'), 'utf8'), await readFile(join(root, 'LICENSE'), 'utf8'))
  console.log(`PASS: ${provenance.files.length} source records, ${Object.keys(manifest.exports).length} subpaths, isolated dual-tarball declarations/runtime`)
  passed = true
} catch (error) {
  if (error.stdout) process.stderr.write(String(error.stdout))
  if (error.stderr) process.stderr.write(String(error.stderr))
  console.error(`Retained failing artifact evidence: ${scratch}`)
  throw error
} finally {
  if (passed) await rm(scratch, { recursive: true, force: true })
}
