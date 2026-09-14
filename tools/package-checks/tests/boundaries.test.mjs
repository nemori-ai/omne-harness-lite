import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as boundaryChecks from '../src/boundaries.mjs'
import * as repositoryCheck from '../src/check.mjs'
import { members, imports, validateImport, closure } from '../src/boundaries.mjs'

const scratchRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../tmp/p0-package-checks',
)
const checkScript = resolve(dirname(fileURLToPath(import.meta.url)), '../src/check.mjs')
const sha256 = value => createHash('sha256').update(value).digest('hex')

async function packageLeaf(root, relativePath, name) {
  const leaf = join(root, relativePath)
  await mkdir(leaf, { recursive: true })
  await writeFile(join(leaf, 'package.json'), JSON.stringify({ name }))
  return leaf
}

async function ownedMember(
  repo,
  relativePath,
  name,
  { dependency, externalDependencies = {}, baselineAlias = false, runtimeIsolation = false } = {},
) {
  const root = join(repo, relativePath)
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'dist'), { recursive: true })
  const source = runtimeIsolation
    ? `import { createRequire } from 'node:module'
const load = createRequire(import.meta.url)
const { globalPaths } = load('node:module')
let borrowed = false
try { load(['global', 'only'].join('-')); borrowed = true } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
}
if (borrowed) throw new Error('NODE_PATH dependency leaked into artifact runtime')
if (process.env.NODE_PATH !== undefined) throw new Error('NODE_PATH reached artifact runtime')
if (process.env.NODE_OPTIONS !== '--no-global-search-paths') throw new Error('inherited NODE_OPTIONS reached artifact runtime')
if (globalPaths.length !== 0) throw new Error('Node global search paths remained enabled')
if (process.env.CC !== 'fixture-cc' || process.env.CXX !== 'fixture-cxx' || process.env.GCC_EXEC_PREFIX !== 'fixture-gcc-prefix') throw new Error('native compiler environment was removed')
export const value = 1
`
    : dependency
      ? `export { value } from '${dependency}'\n`
      : 'export const value = 1\n'
  await writeFile(join(root, 'src/index.ts'), source)
  await writeFile(join(root, 'dist/index.js'), source)
  await writeFile(
    join(root, 'dist/index.d.ts'),
    dependency ? `export { value } from '${dependency}'\n` : 'export declare const value = 1\n',
  )
  await writeFile(join(root, 'README.md'), `# ${name}\n`)
  await writeFile(
    join(root, 'provenance.json'),
    JSON.stringify({
      format: 1,
      scope: 'project-owned package-check fixture',
      files: [],
      project_files: [{ path: 'src/index.ts', purpose: 'fixture public entry' }],
    }),
  )
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name,
      version: '0.0.0',
      private: true,
      type: 'module',
      license: 'UNLICENSED',
      exports: Object.fromEntries([
        ['.', { types: './dist/index.d.ts', import: './dist/index.js' }],
        ...(baselineAlias
          ? [['./baseline', { types: './dist/index.d.ts', import: './dist/index.js' }]]
          : []),
      ]),
      files: ['dist', 'README.md', 'provenance.json'],
      dependencies: {
        ...(dependency ? { [dependency]: 'workspace:*' } : {}),
        ...externalDependencies,
      },
    }),
  )
}

const make = name => ({
  root: `/repo/packages/family/${name}`,
  manifest: { name: `@omne-harness-lite/${name}`, exports: { './baseline': {} }, dependencies: {} },
})

test('finds real import/export/type/augmentation dependencies, ignoring comments and strings', () => {
  assert.deepEqual(
    imports(`
    // import 'ignored';
    const example = "import 'also-ignored'";
    import type { A } from 'a'; export { B } from 'b';
    type C = import('c').C;
    declare module 'd' { interface X {} }
    await import('e'); require('f');
  `),
    ['a', 'b', 'c', 'd', 'e', 'f'],
  )
})

