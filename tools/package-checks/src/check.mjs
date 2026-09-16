import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  members,
  files,
  imports,
  validateImport,
  closure,
  validateManifest,
  validateProvenance,
  validatePackedArtifact,
  exportSpecifier,
  nativeBuildPlan,
  requiresArtifactChecks,
} from './boundaries.mjs'

const script = fileURLToPath(import.meta.url)
const tool = resolve(dirname(script), '..')
const defaultRepo = resolve(tool, '../..')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const run = (command, args, cwd, allowScripts = false, isolateModules = false) => {
  const env = { ...process.env, npm_config_ignore_scripts: allowScripts ? 'false' : 'true' }
  if (isolateModules) {
    delete env.NODE_PATH
    env.NODE_OPTIONS = '--no-global-search-paths'
  }
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
}
const runArtifactNode = (args, cwd) =>
  run(process.execPath, ['--no-global-search-paths', ...args], cwd, false, true)

async function optionalJson(path) {
  try {
    return await json(path)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function parseRoot(argv) {
  if (argv.length === 0) return defaultRepo
  if (argv.length === 2 && argv[0] === '--root') return resolve(argv[1])
  if (argv.length === 1 && argv[0].startsWith('--root='))
    return resolve(argv[0].slice('--root='.length))
  assert.fail('usage: node src/check.mjs [--root <repository>]')
}

function legacyFixturesAvailable(inventory) {
  const required = [
    '@omne-harness-lite/agent',
    '@omne-harness-lite/agent-loop',
    '@omne-harness-lite/jsonl',
    '@omne-harness-lite/llm',
    '@omne-harness-lite/scope',
    '@omne-harness-lite/session',
    '@omne-harness-lite/session-persistence',
    '@omne-harness-lite/session-projection',
    '@omne-harness-lite/system-prompt',
    '@omne-harness-lite/timeout',
    '@omne-harness-lite/tools',
    '@omne-harness-lite/values',
  ]
  return required.every(name =>
    inventory.some(
      member => member.manifest.name === name && './baseline' in member.manifest.exports,
    ),
  )
}

function containsPath(root, candidate) {
  const local = relative(root, candidate)
  return local === '' || (local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local))
}

async function moduleAncestor(scratch) {
  let ancestor = dirname(scratch)
  while (true) {
    const modules = join(ancestor, 'node_modules')
    try {
      const status = await lstat(modules)
      if (status.isDirectory() || status.isSymbolicLink()) return modules
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) return undefined
    ancestor = parent
  }
}

export async function createArtifactScratch(repo) {
  const scratch = await mkdtemp(join(tmpdir(), 'omne-package-artifacts-'))
  try {
    const [repositoryRoot, scratchRoot] = await Promise.all([realpath(repo), realpath(scratch)])
    if (containsPath(repositoryRoot, scratchRoot)) {
      assert.fail(`artifact scratch must be outside repository: ${scratchRoot}`)
    }
    const modules = await moduleAncestor(scratchRoot)
    if (modules) assert.fail(`artifact scratch ancestor contains node_modules: ${modules}`)
    return scratchRoot
  } catch (error) {
    await rm(scratch, { recursive: true, force: true })
    throw error
  }
}

export async function checkRepository(repo) {
  const inventory = await members(repo)
  const workspace = await readFile(join(repo, 'pnpm-workspace.yaml'), 'utf8')
  assert.ok(workspace.includes('packages/*/*'), 'workspace must discover responsibility packages')
  if (inventory.some(member => member.kind === 'app')) {
    assert.ok(workspace.includes('apps/*'), 'workspace must discover applications')
  }
  const lock = await readFile(join(repo, 'pnpm-lock.yaml'), 'utf8')
  for (const [, name] of lock.matchAll(/^  '(@deepseek-ai\/[^']+)':/gm)) {
    assert.ok(
      ['@deepseek-ai/cordis@4.0.2', '@deepseek-ai/cosmokit@1.8.3'].includes(name),
      `unexpected resolved package: ${name}`,
    )
  }
  const rootManifest = await json(join(repo, 'package.json'))
  const nativeBuilds = nativeBuildPlan(rootManifest, lock, inventory)
  if (nativeBuilds.length > 0) {
    assert.ok(
      process.env.CC && process.env.CXX && process.env.GCC_EXEC_PREFIX,
      'native artifact checks require explicit CC, CXX and GCC_EXEC_PREFIX',
    )
  }
  const dshBaseline = await optionalJson(
    join(repo, 'tools/package-checks/evidence/dsh-agent-source/upstream-baseline.json'),
  )

  let records = 0
  const provenances = new Map()
  const artifactMembers = []
  for (const member of inventory) {
    const { root, manifest } = member
    const artifactMember = requiresArtifactChecks(member)
    if (artifactMember) {
      artifactMembers.push(member)
      const provenance = await json(join(root, 'provenance.json'))
      provenances.set(member, provenance)
      validateManifest(manifest, provenance)
      await validateProvenance(member, provenance, dshBaseline)
      if (provenance.cordis_release) {
        assert.ok(
          lock.includes(provenance.cordis_release.dist.integrity),
          'official Cordis integrity',
        )
      }
      records += provenance.files.length
    }

    for (const directory of ['src', 'dist', 'tests']) {
      let paths
      try {
        paths = await files(join(root, directory))
      } catch (error) {
        if (error.code === 'ENOENT' && (directory === 'tests' || !artifactMember)) continue
        throw error
      }
      for (const file of paths.filter(path => /\.(?:ts|js|mjs|cts|mts)$/.test(path))) {
        for (const specifier of imports(await readFile(file, 'utf8'), file)) {
          validateImport(specifier, file, member, inventory, directory === 'tests')
        }
      }
    }
    const dependencies = closure(member, inventory)
    if (!artifactMember) {
      console.log(
        `PASS: checked private application carrier ${manifest.name.split('/')[1]}, ${dependencies.size - 1} declared product dependency(s)`,
      )
    }
  }
  console.log(
    `PASS: ${inventory.length} product members, dependency boundaries, ${records} upstream source records`,
  )

  const scratch = await createArtifactScratch(repo)
  const tarballs = new Map()
  let passed = false
  try {
    for (const member of artifactMembers) {
      const raw = JSON.parse(
        run('pnpm', ['pack', '--json', '--pack-destination', scratch], member.root),
      )
      const packed = Array.isArray(raw) ? raw[0] : raw
      const paths = packed.files.map(file => file.path)
      validatePackedArtifact(member, provenances.get(member), paths)
      tarballs.set(member.manifest.name, `file:${resolve(scratch, packed.filename)}`)
    }

    const store = run('pnpm', ['store', 'path'], repo).trim()
    async function consume(label, roots, selected, fixture = '', fixtureFiles = [], extras = {}) {
      const consumer = join(scratch, label)
      await mkdir(consumer)
      const selectedNativeMembers = [...selected].filter(member => {
        const dependencies = {
          ...member.manifest.dependencies,
          ...member.manifest.optionalDependencies,
        }
        return 'fs-ext' in dependencies
      })
      const selectedNativeBuilds = selectedNativeMembers.length > 0 ? nativeBuilds : []
      const dependencies = Object.fromEntries(
        roots.map(member => [member.manifest.name, tarballs.get(member.manifest.name)]),
      )
      // Only the declared transitive closure is available. Unrelated leaves and
      // workspace source links cannot conceal a missing dependency.
      const overrides = Object.fromEntries(
        [...selected].map(member => [member.manifest.name, tarballs.get(member.manifest.name)]),
      )
      await writeFile(
        join(consumer, 'package.json'),
        JSON.stringify(
          {
            name: `artifact-consumer-${label}`,
            private: true,
            type: 'module',
            license: 'UNLICENSED',
            dependencies: { ...dependencies, ...extras },
            devDependencies: { typescript: '6.0.3', '@types/node': '24.13.4' },
            pnpm: {
              overrides: {
                ...overrides,
                ...(selectedNativeBuilds.includes('fs-ext') ? { nan: '2.28.0' } : {}),
              },
              ...(selectedNativeBuilds.includes('fs-ext')
                ? { onlyBuiltDependencies: ['fs-ext'] }
                : {}),
            },
          },
          null,
          2,
        ),
      )
      run(
        'pnpm',
        ['install', '--offline', '--ignore-scripts', '--ignore-workspace', '--store-dir', store],
        consumer,
        false,
        true,
      )
      for (const name of selectedNativeBuilds) {
        run(
          'pnpm',
          ['rebuild', name, '--pending', '--ignore-workspace', '--store-dir', store],
          consumer,
          true,
          true,
        )
        console.log(
          `INFO: selective native rebuild command completed for ${name}@2.1.1 with explicit CC/CXX/GCC_EXEC_PREFIX`,
        )
      }
      if (selectedNativeMembers.length > 0) {
        const selectedNames = new Set([...selected].map(member => member.manifest.name))
        const graph = Object.fromEntries(
          [...selected].map(member => [
            member.manifest.name,
            Object.keys({
              ...member.manifest.dependencies,
              ...member.manifest.peerDependencies,
            }).filter(name => selectedNames.has(name)),
          ]),
        )
        const probe = `import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const graph = ${JSON.stringify(graph)}
const targets = new Set(${JSON.stringify(selectedNativeMembers.map(member => member.manifest.name))})
const visited = new Set()
const loaded = new Set()
const evidence = []
function resolveManifest(name, parentRequire) {
  for (const directory of parentRequire.resolve.paths(name) ?? []) {
    const candidate = join(directory, name, 'package.json')
    if (existsSync(candidate)) return pathToFileURL(realpathSync(candidate))
  }
  assert.fail('installed dependency is not resolvable from its declaring package: ' + name)
}
function visit(name, manifestUrl) {
  if (visited.has(name)) return
  visited.add(name)
  const installedManifest = pathToFileURL(realpathSync(fileURLToPath(manifestUrl)))
  const manifest = JSON.parse(readFileSync(installedManifest, 'utf8'))
  assert.equal(manifest.name, name, 'installed product dependency resolved to the wrong package')
  const memberRequire = createRequire(installedManifest)
  if (targets.has(name)) {
    const fsExtManifest = memberRequire('fs-ext/package.json')
    assert.equal(fsExtManifest.version, '2.1.1', name + ' loaded the wrong fs-ext version')
    const fsExtEntry = realpathSync(memberRequire.resolve('fs-ext'))
    const addon = memberRequire('fs-ext')
    assert.equal(typeof addon.flock, 'function', name + ' loaded fs-ext without flock')
    const addonPath = realpathSync(join(dirname(fsExtEntry), 'build', 'Release', 'fs_ext.node'))
    const binary = Object.keys(memberRequire.cache).find(
      path => path.endsWith('/fs_ext.node') && realpathSync(path) === addonPath,
    )
    assert.ok(binary, name + ' loaded fs-ext without its resolved native addon module')
    const fsExtRequire = createRequire(fsExtEntry)
    const nanManifest = fsExtRequire('nan/package.json')
    assert.equal(nanManifest.version, '2.28.0', name + ' loaded the wrong nan version')
    loaded.add(name)
    evidence.push({
      declaredBy: name,
      addonPath,
      addonSha256: createHash('sha256').update(readFileSync(addonPath)).digest('hex'),
    })
  }
  for (const dependency of graph[name] ?? []) {
    visit(dependency, resolveManifest(dependency, memberRequire))
  }
}
const consumerRequire = createRequire(import.meta.url)
for (const root of ${JSON.stringify(roots.map(member => member.manifest.name))}) {
  visit(root, resolveManifest(root, consumerRequire))
}
assert.deepEqual([...loaded].sort(), [...targets].sort(), 'native product dependency was not loadable from its declaring package')
console.log('PASS: loaded fs-ext@2.1.1 with flock and nan@2.28.0 ' + JSON.stringify(evidence))
`
        await writeFile(join(consumer, 'native-probe.mjs'), probe)
        process.stdout.write(runArtifactNode(['native-probe.mjs'], consumer))
      }
      for (const member of roots) {
        const installed = join(consumer, 'node_modules', member.manifest.name)
        const installedManifest = await json(join(installed, 'package.json'))
        assert.ok(
          !JSON.stringify(installedManifest.dependencies).includes('workspace:'),
          'pack must rewrite workspace edges',
        )
        const installedRoot = await realpath(installed)
        assert.ok(
          inventory.every(
            source => installedRoot !== source.root && !installedRoot.startsWith(source.root + '/'),
          ),
          'consumer resolved workspace source',
        )
        if (member.manifest.license !== 'UNLICENSED') {
          assert.equal(
            await readFile(join(installed, 'LICENSE'), 'utf8'),
            await readFile(join(member.root, 'LICENSE'), 'utf8'),
          )
        }
      }
      let importIndex = 0
      const importSource = roots
        .flatMap(member =>
          Object.keys(member.manifest.exports).map(key => {
            const binding = `m${importIndex++}`
            return `import * as ${binding} from '${exportSpecifier(member.manifest.name, key)}'; void ${binding};`
          }),
        )
        .join('\n')
      await writeFile(join(consumer, 'consumer.ts'), `${importSource}\n${fixture}`)
      await writeFile(
        join(consumer, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2024',
            module: 'NodeNext',
            strict: true,
            noEmitOnError: true,
            outDir: 'build',
            types: ['node'],
          },
          include: ['*.ts'],
        }),
      )
      for (const file of fixtureFiles) {
        await writeFile(join(consumer, file), await readFile(join(tool, 'fixtures', file)))
      }
      run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumer, false, true)
      process.stdout.write(runArtifactNode(['build/consumer.js'], consumer))
      for (const file of fixtureFiles) {
        process.stdout.write(runArtifactNode([`build/${file.replace(/\.ts$/, '.js')}`], consumer))
      }
      console.log(
        `PASS: isolated ${label}, ${selected.size} declared product artifact(s), strict declarations + runtime`,
      )
    }

    for (const member of artifactMembers) {
      await consume(member.manifest.name.split('/')[1], [member], closure(member, inventory))
    }
    if (legacyFixturesAvailable(inventory)) {
      await consume(
        'composition',
        artifactMembers,
        new Set(artifactMembers),
        await readFile(join(tool, 'fixtures/composition.ts'), 'utf8'),
        ['agent.ts', 'projection.ts'],
        { '@deepseek-ai/cordis': '4.0.2', zod: '4.4.3' },
      )
    } else {
      await consume('composition', artifactMembers, new Set(artifactMembers))
    }
    passed = true
    return { members: inventory.length, upstreamRecords: records }
  } catch (error) {
    if (error.stdout) process.stderr.write(String(error.stdout))
    if (error.stderr) process.stderr.write(String(error.stderr))
    console.error(`Failed artifact evidence retained: ${scratch}`)
    throw error
  } finally {
    if (passed) await rm(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  await checkRepository(parseRoot(process.argv.slice(2)))
}
