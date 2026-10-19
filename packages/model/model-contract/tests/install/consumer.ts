// Packs a workspace member and its workspace closure, installs only those tarballs and their
// third-party dependencies into an isolated consumer directory, then proves from inside that
// directory that every entry resolves, imports and type-checks without leaving it.
import { copyFileSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  declaredClosure,
  findForbidden,
  judgeInstalled,
  readManifest,
  workspaceMembers,
  workspaceResidue,
  type DeclaredClosure,
  type Manifest,
  type Policy,
  type Violation,
} from './closure.ts'
import { compileFixture, copyFixture, runFixture, type FixtureOutcome } from './fixture-run.ts'
import {
  directDependencies,
  fixtureClosure,
  outsideClosure,
  readFixture,
  withFixtureForbidden,
  type FixtureSpec,
} from './fixture-spec.ts'
import {
  assertWorkDirectory,
  judgeResolutions,
  judgeTypeFiles,
  listedFiles,
  lockResidue,
  MARKER,
  missingCheckIds,
  requiredCheckIds,
  resolutionLog,
  sourceFiles,
  type Check,
} from './judgment.ts'
import { compilerCommand, diagnostics, exec, libraryRoot, tail } from './process.ts'

export type { Check }

export type Report = {
  member: string
  profile: string
  workspaceRoot: string
  consumerDirectory: string
  closure: { workspace: string[]; external: string[] }
  /** Which attempt installed the dependencies. `network` only when the caller allowed it. */
  install: { mode: 'offline' | 'network'; allowNetwork: boolean }
  installed: string[]
  forbidden: Violation[]
  tarballs: { name: string; file: string; files: string[] }[]
  probe: { specifier: string; resolved: string; exports: string[] }[]
  typeCheck: { files: number }
  /** Present only when a scenario script was given. */
  scenario?: { script: string; output: string }
  /** Present only when a fixture was given and its process reported. */
  fixture?: { role: string; directory: string; paths: FixtureOutcome['paths'] }
  checks: Check[]
  ok: boolean
}

export type Options = Readonly<{
  memberDirectory: string
  workspaceRoot: string
  policy: Policy
  consumerDirectory: string
  /** Lets the install step fall back from `--offline` to a run that may reach the registry. */
  allowNetwork?: boolean
  /** A pnpm store other than the default one. */
  storeDirectory?: string
  /** A script that runs inside the consumer directory after the probe; a non-zero exit fails the run. */
  scenarioScript?: string
  /**
   * A role fixture directory. The consumer then installs only what the fixture declares, and the
   * run compiles and runs the fixture where the member's own entries would have been imported.
   */
  fixtureDirectory?: string
}>

type Tree = Readonly<{
  version: string
  dependencies?: Readonly<Record<string, Tree>>
}>

type CheckFn = (id: string, ok: boolean, detail: string) => boolean

const here = dirname(fileURLToPath(import.meta.url))

function exists(path: string): boolean {
  try {
    realpathSync(path)
    return true
  } catch {
    return false
  }
}

/** Every package that `pnpm ls --prod` finds below a directory, with its resolved versions. */
function listed(directory: string, standalone = false): Map<string, Set<string>> {
  // The consumer lives below the repository, so pnpm would otherwise adopt the workspace root.
  const flags = standalone ? ['--ignore-workspace'] : []
  const result = exec(
    'pnpm',
    ['ls', ...flags, '--prod', '--depth', 'Infinity', '--json'],
    directory,
  )
  if (result.status !== 0) throw new Error(`pnpm ls failed in ${directory}: ${tail(result.stderr)}`)
  const found = new Map<string, Set<string>>()
  const visit = (dependencies: Readonly<Record<string, Tree>> | undefined): void => {
    for (const [name, tree] of Object.entries(dependencies ?? {})) {
      const versions = found.get(name) ?? new Set<string>()
      versions.add(tree.version)
      found.set(name, versions)
      visit(tree.dependencies)
    }
  }
  visit((JSON.parse(result.stdout) as Tree[])[0]?.dependencies)
  return found
}

export type Runner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => { status: number; stdout: string; stderr: string }

export type InstallResult = Readonly<{
  ok: boolean
  mode: 'offline' | 'network'
  detail: string
}>