test('discovers responsibility packages and real application members', async t => {
  await mkdir(scratchRoot, { recursive: true })
  const repo = await mkdtemp(join(scratchRoot, 'members-'))
  t.after(() => rm(repo, { recursive: true, force: true }))
  await packageLeaf(repo, 'packages/core/work-data', '@omne-harness-lite/work-data')
  await mkdir(join(repo, 'packages/governance/authorization'), { recursive: true })
  await writeFile(join(repo, 'packages/governance/authorization/design.md'), '# Design only\n')
  await packageLeaf(repo, 'apps/local-harness', '@omne-harness-lite/local-harness')
  await mkdir(join(repo, 'apps/planned-harness'))
  await writeFile(join(repo, 'apps/planned-harness/design.md'), '# Design only\n')

  assert.deepEqual(
    (await members(repo)).map(member => ({
      kind: member.kind,
      name: member.manifest.name,
    })),
    [
      { kind: 'app', name: '@omne-harness-lite/local-harness' },
      { kind: 'package', name: '@omne-harness-lite/work-data' },
    ],
  )

  const brokenPackage = join(repo, 'packages/governance/broken')
  await mkdir(join(brokenPackage, 'src'), { recursive: true })
  await assert.rejects(members(repo), /product source lacks package.json/)
  await rm(brokenPackage, { recursive: true })
  await mkdir(join(repo, 'apps/broken/src'), { recursive: true })
  await assert.rejects(members(repo), /application source lacks package.json/)
})

test('classifies baseline, evolved, and project-owned public entries by actual source records', () => {
  const baseline = {
    repository: 'https://github.com/deepseek-ai/deepseek-harness',
    files: [{ upstream_path: 'src/index.ts' }],
    project_files: [],
  }
  const owned = { files: [], project_files: [{ path: 'src/index.ts', purpose: 'owned contract' }] }
  const manifest = (exports, source = owned) => ({
    name: '@omne-harness-lite/example',
    private: true,
    license: source === baseline ? 'MIT' : 'UNLICENSED',
    files:
      source === baseline
        ? ['dist', 'LICENSE', 'README.md', 'UPSTREAM.md', 'provenance.json']
        : ['dist', 'README.md', 'provenance.json'],
    exports,
  })
  const entry = { types: './dist/index.d.ts', import: './dist/index.js' }

  boundaryChecks.validateManifest(manifest({ './baseline': entry }, baseline), baseline)
  boundaryChecks.validateManifest(manifest({ '.': entry, './baseline': entry }, baseline), baseline)
  boundaryChecks.validateManifest(manifest({ '.': entry }), owned)
  assert.throws(
    () => boundaryChecks.validateManifest(manifest({ './baseline': entry }), owned),
    /project-owned package requires a default public export/,
  )
  assert.throws(
    () => boundaryChecks.validateManifest(manifest({ '.': { import: './dist/index.js' } }), owned),
    /types declaration/,
  )
  assert.throws(
    () => boundaryChecks.validateManifest({ ...manifest({ '.': entry }), license: 'MIT' }, owned),
    /declared license requires LICENSE/,
  )
  assert.throws(
    () =>
      boundaryChecks.validateManifest(
        { ...manifest({ './baseline': entry }, baseline), license: 'Apache-2.0' },
        baseline,
      ),
    /DSH-derived package license must match MIT source/,
  )
})

