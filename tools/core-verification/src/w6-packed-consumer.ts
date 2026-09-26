import { evidencePath } from './evidence-path.ts'
import assert from 'node:assert/strict'
import { execFile, execFileSync, type ExecFileException } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { exportedTypes, typeConsumerSource } from './packed-type-inventory.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const evidence = evidencePath(root, 'tmp/w6-core-verification/packed-consumers', 'packed-consumers')
const pendingStreamAllowed = process.argv.includes('--allow-pending-stream')
// Accepted realization public surfaces. Connector remains outside this core delivery.
const surfaces: Readonly<Record<string, readonly string[]>> = {
  'arrival-events': ['.', './schema'],
  'asset-evaluation': ['.'],
  'asset-model': ['.', './schema', './schema/v2'],
  'call-accounts': ['.', './schema'],
  'content-blocks': ['.', './schema', './schema-runtime', './schema/v2'],
  'identity-values': ['.', './schema'],
  'kernel-basis': ['.', './testing'],
  'loop-extension': ['.', './schema', './schema/v2'],
  'mcp-endpoint': ['.', './schema'],
  messages: ['.', './schema', './schema/v2'],
  'model-profile': ['.', './schema'],
  'model-response': ['.', './schema', './schema/v2'],
  'offer-expiry': ['.', './schema', './testing', './schema/v1'],
  'skill-package': ['.', './schema'],
  'slash-command': ['.', './schema'],
  storage: ['.', './conformance'],
  'tool-definition': ['.', './schema', './schema/v2'],
  'stream-assembly': ['.'],
  'unix-format': ['.'],
  'xml-format': ['.'],
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function record(value: unknown): Record<string, unknown> {
  assert.ok(object(value))
  return value
}
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
await mkdir(evidence, { recursive: true })
const directory = await mkdtemp(join(evidence, 'run-'))
const archiveDirectory = join(directory, 'archives')
const consumer = join(directory, 'consumer')
await mkdir(archiveDirectory)
await mkdir(consumer)
const executions: unknown[] = []
async function run(id: string, executable: string, arguments_: readonly string[], cwd: string) {
  const result = await new Promise<{
    error: ExecFileException | null
    stdout: string
    stderr: string
  }>(resolve => {
    execFile(
      executable,
      arguments_,
      { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 8_000_000 },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    )
  })
  const execution = {
    id,
    executable,
    arguments: arguments_,
    cwd,
    code: result.error?.code ?? 0,
    signal: result.error?.signal ?? null,
    killed: result.error?.killed ?? false,
  }
  executions.push(execution)
  await Promise.all([
    writeFile(join(directory, id + '.stdout.log'), result.stdout),
    writeFile(join(directory, id + '.stderr.log'), result.stderr),
    writeFile(join(directory, 'executions.json'), JSON.stringify(executions, null, 2) + '\n'),
  ])
  assert.equal(execution.killed, false, id + ': timeout is not a result')
  assert.equal(execution.signal, null, id + ': signal is not a result')
  return { ...execution, stdout: result.stdout, stderr: result.stderr }
}

const members: {
  name: string
  specifier: string
  subpaths: readonly string[]
  tarball: string
  hash: string
}[] = []
const dependencies: Record<string, string> = {
  typescript: '6.0.3',
  '@types/node': '24.13.6',
  vitest: '4.1.11',
  ajv: '8.20.0',
}
for (const [name, subpaths] of Object.entries(surfaces)) {
  const group = name.endsWith('-format') ? 'util' : 'core'
  const member = join(root, 'packages', group, name)
  let manifest: Record<string, unknown>
  try {
    manifest = record(JSON.parse(await readFile(join(member, 'package.json'), 'utf8')))
  } catch (error) {
    if (
      name === 'stream-assembly' &&
      pendingStreamAllowed &&
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      continue
    throw error
  }
  assert.equal(manifest.name, '@omne-harness-lite/' + name)
  assert.deepEqual(
    Object.keys(record(manifest.exports)).sort(),
    [...subpaths].sort(),
    name + ': approved exports',
  )
  const before = new Set(await readdir(archiveDirectory))
  const packed = await run(
    'pack-' + name,
    'pnpm',
    ['pack', '--pack-destination', archiveDirectory],
    member,
  )
  assert.equal(packed.code, 0, packed.stdout + packed.stderr)
  const archives = (await readdir(archiveDirectory)).filter(
    file => !before.has(file) && file.endsWith('.tgz'),
  )
  assert.equal(archives.length, 1)
  const archive = archives[0]
  assert.ok(archive)
  const tarball = join(archiveDirectory, archive)
  const specifier = '@omne-harness-lite/' + name
  members.push({ name, specifier, subpaths, tarball, hash: sha256(await readFile(tarball)) })
  dependencies[specifier] = 'file:' + tarball
}
assert.equal(members.length, pendingStreamAllowed ? 19 : 20)
await writeFile(
  join(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'independent-packed-core-consumer',
      private: true,
      type: 'module',
      dependencies,
      pnpm: {
        overrides: Object.fromEntries(
          members.map(member => [member.specifier, 'file:' + member.tarball]),
        ),
      },
    },
    null,
    2,
  ) + '\n',
)
const install = await run(
  'install',
  'pnpm',
  ['install', '--ignore-workspace', '--ignore-scripts', '--offline'],
  consumer,
)
assert.equal(install.code, 0, install.stdout + install.stderr)

const options: ts.CompilerOptions = {
  strict: true,
  skipLibCheck: false,
  noEmit: true,
  noUnusedLocals: true,
  target: ts.ScriptTarget.ES2024,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  resolveJsonModule: true,
  types: ['node'],
  typeRoots: [join(consumer, 'node_modules/@types')],
}
const importer = join(consumer, 'types.ts')
const inventory: { specifier: string; file: string; names: readonly string[]; sha256: string }[] =
  []
for (const member of members) {
  for (const subpath of member.subpaths.filter(
    path => !path.startsWith('./schema') || path === './schema-runtime',
  )) {
    const specifier = member.specifier + (subpath === '.' ? '' : subpath.slice(1))
    const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys).resolvedModule
    assert.ok(resolved, specifier + ': independent declaration resolves')
    const file = await realpath(resolved.resolvedFileName)
    assert.ok(
      file.startsWith(consumer + '/node_modules/'),
      'packed declaration must be inside consumer',
    )
    assert.ok(file.endsWith('.d.ts'))
    const program = ts.createProgram([file], options)
    inventory.push({
      specifier,
      file,
      names: exportedTypes(program, file),
      sha256: sha256(await readFile(file)),
    })
  }
}
await writeFile(importer, typeConsumerSource(inventory) + '\n')
await writeFile(
  join(consumer, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        noUnusedLocals: true,
        target: 'ES2024',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        resolveJsonModule: true,
        types: ['node'],
      },
      files: ['types.ts'],
    },
    null,
    2,
  ) + '\n',
)
const compiled = await run('types', 'pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumer)
assert.equal(compiled.code, 0, compiled.stdout + compiled.stderr)

const forbidden = members.flatMap(member => [
  member.specifier + '/src/index.ts',
  member.specifier + '/dist/index.js',
  member.specifier + '/schema/v999',
  member.specifier + '/schema/v3',
  member.specifier + '/neighbor',
  ...(member.name === 'offer-expiry' ? [] : [member.specifier + '/schema/v1']),
  ...(member.subpaths.includes('./schema/v2') ? [] : [member.specifier + '/schema/v2']),
  ...(member.subpaths.includes('./schema') ? [] : [member.specifier + '/schema']),
])
await writeFile(
  join(consumer, 'negative.ts'),
  forbidden
    .map(
      (specifier, index) =>
        `import * as P${index} from ${JSON.stringify(specifier)}; export { P${index} };`,
    )
    .join('\n') + '\n',
)
const negativeOptions = { ...options, noUnusedLocals: false }
const negativeProgram = ts.createProgram([join(consumer, 'negative.ts')], negativeOptions)
const diagnostics = ts.getPreEmitDiagnostics(negativeProgram)
await writeFile(
  join(directory, 'negative-types-all-diagnostics.log'),
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => consumer,
    getNewLine: () => '\n',
  }),
)
const missing = diagnostics.filter(diagnostic => diagnostic.code === 2307)
assert.equal(missing.length, forbidden.length, 'every forbidden subpath must have its own TS2307')
assert.equal(
  diagnostics.length,
  forbidden.length,
  'startup/type failures cannot replace subpath rejection',
)
await writeFile(
  join(directory, 'negative-types.log'),
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => consumer,
    getNewLine: () => '\n',
  }),
)