/**
 * Installs the tarballs and the pinned third-party versions. The pnpm store already holds those
 * exact tarballs, so the install runs with `--offline`. When that fails the run fails too, unless
 * the caller allowed the network: then a second attempt (`--prefer-offline`) may reach the
 * registry, and the result says `network`.
 */
export function installDependencies(
  project: string,
  options: Readonly<{ allowNetwork: boolean; storeDirectory?: string }>,
  run: Runner = exec,
): InstallResult {
  const flags = [
    'install',
    '--ignore-workspace',
    '--ignore-scripts',
    ...(options.storeDirectory === undefined ? [] : ['--store-dir', options.storeDirectory]),
  ]
  const offline = run('pnpm', [...flags, '--offline'], project)
  if (offline.status === 0) return { ok: true, mode: 'offline', detail: 'installed with --offline' }
  const reason = tail(offline.stdout + offline.stderr)
  if (!options.allowNetwork)
    return {
      ok: false,
      mode: 'offline',
      detail: `--offline failed and the network is not allowed (--allow-network): ${reason}`,
    }
  const retry = run('pnpm', [...flags, '--prefer-offline'], project)
  const detail = `--offline failed (${reason}); `
  return retry.status === 0
    ? { ok: true, mode: 'network', detail: `${detail}installed with --prefer-offline` }
    : { ok: false, mode: 'network', detail: `${detail}${tail(retry.stdout + retry.stderr)}` }
}