test('keeps artifact consumers outside repository ancestor dependency resolution', async t => {
  await mkdir(scratchRoot, { recursive: true })
  const repo = await mkdtemp(join(scratchRoot, 'ancestor-'))
  t.after(() => rm(repo, { recursive: true, force: true }))
  const ancestorModule = join(repo, 'node_modules/ancestor-only')
  await mkdir(ancestorModule, { recursive: true })
  await writeFile(
    join(ancestorModule, 'package.json'),
    JSON.stringify({ name: 'ancestor-only', type: 'module', exports: './index.js' }),
  )
  await writeFile(join(ancestorModule, 'index.js'), 'export const borrowed = true\n')
  const source =
    "import { borrowed } from 'ancestor-only'; if (!borrowed) throw new Error('missing')\n"
  await writeFile(join(repo, 'probe.mjs'), source)
  execFileSync(process.execPath, ['probe.mjs'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })

  const sandbox = await repositoryCheck.createArtifactScratch(repo)
  t.after(() => rm(sandbox, { recursive: true, force: true }))
  assert.ok(
    relative(repo, sandbox).startsWith('..'),
    `sandbox must be outside repository: ${sandbox}`,
  )
  await writeFile(join(sandbox, 'probe.mjs'), source)
  let failure
  try {
    execFileSync(process.execPath, ['probe.mjs'], {
      cwd: sandbox,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    failure = error
  }
  assert.ok(failure, 'undeclared ancestor-only dependency unexpectedly resolved')
  assert.match(String(failure.stderr), /ERR_MODULE_NOT_FOUND/)

  await writeFile(
    join(sandbox, 'require-probe.mjs'),
    `import { createRequire } from 'node:module'; createRequire(import.meta.url)('ancestor-only')\n`,
  )
  let requireFailure
  try {
    execFileSync(process.execPath, ['require-probe.mjs'], {
      cwd: sandbox,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    requireFailure = error
  }
  assert.ok(
    requireFailure,
    'createRequire unexpectedly resolved undeclared ancestor-only dependency',
  )
  assert.match(String(requireFailure.stderr), /MODULE_NOT_FOUND/)

  await writeFile(
    join(sandbox, 'package.json'),
    JSON.stringify({
      name: 'missing-declaration-control',
      private: true,
      type: 'module',
      devDependencies: { typescript: '6.0.3' },
    }),
  )
  const store = execFileSync('pnpm', ['store', 'path'], { encoding: 'utf8' }).trim()
  execFileSync(
    'pnpm',
    ['install', '--offline', '--ignore-scripts', '--ignore-workspace', '--store-dir', store],
    {
      cwd: sandbox,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  await writeFile(join(sandbox, 'missing.d.ts'), "export { borrowed } from 'ancestor-only'\n")
  await writeFile(
    join(sandbox, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2024',
        module: 'NodeNext',
        strict: true,
        noEmit: true,
      },
      include: ['missing.d.ts'],
    }),
  )
  let declarationFailure
  try {
    execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], {
      cwd: sandbox,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    declarationFailure = error
  }
  assert.ok(
    declarationFailure,
    'declaration compiler unexpectedly resolved ancestor-only dependency',
  )
  assert.match(String(declarationFailure.stdout), /TS2307/)

  const repositoryTmp = join(repo, 'tmp')
  await mkdir(repositoryTmp)
  const originalTmpdir = process.env.TMPDIR
  process.env.TMPDIR = repositoryTmp
  let trappedSandbox
  let rejection
  try {
    trappedSandbox = await repositoryCheck.createArtifactScratch(repo)
  } catch (error) {
    rejection = error
  } finally {
    if (originalTmpdir === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = originalTmpdir
  }
  assert.ok(rejection, `repo-internal TMPDIR created artifact scratch: ${trappedSandbox}`)
  assert.match(String(rejection.message), /artifact scratch must be outside repository/)
  assert.deepEqual(
    await readdir(repositoryTmp),
    [],
    'rejected repository-local scratch was not removed',
  )

  const linkRoot = await mkdtemp(join(scratchRoot, 'tmp-link-'))
  t.after(() => rm(linkRoot, { recursive: true, force: true }))
  const linkedTmp = join(linkRoot, 'inside-repository')
  await symlink(repositoryTmp, linkedTmp, 'dir')
  process.env.TMPDIR = linkedTmp
  rejection = undefined
  trappedSandbox = undefined
  try {
    trappedSandbox = await repositoryCheck.createArtifactScratch(repo)
  } catch (error) {
    rejection = error
  } finally {
    if (originalTmpdir === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = originalTmpdir
  }
  assert.ok(
    rejection,
    `symlinked repository-local TMPDIR created artifact scratch: ${trappedSandbox}`,
  )
  assert.match(String(rejection.message), /artifact scratch must be outside repository/)
  assert.deepEqual(await readdir(repositoryTmp), [], 'rejected symlinked scratch was not removed')
})

test('rejects a sibling worktree scratch that can borrow a common ancestor module', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'omne-worktree-ancestor-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const main = join(fixture, 'main')
  const spoke = join(main, '.worktrees/spoke')
  const siblingTmp = join(main, 'tmp')
  const pollutionPackage = join(fixture, 'ancestor-only')
  await mkdir(join(main, 'node_modules'), { recursive: true })
  await mkdir(spoke, { recursive: true })
  await mkdir(siblingTmp)
  await mkdir(pollutionPackage)
  await writeFile(
    join(pollutionPackage, 'package.json'),
    JSON.stringify({
      name: 'ancestor-only',
      type: 'module',
      exports: './index.js',
    }),
  )
  await writeFile(join(pollutionPackage, 'index.js'), 'export const borrowed = true\n')
  await symlink(pollutionPackage, join(main, 'node_modules/ancestor-only'), 'dir')

  const originalTmpdir = process.env.TMPDIR
  process.env.TMPDIR = siblingTmp
  let sandbox
  let rejection
  try {
    sandbox = await repositoryCheck.createArtifactScratch(spoke)
  } catch (error) {
    rejection = error
  } finally {
    if (originalTmpdir === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = originalTmpdir
  }
  if (rejection) {
    assert.match(String(rejection.message), /artifact scratch ancestor contains node_modules/)
    assert.deepEqual(await readdir(siblingTmp), [], 'rejected sibling scratch was not removed')
    return
  }

  await writeFile(
    join(sandbox, 'probe.mjs'),
    "import { borrowed } from 'ancestor-only'; if (!borrowed) throw new Error('missing')\n",
  )
  execFileSync(process.execPath, ['probe.mjs'], { cwd: sandbox, stdio: ['ignore', 'pipe', 'pipe'] })
  assert.fail(
    `sibling worktree scratch borrowed symlinked ancestor-only from ${join(main, 'node_modules')}`,
  )
})

test('validates DSH source truth separately from project-owned provenance', async t => {
  await mkdir(scratchRoot, { recursive: true })
  const repo = await mkdtemp(join(scratchRoot, 'provenance-'))
  t.after(() => rm(repo, { recursive: true, force: true }))
  const upstreamText = 'export const upstream = true\n'
  const licenseText = 'MIT fixture\n'
  const commit = 'c291e7961a515f6d7af9304e7fd1d257929aef26'
  const baseline = {
    commit,
    files: [
      { path: 'packages/core/example/src/index.ts', sha256: sha256(upstreamText) },
      { path: 'LICENSE', sha256: sha256(licenseText) },
    ],
  }
  const root = await packageLeaf(repo, 'packages/core/example', '@omne-harness-lite/example')
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'upstream/example'), { recursive: true })
  await writeFile(join(root, 'src/index.ts'), 'export const evolved = true\n')
  await writeFile(join(root, 'upstream/example/index.ts'), upstreamText)
  await writeFile(join(root, 'LICENSE'), licenseText)
  const derived = {
    format: 1,
    repository: 'https://github.com/deepseek-ai/deepseek-harness',
    commit,
    scope: 'fixture source',
    files: [
      {
        upstream_path: 'packages/core/example/src/index.ts',
        snapshot: 'upstream/example/index.ts',
        sha256: sha256(upstreamText),
        targets: ['src/index.ts'],
        changes: 'evolved for fixture',
      },
      {
        upstream_path: 'LICENSE',
        snapshot: 'LICENSE',
        sha256: sha256(licenseText),
        targets: ['LICENSE'],
        changes: 'unchanged license',
      },
    ],
    project_files: [],
  }
  await boundaryChecks.validateProvenance(
    { kind: 'package', root, manifest: { name: '@omne-harness-lite/example' } },
    derived,
    baseline,
  )

  const falseSource = structuredClone(derived)
  falseSource.files[0].upstream_path = 'LICENSE'
  await assert.rejects(
    boundaryChecks.validateProvenance(
      { kind: 'package', root, manifest: { name: '@omne-harness-lite/example' } },
      falseSource,
      baseline,
    ),
    /DSH source hash/,
  )

  const ownedRoot = await packageLeaf(repo, 'packages/core/owned', '@omne-harness-lite/owned')
  await mkdir(join(ownedRoot, 'src'), { recursive: true })
  await writeFile(join(ownedRoot, 'src/index.ts'), 'export const owned = true\n')
  const owned = {
    format: 1,
    scope: 'project-owned fixture',
    files: [],
    project_files: [{ path: 'src/index.ts', purpose: 'owned contract' }],
  }
  await boundaryChecks.validateProvenance(
    { kind: 'package', root: ownedRoot, manifest: { name: '@omne-harness-lite/owned' } },
    owned,
    baseline,
  )
  await assert.rejects(
    boundaryChecks.validateProvenance(
      { kind: 'package', root: ownedRoot, manifest: { name: '@omne-harness-lite/owned' } },
      { ...owned, repository: derived.repository, commit },
      baseline,
    ),
    /upstream identity without source records/,
  )
})

test('checks every packed public declaration and maps default exports to valid consumer specifiers', () => {
  const entry = { types: './dist/index.d.ts', import: './dist/index.js' }
  const member = {
    manifest: {
      name: '@omne-harness-lite/owned',
      license: 'UNLICENSED',
      exports: { '.': entry },
    },
  }
  const owned = { files: [] }
  const paths = ['package.json', 'README.md', 'provenance.json', 'dist/index.d.ts', 'dist/index.js']

  boundaryChecks.validatePackedArtifact(member, owned, paths)
  assert.equal(boundaryChecks.exportSpecifier(member.manifest.name, '.'), member.manifest.name)
  assert.equal(
    boundaryChecks.exportSpecifier(member.manifest.name, './baseline'),
    `${member.manifest.name}/baseline`,
  )
  assert.throws(
    () =>
      boundaryChecks.validatePackedArtifact(
        member,
        owned,
        paths.filter(path => path !== 'dist/index.d.ts'),
      ),
    /missing public artifact/,
  )
  assert.throws(
    () => boundaryChecks.validatePackedArtifact(member, owned, [...paths, 'src/index.ts']),
    /artifact contains non-distribution file/,
  )
  assert.throws(
    () =>
      boundaryChecks.validatePackedArtifact(
        { manifest: { ...member.manifest, license: 'MIT' } },
        { files: [{ upstream_path: 'src/index.ts' }] },
        paths,
      ),
    /LICENSE/,
  )
})

test(
  'checks project-owned packages and apps through independent tarball consumers with sanitized Node resolution',
  { timeout: 60_000 },
  async t => {
    await mkdir(scratchRoot, { recursive: true })
    const repo = await mkdtemp(join(scratchRoot, 'repository-'))
    t.after(() => rm(repo, { recursive: true, force: true }))
    await ownedMember(repo, 'packages/core/work-data', '@omne-harness-lite/work-data', {
      baselineAlias: true,
      runtimeIsolation: true,
    })
    await ownedMember(repo, 'apps/local-harness', '@omne-harness-lite/local-harness', {
      dependency: '@omne-harness-lite/work-data',
    })
    await writeFile(
      join(repo, 'package.json'),
      JSON.stringify({ name: 'fixture-root', private: true, packageManager: 'pnpm@10.28.1' }),
    )
    await writeFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n  - apps/*\n')
    execFileSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const globalModules = join(repo, 'global-modules')
    const globalOnly = join(globalModules, 'global-only')
    await mkdir(globalOnly, { recursive: true })
    await writeFile(
      join(globalOnly, 'package.json'),
      JSON.stringify({ name: 'global-only', main: './index.cjs' }),
    )
    await writeFile(join(globalOnly, 'index.cjs'), 'module.exports = { borrowed: true }\n')
    await writeFile(
      join(repo, 'global-control.cjs'),
      "if (!require('global-only').borrowed) throw new Error('missing global control')\n",
    )
    const inheritedEnvironment = { ...process.env, NODE_PATH: globalModules, NODE_OPTIONS: '' }
    execFileSync(process.execPath, ['global-control.cjs'], {
      cwd: repo,
      env: inheritedEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const preloadMarker = join(repo, 'inherited-preload-ran')
    const preload = join(repo, 'preload.cjs')
    await writeFile(
      preload,
      `const { appendFileSync } = require('node:fs')
const relevant = process.argv.some(value =>
  value === 'tsc' || /(?:^|[\\/])tsc(?:\\.js)?$/.test(value) || /build[\\/](?:consumer|agent|projection)\\.js$/.test(value))
if (relevant) appendFileSync(${JSON.stringify(preloadMarker)}, process.argv.join(' ') + '\\n')
`,
    )
    const preloadControl = join(repo, 'artifact-consumer-preload-control')
    await mkdir(preloadControl)
    await writeFile(join(preloadControl, 'tsc.js'), '')
    execFileSync(process.execPath, ['tsc.js'], {
      cwd: preloadControl,
      env: { ...inheritedEnvironment, NODE_OPTIONS: `--require=${preload}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.match(await readFile(preloadMarker, 'utf8'), /tsc\.js/)
    await rm(preloadMarker)

    let output
    let checkFailure
    try {
      output = execFileSync(process.execPath, [checkScript, '--root', repo], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...inheritedEnvironment,
          NODE_OPTIONS: `--require=${preload}`,
          CC: 'fixture-cc',
          CXX: 'fixture-cxx',
          GCC_EXEC_PREFIX: 'fixture-gcc-prefix',
        },
      })
    } catch (error) {
      checkFailure = error
      const retained = String(error.stderr).match(/Failed artifact evidence retained: (.+)/)?.[1]
      if (retained) await rm(retained, { recursive: true, force: true })
    }
    if (checkFailure) {
      assert.match(String(checkFailure.stderr), /NODE_PATH dependency leaked into artifact runtime/)
      assert.fail('artifact runtime inherited NODE_PATH from the checker environment')
    }
    assert.match(output, /PASS: 2 product members/)
    assert.match(output, /isolated local-harness/)
    assert.match(output, /isolated work-data/)
    assert.match(output, /isolated composition/)
    let inheritedPreload
    try {
      inheritedPreload = await readFile(preloadMarker, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    assert.equal(
      inheritedPreload,
      undefined,
      `inherited preload ran in artifact subprocess: ${inheritedPreload}`,
    )
  },
)

test('permits only the probed fs-ext native rebuild with an exact product and lock version', () => {
  const member = make('jsonl')
  member.manifest.dependencies['fs-ext'] = '2.1.1'
  const rootManifest = { pnpm: { onlyBuiltDependencies: ['fs-ext'] } }
  const lock = '  fs-ext@2.1.1:\n    dependencies:\n      nan: 2.28.0\n'

  assert.deepEqual(boundaryChecks.nativeBuildPlan(rootManifest, lock, [member]), ['fs-ext'])
  assert.deepEqual(
    boundaryChecks.nativeBuildPlan(
      rootManifest,
      "  'fs-ext@2.1.1':\n    dependencies:\n      nan: 2.28.0\n",
      [member],
    ),
    ['fs-ext'],
  )
  assert.throws(
    () => boundaryChecks.nativeBuildPlan({ pnpm: { onlyBuiltDependencies: [] } }, lock, [member]),
    /fs-ext requires pnpm.onlyBuiltDependencies allowlisting/,
  )
  assert.throws(
    () =>
      boundaryChecks.nativeBuildPlan({ pnpm: { onlyBuiltDependencies: ['other-native'] } }, lock, [
        member,
      ]),
    /unsupported native build dependency/,
  )
  member.manifest.dependencies['fs-ext'] = '^2.1.1'
  assert.throws(
    () => boundaryChecks.nativeBuildPlan(rootManifest, lock, [member]),
    /fs-ext must be pinned to 2.1.1/,
  )
  member.manifest.dependencies['fs-ext'] = '2.1.1'
  assert.throws(
    () =>
      boundaryChecks.nativeBuildPlan(
        rootManifest,
        '  fs-ext@2.1.1:\n    dependencies:\n      nan: 2.27.0\n',
        [member],
      ),
    /fs-ext lock must pin nan to 2.28.0/,
  )
  assert.deepEqual(boundaryChecks.nativeBuildPlan(rootManifest, '', [make('records')]), [])
})

test(
  'rejects a no-op native rebuild that exits zero without producing a loadable fs-ext addon',
  { timeout: 60_000 },
  async t => {
    await mkdir(scratchRoot, { recursive: true })
    const repo = await mkdtemp(join(scratchRoot, 'native-no-op-'))
    t.after(() => rm(repo, { recursive: true, force: true }))
    await ownedMember(repo, 'packages/observation/diagnostics', '@omne-harness-lite/diagnostics', {
      externalDependencies: { 'fs-ext': '2.1.1' },
    })
    await mkdir(join(repo, 'apps'))
    await writeFile(
      join(repo, 'package.json'),
      JSON.stringify({
        name: 'fixture-root',
        private: true,
        packageManager: 'pnpm@10.28.1',
        pnpm: { onlyBuiltDependencies: ['fs-ext'] },
      }),
    )
    await writeFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
    execFileSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const shimDirectory = join(repo, 'pnpm-shim')
    const shim = join(shimDirectory, 'pnpm')
    await mkdir(shimDirectory)
    await writeFile(
      shim,
      `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const args = process.argv.slice(2)
if (args[0] === 'rebuild' && args[1] === 'fs-ext') {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  if (JSON.stringify(manifest.pnpm.onlyBuiltDependencies) !== JSON.stringify(['fs-ext'])) process.exit(86)
  if (process.env.NODE_PATH !== undefined || process.env.NODE_OPTIONS !== '--no-global-search-paths') process.exit(87)
  if (process.env.CC !== 'fault-injected-cc' || process.env.CXX !== 'fault-injected-cxx' || process.env.GCC_EXEC_PREFIX !== 'fault-injected-gcc-prefix') process.exit(88)
  process.exit(0)
}
const result = spawnSync(process.env.REAL_PNPM, args, { env: process.env, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
`,
    )
    await chmod(shim, 0o755)
    const realPnpm = execFileSync('which', ['pnpm'], { encoding: 'utf8' }).trim()

    let failure
    try {
      execFileSync(process.execPath, [checkScript, '--root', repo], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: `${shimDirectory}:${process.env.PATH}`,
          REAL_PNPM: realPnpm,
          CC: 'fault-injected-cc',
          CXX: 'fault-injected-cxx',
          GCC_EXEC_PREFIX: 'fault-injected-gcc-prefix',
        },
      })
    } catch (error) {
      failure = error
      const retained = String(error.stderr).match(/Failed artifact evidence retained: (.+)/)?.[1]
      if (retained) await rm(retained, { recursive: true, force: true })
    }
    assert.ok(failure, 'checker accepted rebuild exit 0 without loading the native addon')
    assert.match(String(failure.stderr), /MODULE_NOT_FOUND/)
  },
)

const nativeCompilerAvailable = Boolean(
  process.env.CC && process.env.CXX && process.env.GCC_EXEC_PREFIX,
)

test(
  'loads one shared addon for multiple direct native owners and a transitive consumer',
  {
    timeout: 120_000,
    skip: nativeCompilerAvailable
      ? false
      : 'requires explicit CC, CXX and GCC_EXEC_PREFIX for the real fs-ext build',
  },
  async t => {
    await mkdir(scratchRoot, { recursive: true })
    const repo = await mkdtemp(join(scratchRoot, 'native-shared-'))
    t.after(() => rm(repo, { recursive: true, force: true }))
    await ownedMember(repo, 'packages/observation/diagnostics', '@omne-harness-lite/diagnostics', {
      externalDependencies: { 'fs-ext': '2.1.1' },
    })
    await ownedMember(repo, 'packages/storage/jsonl', '@omne-harness-lite/jsonl', {
      externalDependencies: { 'fs-ext': '2.1.1' },
    })
    await ownedMember(repo, 'apps/local-harness', '@omne-harness-lite/local-harness', {
      dependency: '@omne-harness-lite/diagnostics',
    })
    await writeFile(
      join(repo, 'package.json'),
      JSON.stringify({
        name: 'fixture-root',
        private: true,
        packageManager: 'pnpm@10.28.1',
        pnpm: { onlyBuiltDependencies: ['fs-ext'] },
      }),
    )
    await writeFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n  - apps/*\n')
    execFileSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const output = execFileSync(process.execPath, [checkScript, '--root', repo], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    assert.match(
      output,
      /"declaredBy":"@omne-harness-lite\/diagnostics"[^\n]+\nPASS: isolated local-harness, 2 declared product artifact\(s\)/,
      'transitive native owner was not traversed from the application root',
    )
    const nativeLines = output
      .split('\n')
      .filter(line => line.startsWith('PASS: loaded fs-ext@2.1.1'))
    const compositionEvidence = JSON.parse(
      nativeLines.at(-1).slice(nativeLines.at(-1).indexOf('[')),
    )
    assert.deepEqual(
      compositionEvidence.map(entry => entry.declaredBy),
      ['@omne-harness-lite/diagnostics', '@omne-harness-lite/jsonl'],
    )
    assert.equal(
      new Set(compositionEvidence.map(entry => entry.addonPath)).size,
      1,
      'direct native owners did not share the resolved fs-ext addon',
    )
  },
)

test('applies existing import guards to project-owned default exports', () => {
  const owned = name => ({
    kind: 'package',
    root: `/repo/packages/core/${name}`,
    manifest: { name: `@omne-harness-lite/${name}`, exports: { '.': {} }, dependencies: {} },
  })
  const a = owned('a'),
    b = owned('b'),
    file = `${a.root}/src/index.ts`

  assert.throws(() => validateImport(b.manifest.name, file, a, [a, b]), /undeclared dependency/)
  assert.throws(
    () => validateImport('../../b/src/index.ts', file, a, [a, b]),
    /cross-package relative import/,
  )
})

test('public imports require a declared runtime edge; development dependencies cannot mask it', () => {
  const a = make('a'),
    b = make('b'),
    file = `${a.root}/src/index.ts`
  a.manifest.devDependencies = { [b.manifest.name]: 'workspace:*' }
  assert.throws(
    () => validateImport(`${b.manifest.name}/baseline`, file, a, [a, b]),
    /undeclared dependency/,
  )
  validateImport(`${b.manifest.name}/baseline`, file, a, [a, b], true)
  a.manifest.dependencies[b.manifest.name] = 'workspace:*'
  validateImport(`${b.manifest.name}/baseline`, file, a, [a, b])
  assert.throws(
    () => validateImport(`${b.manifest.name}/src/index.ts`, file, a, [a, b]),
    /private package subpath/,
  )
})

test('relative src and dist penetration and unknown product edges fail', () => {
  const a = make('a'),
    file = `${a.root}/src/index.ts`
  for (const specifier of ['../../b/src/index.ts', '../../b/dist/index.js']) {
    assert.throws(() => validateImport(specifier, file, a, [a]), /cross-package relative import/)
  }
  validateImport('./own.ts', file, a, [a])
  a.manifest.dependencies['@omne-harness-lite/missing'] = 'workspace:*'
  assert.throws(() => closure(a, [a]), /unknown product dependency/)
})

test('transitive closure excludes unrelated and development members and rejects cycles', () => {
  const a = make('a'),
    b = make('b'),
    c = make('c'),
    d = make('d')
  a.manifest.dependencies[b.manifest.name] = 'workspace:*'
  b.manifest.dependencies[c.manifest.name] = 'workspace:*'
  a.manifest.devDependencies = { [d.manifest.name]: 'workspace:*' }
  assert.deepEqual([...closure(a, [a, b, c, d])], [c, b, a])
  c.manifest.dependencies[a.manifest.name] = 'workspace:*'
  assert.throws(() => closure(a, [a, b, c, d]), /dependency cycle/)
})