const frozen = record(
  record(
    JSON.parse(await readFile(join(root, '.meta_harness/design/registry/frozen.json'), 'utf8')),
  ).files,
)
const runtimeInput = { members, forbidden, frozen, designRoot: join(root, '.meta_harness/design') }
await writeFile(join(consumer, 'input.json'), JSON.stringify(runtimeInput, null, 2) + '\n')
await writeFile(
  join(consumer, 'consume.mjs'),
  await readFile(new URL('../fixtures/packed-consumer.mjs', import.meta.url)),
)
const runtime = await run('runtime', process.execPath, ['consume.mjs'], consumer)
assert.equal(runtime.code, 0, runtime.stdout + runtime.stderr)
const expectedRuntimeCases = [
  'w6.pack.actual-runtime-exports',
  'w6.schema.current-and-retained-coordinates',
  'w6.schema.exact-frozen-bytes',
  'w6.schema.fixed-resource-closure',
  'w6.schema.current3-raw-name-versus-retained2-arrival',
  'w6.pack.private-subpath-rejections',
]
function runtimeCases(stdout: string) {
  const report = record(JSON.parse(stdout))
  assert.equal(report.specEpoch, 3)
  assert.ok(Array.isArray(report.cases))
  const cases = report.cases.map((item: unknown) => record(item))
  assert.deepEqual(
    cases.map(item => item.id),
    expectedRuntimeCases,
  )
  return cases
}
assert.ok(runtimeCases(runtime.stdout).every(item => item.status === 'passed'))
const wrongEpoch = await run(
  'runtime-wrong-content-epoch',
  process.execPath,
  ['consume.mjs', '--negative-control=content-epoch'],
  consumer,
)
assert.equal(wrongEpoch.code, 1)
const controlledCases = runtimeCases(wrongEpoch.stdout)
const failures = controlledCases.filter(item => item.status === 'failed')
assert.deepEqual(
  failures.map(item => item.id),
  ['w6.schema.current-and-retained-coordinates'],
)
assert.equal(
  controlledCases.filter(item => item.status === 'passed').length,
  expectedRuntimeCases.length - 1,
)
assert.equal(record(failures[0]?.error).name, 'AssertionError')
assert.ok(
  String(record(failures[0]?.error).message).includes('@omne-harness-lite/content-blocks/schema'),
)
assert.ok(String(record(failures[0]?.error).message).includes('/v3/'))
assert.ok(String(record(failures[0]?.error).message).includes('/v2/'))
await writeFile(
  join(consumer, 'assets.mjs'),
  await readFile(new URL('./w6-asset-consumer.js', import.meta.url)),
)
const assets = await run(
  'packed-assets',
  process.execPath,
  ['assets.mjs', '--packed-consumer'],
  consumer,
)
assert.equal(assets.code, 0, assets.stdout + assets.stderr)
const assetReport = record(JSON.parse(assets.stdout))
assert.equal(assetReport.specEpoch, 3)
assert.equal(assetReport.packedConsumer, true)
assert.ok(Array.isArray(assetReport.cases))
const packedAssetCases = assetReport.cases.map((item: unknown) => record(item))
const expectedAssetCases = [
  'w6.asset.five-real-ports',
  'w6.asset.body-rejections',
  'w6.asset.layer-lock-and-setting-discontinuity',
  'w6.asset.workspace-normalized-skill-reading',
  'w6.asset.mcp-schema-execution-boundary',
  'w6.asset.reserved-and-duplicate-real-body',
  'w6.asset.nonconnector-record-domain',
  'w6.asset.scope-identity-and-billing',
  'w6.skill.slash-expansion-to-messages',
  'w6.messages.nested-unique-boundary',
  'w6.messages.nested-readability-and-compaction',
  'w6.tool.result-to-content',
]
assert.deepEqual(
  packedAssetCases.map(item => item.id),
  expectedAssetCases,
)
assert.ok(packedAssetCases.every(item => item.status === 'passed'))
await writeFile(
  join(consumer, 'conformance.spec.ts'),
  `import { it, expect } from 'vitest'; import { describeStorageConformance, describeAtomicStorageConformance } from '@omne-harness-lite/storage/conformance'; it('w6.pack.conformance-entry-in-actual-vitest-host', () => { expect(typeof describeStorageConformance).toBe('function'); expect(typeof describeAtomicStorageConformance).toBe('function'); });\n`,
)
const conformance = await run(
  'conformance-entry',
  'pnpm',
  ['exec', 'vitest', 'run', 'conformance.spec.ts'],
  consumer,
)
assert.equal(conformance.code, 0, conformance.stdout + conformance.stderr)
const report = {
  specEpoch: 3,
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  directory,
  nodeVersion: process.version,
  consumerArtifact: {
    file: fileURLToPath(import.meta.url),
    sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  },
  frozenSha256: sha256(await readFile(join(root, '.meta_harness/design/registry/frozen.json'))),
  scope: pendingStreamAllowed
    ? '17 core + 2 util; stream-assembly pending explicit release'
    : '18 core + 2 util',
  members,
  inventory,
  types: inventory.reduce((sum, item) => sum + item.names.length, 0),
  options,
  negativeTypeDiagnostics: missing.length,
  runtime: JSON.parse(runtime.stdout),
  wrongEpochRuntime: JSON.parse(wrongEpoch.stdout),
  packedAssets: assetReport,
  executions,
}
await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
process.stdout.write(
  JSON.stringify(
    {
      directory,
      scope: report.scope,
      packages: members.length,
      types: report.types,
      status: 'passed',
    },
    null,
    2,
  ) + '\n',
)