function exportSpecifiers(manifest: Manifest): string[] {
  return Object.entries(manifest.exports ?? {})
    .filter(([, target]) => typeof target === 'object' && target !== null && 'import' in target)
    .map(([subpath]) => (subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`))
}

/** What a run judges against the policy: the member's whole closure, or only what a fixture declares. */
type Plan = Readonly<{
  fixture: FixtureSpec | null
  policy: Policy
  declared: readonly Readonly<{ name: string; via: readonly string[] }>[]
}>

/** What every step of a run shares: where it reports and what it was asked to do. */
type Run = Readonly<{ options: Options; manifest: Manifest; report: Report; check: CheckFn }>

/** The plan of the run, or null when the fixture is unreadable or reaches outside the closure. */
function planOf(
  run: Run,
  closure: DeclaredClosure,
  members: ReadonlyMap<string, string>,
): Plan | null {
  const { options, manifest, check } = run
  const whole = [...closure.workspace, ...closure.external]
  if (options.fixtureDirectory === undefined)
    return { fixture: null, policy: options.policy, declared: whole }
  const read = readFixture(options.fixtureDirectory)
  if (read.kind === 'unreadable') {
    check('fixture-dependencies', false, read.detail)
    return null
  }
  const outside = outsideClosure(read.spec, new Set(whole.map(item => item.name)))
  const detail =
    outside.length === 0
      ? `${read.spec.dependencies.length} declared`
      : `outside the closure of ${manifest.name}: ${outside.join(', ')}`
  if (!check('fixture-dependencies', outside.length === 0, detail)) return null
  const reached = fixtureClosure(read.spec, members)
  return {
    fixture: read.spec,
    policy: withFixtureForbidden(options.policy, read.spec),
    declared: [...reached.workspace, ...reached.external],
  }
}

type Declared = Readonly<{ closure: DeclaredClosure; plan: Plan }>

/** Reads the closure, judges what the run declares against the policy, and checks the builds. */
function declare(run: Run): Declared | null {
  const { options, report, check } = run
  if (!check('node-path-unset', (process.env['NODE_PATH'] ?? '') === '', 'NODE_PATH is not set'))
    return null
  const members = workspaceMembers(options.workspaceRoot)
  const closure = declaredClosure(options.memberDirectory, members)
  report.closure = {
    workspace: closure.workspace.map(item => item.name),
    external: closure.external.map(item => item.name),
  }
  const plan = planOf(run, closure, members)
  if (plan === null) return null
  report.forbidden = findForbidden(plan.declared, plan.policy)
  const named = report.forbidden.map(item => `${item.name} (${item.category})`).join(', ')
  if (!check('forbidden-declared', report.forbidden.length === 0, named || 'none')) return null

  const unbuilt = closure.workspace.filter(item => !exists(join(item.directory, 'dist')))
  const unbuiltNames = unbuilt.map(item => item.name).join(', ')
  const built = check(
    'members-built',
    unbuilt.length === 0,
    unbuiltNames || 'every closure member has dist/',
  )
  return built ? { closure, plan } : null
}

type Packed = Readonly<{
  project: string
  tarballs: ReadonlyMap<string, string>
  pins: ReadonlyMap<string, ReadonlySet<string>>
}>

/** Packs one closure member and judges the tarball; false when it could not be packed. */
function packMember(
  run: Run,
  member: DeclaredClosure['workspace'][number],
  packs: string,
  tarballs: Map<string, string>,
): boolean {
  const { report, check } = run
  const packed = exec('pnpm', ['pack', '--json', '--pack-destination', packs], member.directory)
  if (!check(`pack:${member.name}`, packed.status === 0, tail(packed.stderr) || 'packed'))
    return false
  const info = JSON.parse(packed.stdout) as { filename: string; files: { path: string }[] }
  tarballs.set(member.name, info.filename)
  const files = info.files.map(file => file.path)
  report.tarballs.push({ name: member.name, file: info.filename, files })
  const source = sourceFiles(files)
  check(`tarball-no-source:${member.name}`, source.length === 0, source.join(', ') || 'no source')
  const text = exec('tar', ['-xzOf', info.filename, 'package/package.json'], packs).stdout
  const residue = workspaceResidue(JSON.parse(text) as Manifest)
  check(
    `tarball-no-workspace-protocol:${member.name}`,
    residue.length === 0,
    residue.join(', ') || 'none',
  )
  return true
}

/** Prepares the consumer directory and packs every closure member into it. */
function pack(run: Run, closure: DeclaredClosure): Packed | null {
  const { options, report } = run
  // The directory is deleted below, so it is vetted first (the caller sees a usage error).
  assertWorkDirectory(options.consumerDirectory, options.memberDirectory, options.workspaceRoot)
  const pins = listed(options.memberDirectory)
  rmSync(options.consumerDirectory, { recursive: true, force: true })
  const packs = join(options.consumerDirectory, 'packs')
  const project = join(options.consumerDirectory, 'project')
  mkdirSync(packs, { recursive: true })
  mkdirSync(project, { recursive: true })
  writeFileSync(join(options.consumerDirectory, MARKER), '')
  const tarballs = new Map<string, string>()
  for (const member of closure.workspace) if (!packMember(run, member, packs, tarballs)) return null
  return report.checks.some(item => !item.ok) ? null : { project, tarballs, pins }
}

/** Pins every third-party package of the workspace that has one version, and every member to its tarball. */
function overridesOf(run: Run, closure: DeclaredClosure, packed: Packed): Record<string, string> {
  const overrides: Record<string, string> = {}
  for (const member of closure.workspace)
    if (member.name !== run.manifest.name)
      overrides[member.name] = `file:${packed.tarballs.get(member.name)}`
  for (const [name, versions] of packed.pins) {
    const version = [...versions][0] as string
    if (!packed.tarballs.has(name) && versions.size === 1 && !version.startsWith('link:'))
      overrides[name] = version
  }
  return overrides
}

/**
 * The direct dependencies of the consumer project, or null when a fixture needs a package that
 * the workspace does not pin to one version. A scenario imports closure members other than the
 * target, and pnpm only links direct dependencies. Without a scenario the consumer stays as thin
 * as the target alone.
 */
function directOf(run: Run, declared: Declared, packed: Packed): Record<string, string> | null {
  const { options, manifest, check } = run
  const { plan, closure } = declared
  if (plan.fixture !== null) {
    const chosen = directDependencies(plan.fixture, packed.tarballs, packed.pins)
    const unpinned = chosen.kind === 'unpinned' ? chosen.names.join(', ') : ''
    check(
      'fixture-pins',
      chosen.kind === 'resolved',
      unpinned || 'every declared package is pinned',
    )
    return chosen.kind === 'resolved' ? { ...chosen.dependencies } : null
  }
  const names =
    options.scenarioScript === undefined
      ? [manifest.name]
      : closure.workspace.map(item => item.name)
  return Object.fromEntries(names.map(name => [name, `file:${packed.tarballs.get(name)}`]))
}

/** Installs the consumer project and judges the lockfile and what was installed. */
function install(run: Run, declared: Declared, packed: Packed): boolean {
  const { options, manifest, report, check } = run
  const { closure, plan } = declared
  const dependencies = directOf(run, declared, packed)
  if (dependencies === null) return false
  writeFileSync(
    join(packed.project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'install-closure-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies,
        pnpm: { overrides: overridesOf(run, closure, packed) },
      },
      null,
      2,
    )}\n`,
  )
  const result = installDependencies(packed.project, {
    allowNetwork: report.install.allowNetwork,
    ...(options.storeDirectory === undefined ? {} : { storeDirectory: options.storeDirectory }),
  })
  report.install.mode = result.mode
  if (!check('install', result.ok, result.detail)) return false
  const residue = lockResidue(readFileSync(join(packed.project, 'pnpm-lock.yaml'), 'utf8'))
  check(
    'consumer-lock-no-workspace',
    residue.length === 0,
    residue.join(' | ') || 'consumer lockfile has no workspace or link specifier',
  )

  report.installed = [...listed(packed.project, true).keys()].sort()
  const wanted = plan.fixture?.dependencies ?? [
    manifest.name,
    ...closure.external.map(item => item.name),
  ]
  const unlisted = wanted.filter(name => !report.installed.includes(name))
  check(
    'installed-listed',
    unlisted.length === 0,
    unlisted.join(', ') || `${report.installed.length} packages`,
  )
  report.forbidden.push(...judgeInstalled(report.installed, plan, manifest.name, check))
  return true
}

/** Imports and type-checks the entries of the member, and runs the scenario when one was given. */
function exerciseMember(run: Run, project: string): void {
  const { options, manifest, report, check } = run
  const specifiers = exportSpecifiers(manifest)
  const probed = probeEntries(project, specifiers)
  report.probe = probed.probe
  for (const item of probed.checks) check(item.id, item.ok, item.detail)
  if (options.scenarioScript !== undefined && probed.checks.every(item => item.ok)) {
    const ran = runScenario(project, options.scenarioScript)
    report.scenario = ran.scenario
    check(ran.check.id, ran.check.ok, ran.check.detail)
  }
  const typed = typeCheck(project, options.memberDirectory, specifiers)
  report.typeCheck = { files: typed.files }
  for (const item of typed.checks) check(item.id, item.ok, item.detail)
}

/** Compiles the fixture against what was installed and runs its paths in the consumer directory. */
function exerciseFixture(run: Run, spec: FixtureSpec, project: string): void {
  const { report, check } = run
  copyFixture({ project, directory: spec.directory })
  const compiled = compileFixture(project)
  report.typeCheck = { files: compiled.files }
  for (const item of compiled.checks) check(item.id, item.ok, item.detail)
  if (!compiled.checks.every(item => item.ok)) return
  const ran = runFixture({ project, expectedRole: spec.role })
  for (const item of ran.checks) check(item.id, item.ok, item.detail)
  if (ran.outcome !== null)
    report.fixture = { role: spec.role, directory: spec.directory, paths: ran.outcome.paths }
}

function startRun(options: Options): Run {
  const manifest = readManifest(options.memberDirectory)
  const report: Report = {
    member: manifest.name,
    profile: options.policy.profile,
    workspaceRoot: options.workspaceRoot,
    consumerDirectory: options.consumerDirectory,
    closure: { workspace: [], external: [] },
    install: { mode: 'offline', allowNetwork: options.allowNetwork === true },
    installed: [],
    forbidden: [],
    tarballs: [],
    probe: [],
    typeCheck: { files: 0 },
    checks: [],
    ok: false,
  }
  const check: CheckFn = (id, ok, detail) => {
    report.checks.push({ id, ok, detail })
    return ok
  }
  return { options, manifest, report, check }
}

function finish({ options, report, check }: Run): Report {
  // Every early return follows a failed check. A run that passes all of its checks must also
  // have reported all of them, or a judgment that is no longer wired in would go unnoticed.
  if (report.checks.every(item => item.ok)) {
    const missing = missingCheckIds(
      report.checks,
      requiredCheckIds(report.closure.workspace, {
        scenario: options.scenarioScript !== undefined,
        fixture: options.fixtureDirectory !== undefined,
      }),
    )
    if (missing.length > 0) check('required-checks', false, `not reported: ${missing.join(', ')}`)
  }
  report.ok = report.checks.length > 0 && report.checks.every(item => item.ok)
  return report
}

export function runConsumerInstall(options: Options): Report {
  const run = startRun(options)
  const declared = declare(run)
  if (declared === null) return finish(run)
  const packed = pack(run, declared.closure)
  if (packed === null || !install(run, declared, packed)) return finish(run)
  if (declared.plan.fixture === null) exerciseMember(run, packed.project)
  else exerciseFixture(run, declared.plan.fixture, packed.project)
  return finish(run)
}

/**
 * Imports every entry in a child process whose resolve hook records each resolution, ESM and
 * CommonJS, then judges the records against the consumer directory.
 */
export function probeEntries(
  project: string,
  specifiers: readonly string[],
): { probe: Report['probe']; checks: Check[] } {
  for (const file of ['probe.mjs', 'register.mjs'])
    copyFileSync(join(here, file), join(project, file))
  const log = join(project, 'resolutions.jsonl')
  writeFileSync(log, '')
  const run = exec(
    process.execPath,
    ['--import', './register.mjs', './probe.mjs', JSON.stringify(specifiers)],
    project,
    { PROBE_RESOLUTIONS: log },
  )
  if (run.status !== 0)
    return { probe: [], checks: [{ id: 'probe-run', ok: false, detail: tail(run.stderr) }] }
  const probe = JSON.parse(run.stdout) as Report['probe']
  const urls = resolutionLog(log)
  const { outside, source } = judgeResolutions(
    [...urls, ...probe.map(item => item.resolved)],
    project,
  )
  return {
    probe,
    checks: [
      { id: 'probe-run', ok: true, detail: 'every entry imported' },
      {
        id: 'resolution-inside-consumer',
        ok: outside.length === 0,
        detail: outside.join(', ') || `${urls.length} resolutions`,
      },
      {
        id: 'resolution-no-source',
        ok: source.length === 0,
        detail: source.join(', ') || 'no source path resolved',
      },
    ],
  }
}

/**
 * Copies a scenario script into the consumer directory and runs it there, with the same clean
 * environment as the probe. The script sees only what was installed, so it exercises the member
 * the way an outside caller would.
 */
export function runScenario(
  project: string,
  script: string,
): { check: Check; scenario: NonNullable<Report['scenario']> } {
  const file = `scenario-${basename(script)}`
  copyFileSync(script, join(project, file))
  const run = exec(process.execPath, [file], project)
  const output = tail(`${run.stdout}\n${run.stderr}`)
  return {
    scenario: { script, output },
    check: {
      id: 'scenario-run',
      ok: run.status === 0,
      detail: run.status === 0 ? output || 'scenario exited 0' : `exit ${run.status}: ${output}`,
    },
  }
}

/** Compiles one file that imports the type of every entry, then judges which files tsc loaded. */
export function typeCheck(
  project: string,
  memberDirectory: string,
  specifiers: readonly string[],
): { files: number; checks: Check[] } {
  const imports = specifiers.map(
    (specifier, index) => `import type * as entry${index} from '${specifier}'`,
  )
  const names = specifiers.map((_, index) => `entry${index}`).join(', ')
  writeFileSync(
    join(project, 'probe-types.ts'),
    `${imports.join('\n')}\nexport type { ${names} }\n`,
  )
  writeFileSync(
    join(project, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ESNext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
        typeRoots: [],
      },
      files: ['probe-types.ts'],
    })}\n`,
  )
  const run = exec(
    process.execPath,
    [compilerCommand(), '-p', 'tsconfig.json', '--listFiles'],
    project,
  )
  if (run.status !== 0)
    return { files: 0, checks: [{ id: 'type-check', ok: false, detail: diagnostics(run.stdout) }] }
  const files = listedFiles(run.stdout)
  const verdict = judgeTypeFiles(files, project, libraryRoot())
  return {
    files: files.length,
    checks: [
      { id: 'type-check', ok: true, detail: 'declarations compile' },
      { id: 'type-resolution-inside-consumer', ok: verdict.ok, detail: verdict.detail },
    ],
  }
}
