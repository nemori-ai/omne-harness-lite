// pnpm run verify:release [--no-build] [--distribution] [--allow-no-sandbox]
// Checks the packaged release app from outside, as shipped: the only place that starts one.
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { COOKIE_KEY_WRITER_FAILED_FILE, MAIN_WINDOW_READY_MESSAGE } from '../src/startup-signals.ts'
import { asarFile, asarHeaderHash, readAsar, sha256 } from './asar.ts'
import { BUNDLES, bundleDir } from './build-profile.ts'
import { desktopDir } from './bundle-build.ts'
import { bundleProblems } from './bundle-checks.ts'
import { checkPackagedFuses, describeFuses } from './fuses.ts'
import {
  checkLaunchInputs,
  credentialStoreSwitches,
  launchSpec,
  linuxSandboxBlocker,
  windowStateSwitches,
} from './launch.ts'
import { packagedBinary } from './packaged-path.ts'
import { powershellOutput } from './powershell.ts'
import {
  askOverPipe,
  cleanUpEverything,
  createdBy,
  devtoolsBrowser,
  dropTempDir,
  finish,
  freePort,
  isWindows,
  kill,
  killRunningTree,
  launch,
  listening,
  releaseEnv,
  type Running,
  sleep,
  tempDir,
} from './release-launch.ts'
import { describeProcesses, type ProcessLocation } from './release-processes.ts'
import {
  judgeSigning,
  parseAuthenticode,
  requiresSigning,
  type SignatureFacts,
} from './release-signing.ts'
import {
  judgeStartup,
  type LaunchDiagnostics,
  observeCookieKey,
  type StartupObservation,
} from './release-startup.ts'
import {
  ALLOW_NO_SANDBOX_FLAG,
  checkAsarContents,
  checkManifest,
  type CheckResult,
  type CheckStatus,
  describeExit,
  DISTRIBUTION_FLAG,
  judgeRefusal,
  type LaunchGate,
  launchGate,
  mainLogLines,
  type Manifest,
  summarize,
} from './release-verdicts.ts'
import { SCREEN_LOCKED_REASON, screenLock } from './session-state.ts'
import { profileProblems } from './verify-build.ts'

const READY_TIMEOUT_MS = 30_000
const REFUSAL_TIMEOUT_MS = 15_000
const QUIT_TIMEOUT_MS = 15_000
type RemoteSwitch = 'remote-debugging-port' | 'remote-debugging-pipe'

const say = (line: string) => process.stdout.write(`verify:release: ${line}\n`)
const describe = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure)
const elapsed = (from: number) =>
  /* wall-clock: operation-timing -- how long a launch took, compared only with its own start */ Date.now() -
  from

type Package = Readonly<{
  executable: string
  location: ProcessLocation
  resources: string
  bundle?: string
  manifest: Manifest
}>

function locatePackage(): Package {
  const read = (file: string) => JSON.parse(readFileSync(join(desktopDir, file), 'utf8'))
  const product = read('product.json')
  const manifest = {
    name: product.name,
    productName: product.productName,
    version: read('package.json').version,
  }
  const executable = packagedBinary('release')
  if (process.platform !== 'darwin') {
    const directory = dirname(executable)
    return {
      executable,
      location: { command: executable, processDir: directory },
      resources: join(directory, 'resources'),
      manifest,
    }
  }
  const bundle = executable.slice(0, executable.lastIndexOf('.app/') + 4)
  return {
    executable,
    location: { command: executable, processDir: bundle },
    resources: join(bundle, 'Contents', 'Resources'),
    bundle,
    manifest,
  }
}

/** Where the installed app keeps its user data, which no verification launch may touch. */
function installedUserData(productName: string): string {
  if (process.platform === 'darwin')
    return join(homedir(), 'Library', 'Application Support', productName)
  if (isWindows)
    return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), productName)
  return join(process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config'), productName)
}

function fingerprint(directory: string): string {
  if (!existsSync(directory)) return 'absent'
  const lines: string[] = []
  const walk = (path: string) => {
    const stat = lstatSync(path)
    lines.push(
      `${relative(directory, path) || '.'} ${stat.isDirectory() ? 'dir' : stat.size} ${stat.mtimeMs}`,
    )
    if (stat.isDirectory()) for (const name of readdirSync(path).toSorted()) walk(join(path, name))
  }
  walk(directory)
  return lines.join('\n')
}

/** Every file of dist/release the package should carry, with its hash. */
function builtFiles(): Map<string, string> {
  const root = resolve(desktopDir, bundleDir('release'))
  const files = new Map<string, string>()
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (!/\.(map|modules\.json)$/.test(entry.name))
        files.set(relative(root, path).split('\\').join('/'), sha256(readFileSync(path)))
    }
  }
  walk(root)
  return files
}

const releaseSwitches = (userDataDir: string, gate: LaunchGate): string[] => [
  `--user-data-dir=${userDataDir}`,
  ...credentialStoreSwitches(process.platform),
  ...windowStateSwitches(process.platform),
  ...gate.switches,
]

function report(id: number, name: string, status: CheckStatus, reason: string): CheckResult {
  say(`${id} ${name}: ${status}: ${reason}`)
  return { id, name, status, reason }
}

async function checkFuses(pkg: Package): Promise<CheckResult> {
  try {
    const readings = await checkPackagedFuses(pkg.executable, 'release')
    return report(1, 'fuses', 'pass', `the release column: ${describeFuses(readings)}`)
  } catch (failure) {
    return report(1, 'fuses', 'fail', describe(failure))
  }
}

function plistIntegrity(pkg: Package, headerHash: string): { problem?: string; finding?: string } {
  if (pkg.bundle === undefined) return {}
  const plist = join(pkg.bundle, 'Contents', 'Info.plist')
  const recorded = spawnSync(
    'plutil',
    ['-extract', 'ElectronAsarIntegrity.Resources/app\\.asar.hash', 'raw', '-o', '-', plist],
    {
      encoding: 'utf8',
    },
  )
  if (recorded.status !== 0)
    return { problem: `Info.plist records no asar integrity: ${recorded.stderr.trim()}` }
  if (recorded.stdout.trim() !== headerHash)
    return { problem: "Info.plist's asar integrity is not app.asar's header" }
  return { finding: "Info.plist's asar integrity is app.asar's header" }
}

function checkContents(pkg: Package): CheckResult {
  const archive = readFileSync(join(pkg.resources, 'app.asar'))
  const asar = readAsar(archive)
  const file = (path: string) => asarFile(archive, asar, path)
  const problems: string[] = []
  const findings: string[] = []
  const take = ({
    problems: more,
    findings: found,
  }: {
    problems: string[]
    findings: string[]
  }) => {
    problems.push(...more)
    findings.push(...found)
  }
  take(checkAsarContents(asar.entries, builtFiles(), path => sha256(file(path))))
  try {
    take(checkManifest(JSON.parse(file('package.json').toString('utf8')), pkg.manifest))
  } catch (failure) {
    problems.push(`app.asar's package.json cannot be read: ${describe(failure)}`)
  }
  for (const extra of ['app', 'app.asar.unpacked'])
    if (existsSync(join(pkg.resources, extra)))
      problems.push(`the package has ${extra} beside app.asar`)
  const plist = plistIntegrity(pkg, asarHeaderHash(asar))
  if (plist.problem !== undefined) problems.push(plist.problem)
  if (plist.finding !== undefined) findings.push(plist.finding)
  const built = profileProblems('release', resolve(desktopDir, bundleDir('release')))
  problems.push(...built.map(problem => `verify:build: ${problem}`))
  for (const bundle of BUNDLES) {
    const code = file(bundle)
    const record = { bundle, sha256: sha256(code), modules: [] }
    const text = bundleProblems('release', bundle, record, code.toString('utf8'), record.sha256)
    problems.push(
      ...text
        .filter(problem => !problem.includes('misses src/'))
        .map(problem => `as shipped: ${problem}`),
    )
  }
  if (built.length === 0)
    findings.push('verify:build passes on dist/release, and the shipped bundles carry its markers')
  return problems.length > 0
    ? report(2, 'package contents', 'fail', problems.join('; '))
    : report(2, 'package contents', 'pass', findings.join('; '))
}

async function refusedLaunch(
  pkg: Package,
  gate: LaunchGate,
  remote: RemoteSwitch,
): Promise<{ ok: boolean; reason: string }> {
  const userDataDir = tempDir('verify-release')
  try {
    const port = remote === 'remote-debugging-port' ? await freePort() : undefined
    const flag = port === undefined ? '--remote-debugging-pipe' : `--remote-debugging-port=${port}`
    const started = await launch(
      pkg.executable,
      [...releaseSwitches(userDataDir, gate), flag],
      pkg.location,
      {
        deadlineMs: REFUSAL_TIMEOUT_MS,
        extraFds: port === undefined ? 2 : 0,
      },
    )
    const { app } = started
    let [listened, answered] = [false, false]
    if (port === undefined) answered = (await askOverPipe(app, REFUSAL_TIMEOUT_MS)) !== undefined
    else {
      const deadline =
        /* wall-clock: operation-timing -- bound for polling the port */ performance.now() +
        REFUSAL_TIMEOUT_MS
      const open = () =>
        /* wall-clock: operation-timing -- bound for polling the port */ performance.now() <
        deadline
      while (app.isRunning() && !listened && open()) listened = await listening(port)
      if (listened) app.expire()
    }
    const outcome = await app.exited
    if (port !== undefined && !listened) listened = await listening(port)
    const verdict = judgeRefusal(outcome, remote, { listened, answered }, await finish(started))
    const stderr = app.stderr().trim()
    return verdict.ok || stderr === ''
      ? verdict
      : { ...verdict, reason: `${verdict.reason} (stderr: ${stderr.slice(0, 300)})` }
  } finally {
    dropTempDir(userDataDir)
  }
}

async function stopControl(app: Running): Promise<void> {
  if (!app.isRunning()) return
  if (isWindows) killRunningTree(app)
  else kill(app.pid, 'SIGTERM')
  const quit = setTimeout(app.expire, QUIT_TIMEOUT_MS)
  await app.exited
  clearTimeout(quit)
}

/** The positive control: the test package, started the same way, does answer on the endpoint. */
async function testPackageAnswers(remote: RemoteSwitch): Promise<{ ok: boolean; reason: string }> {
  const userDataDir = tempDir('verify-release-control')
  try {
    const spec = launchSpec('packaged', 'test', { userDataDir })
    try {
      await checkLaunchInputs(spec)
    } catch (failure) {
      return { ok: false, reason: `the test package cannot be launched: ${describe(failure)}` }
    }
    const port = remote === 'remote-debugging-port' ? await freePort() : undefined
    const flag = port === undefined ? '--remote-debugging-pipe' : `--remote-debugging-port=${port}`
    const started = await launch(
      spec.command,
      [...spec.args, flag],
      { command: spec.command, processDir: spec.processDir },
      {
        deadlineMs: READY_TIMEOUT_MS + QUIT_TIMEOUT_MS,
        extraFds: port === undefined ? 2 : 0,
      },
    )
    const { app } = started
    let answer: string | undefined
    if (port === undefined) {
      const product = (await askOverPipe(app, READY_TIMEOUT_MS))?.['product']
      answer = typeof product === 'string' ? product : undefined
    } else
      for (
        let waited = 0;
        app.isRunning() && answer === undefined && waited < READY_TIMEOUT_MS;
        waited += 50
      ) {
        answer = await devtoolsBrowser(port)
        if (answer === undefined) await sleep(50)
      }
    await stopControl(app)
    const outcome = await app.exited
    await finish(started)
    const how =
      port === undefined
        ? 'answer Browser.getVersion over the pipe'
        : 'answer /json/version on its port'
    return answer === undefined
      ? {
          ok: false,
          reason: `the test package started the same way did not ${how} (it ${describeExit(outcome)})`,
        }
      : { ok: true, reason: `the test package started the same way did ${how} (${answer})` }
  } finally {
    dropTempDir(userDataDir)
  }
}

async function checkRefusal(pkg: Package, gate: LaunchGate): Promise<CheckResult> {
  const name = 'remote debugging refused'
  if (!gate.run) return report(3, name, 'skipped', gate.note ?? '')
  const [passes, failures]: [string[], string[]] = [[], []]
  for (const remote of ['remote-debugging-port', 'remote-debugging-pipe'] as const) {
    const verdict = await refusedLaunch(pkg, gate, remote)
    ;(verdict.ok ? passes : failures).push(`--${remote}: ${verdict.reason}`)
    const control = await testPackageAnswers(remote)
    if (control.ok) passes.push(`--${remote} control: ${control.reason}`)
    else
      failures.push(`--${remote} control failed, so the refusal proves nothing: ${control.reason}`)
  }
  const note = gate.note ? `${gate.note}. ` : ''
  return failures.length > 0
    ? report(3, name, 'fail', note + failures.join('; '))
    : report(3, name, 'pass', note + passes.join('; '))
}

type Watched = {
  profile?: string
  readyMs?: number
  mainLines: { ms: number; record: Record<string, unknown> }[]
}

/** Starts the release app on a fresh profile; resolves at its ready line, a wrong profile, or its end. */
async function startWatched(pkg: Package, gate: LaunchGate, userDataDir: string) {
  const watched: Watched = { mainLines: [] }
  let settle = () => {}
  const settled = new Promise<void>(done => (settle = done))
  let spawnedAt =
    /* wall-clock: operation-timing -- the launch's own start, for its line times */ Date.now()
  const started = await launch(pkg.executable, releaseSwitches(userDataDir, gate), pkg.location, {
    deadlineMs: READY_TIMEOUT_MS + QUIT_TIMEOUT_MS + 5_000,
    onLine(line) {
      const [record] = mainLogLines(line)
      if (record === undefined) return
      watched.mainLines.push({ ms: elapsed(spawnedAt), record })
      if (watched.profile === undefined && typeof record['buildProfile'] === 'string') {
        watched.profile = record['buildProfile']
        if (watched.profile !== 'release') settle()
      }
      if (record['msg'] === MAIN_WINDOW_READY_MESSAGE && watched.readyMs === undefined) {
        watched.readyMs = elapsed(spawnedAt)
        settle()
      }
    },
  })
  spawnedAt = started.root.spawnedAt
  void started.app.exited.then(settle)
  const timer = setTimeout(settle, READY_TIMEOUT_MS)
  await settled
  clearTimeout(timer)
  return { started, watched }
}

async function checkStartup(pkg: Package, gate: LaunchGate): Promise<CheckResult> {
  const name = 'startup smoke'
  if (!gate.run) return report(4, name, 'skipped', gate.note ?? '')
  const note = gate.note ? `${gate.note}. ` : ''
  const lock = screenLock()
  if ('locked' in lock && lock.locked)
    return report(4, name, 'skipped', `${note}${SCREEN_LOCKED_REASON}; unlock it and run again`)
  const installed = installedUserData(pkg.manifest.productName)
  const before = fingerprint(installed)
  const userDataDir = tempDir('verify-release')
  try {
    const { started, watched } = await startWatched(pkg, gate, userDataDir)
    const { app } = started
    const diagnostics = (running?: string): LaunchDiagnostics => ({
      mainLines: watched.mainLines,
      stderr: app.stderr(),
      ...(running === undefined ? {} : { running }),
    })
    const observed: StartupObservation = {
      platform: process.platform,
      rootPid: app.pid,
      profile: watched.profile,
      readyMs: watched.readyMs,
      readyTimeoutMs: READY_TIMEOUT_MS,
      launched: [],
      leftovers: [],
      userData: { written: [], missing: [] },
      realUserData: { path: installed, before, after: before },
      cookieKey: observeCookieKey([], false),
    }
    if (watched.readyMs === undefined || watched.profile !== 'release') {
      const endedByItself = !app.isRunning()
      let running: string | undefined
      try {
        running = describeProcesses(createdBy(started), app.pid)
      } catch {}
      killRunningTree(app)
      const outcome = await app.exited
      await finish(started)
      const verdict = judgeStartup({
        ...observed,
        notReady: { endedByItself, outcome },
        diagnostics: diagnostics(running),
        screenAtFailure: screenLock(),
      })
      return report(4, name, verdict.status, note + verdict.reason)
    }
    const launched = createdBy(started)
    const quitFrom = /* wall-clock: operation-timing -- how long the quit took */ Date.now()
    let requestError: string | undefined
    if (isWindows) {
      const asked = spawnSync('taskkill', ['/PID', String(app.pid)], {
        encoding: 'utf8',
        timeout: QUIT_TIMEOUT_MS,
      })
      if (asked.status !== 0)
        requestError = `exit ${asked.status ?? asked.error?.message}: ${(asked.stderr || asked.stdout || '').trim()}`
    } else kill(app.pid, 'SIGTERM')
    const quitTimer = setTimeout(app.expire, QUIT_TIMEOUT_MS)
    const outcome = await app.exited
    clearTimeout(quitTimer)
    const quitMs = elapsed(quitFrom)
    const leftovers = await finish(started, launched)
    const expected = ['Local State', join('Partitions', 'omne')]
    const verdict = judgeStartup({
      ...observed,
      quit: {
        method: isWindows ? 'taskkill' : 'SIGTERM',
        requestError,
        outcome,
        ms: quitMs,
        timeoutMs: QUIT_TIMEOUT_MS,
      },
      launched,
      leftovers,
      userData: {
        written: readdirSync(userDataDir).toSorted(),
        missing: expected.filter(entry => !existsSync(join(userDataDir, entry))),
      },
      realUserData: { path: installed, before, after: fingerprint(installed) },
      diagnostics: diagnostics(),
      cookieKey: observeCookieKey(
        watched.mainLines.map(({ record }) => record),
        existsSync(join(userDataDir, COOKIE_KEY_WRITER_FAILED_FILE)),
      ),
    })
    return report(4, name, verdict.status, note + verdict.reason)
  } finally {
    dropTempDir(userDataDir)
  }
}

function runTool(command: string, args: string[]): { ok: boolean; output: string } {
  const ran = spawnSync(command, args, { encoding: 'utf8' })
  return {
    ok: ran.status === 0,
    output: `${ran.stdout ?? ''}${ran.stderr ?? ''}`.trim() || String(ran.error ?? ''),
  }
}

function signatureFacts(pkg: Package): SignatureFacts {
  if (process.platform === 'linux') return { platform: 'linux' }
  if (isWindows)
    return parseAuthenticode(
      powershellOutput(
        "Get-AuthenticodeSignature -LiteralPath $env:VERIFY_RELEASE_EXE | Select-Object @{n='Status';e={[string]$_.Status}},StatusMessage,@{n='Signer';e={$_.SignerCertificate.Subject}} | ConvertTo-Json -Compress",
        { VERIFY_RELEASE_EXE: pkg.executable },
      ),
    )
  const bundle = pkg.bundle!
  const display = runTool('codesign', ['-dv', '--verbose=2', bundle])
  if (/not signed at all/.test(display.output)) return { platform: 'darwin', signature: 'unsigned' }
  if (/Signature=adhoc/.test(display.output)) return { platform: 'darwin', signature: 'adhoc' }
  return {
    platform: 'darwin',
    signature: 'identity',
    authority: /^Authority=(.*)$/m.exec(display.output)?.[1],
    verify: runTool('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle]),
    staple: runTool('xcrun', ['stapler', 'validate', bundle]),
    gatekeeper: runTool('spctl', ['--assess', '--type', 'execute', '--verbose=2', bundle]),
  }
}

function checkSigning(pkg: Package, distribution: boolean): CheckResult {
  try {
    const verdict = judgeSigning(signatureFacts(pkg), distribution)
    return report(5, 'signing and notarization', verdict.status, verdict.reason)
  } catch (failure) {
    return report(
      5,
      'signing and notarization',
      'fail',
      `could not read the signature: ${describe(failure)}`,
    )
  }
}

function pnpm(args: string[]): void {
  const ran = spawnSync('pnpm', args, {
    cwd: desktopDir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: releaseEnv(),
  })
  if (ran.error) throw ran.error
  if (ran.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed`)
}

function sandboxBlocker(): { blocker: string | undefined } | undefined {
  if (process.platform !== 'linux') return undefined
  const executable = packagedBinary('release')
  return existsSync(executable) ? { blocker: linuxSandboxBlocker(executable) } : undefined
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const unknown = args.filter(
    arg => !['--no-build', DISTRIBUTION_FLAG, ALLOW_NO_SANDBOX_FLAG].includes(arg),
  )
  if (unknown.length > 0) throw new Error(`unknown argument ${unknown.join(' ')}`)
  const distribution = args.includes(DISTRIBUTION_FLAG)
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)
    process.once(signal, () => {
      say(`${signal}: stopping every launch and removing temporary directories`)
      cleanUpEverything()
      process.exit(code)
    })
  process.once('exit', cleanUpEverything)
  const build = !args.includes('--no-build')
  const beforeBuild = build ? sandboxBlocker() : undefined
  if (build) {
    say('building and packaging the test and release profiles')
    for (const script of ['build', 'package', 'package:release']) pnpm(['run', script])
  }
  const pkg = locatePackage()
  if (!existsSync(pkg.executable))
    throw new Error(`${pkg.executable} is missing: run \`pnpm run package:release\` first`)
  say(`checking ${relative(process.cwd(), pkg.executable) || pkg.executable}`)
  const blocker = sandboxBlocker()?.blocker
  const helperReset =
    blocker !== undefined && beforeBuild !== undefined && beforeBuild.blocker === undefined
  const gate = launchGate(
    process.platform,
    blocker,
    args.includes(ALLOW_NO_SANDBOX_FLAG),
    helperReset,
  )
  if (gate.note !== undefined) say(gate.note)
  const results: CheckResult[] = []
  const guard = async (
    id: number,
    name: string,
    check: () => CheckResult | Promise<CheckResult>,
  ) => {
    try {
      results.push(await check())
    } catch (failure) {
      results.push(report(id, name, 'fail', `the check itself failed: ${describe(failure)}`))
    }
  }
  await guard(1, 'fuses', () => checkFuses(pkg))
  await guard(2, 'package contents', () => checkContents(pkg))
  await guard(3, 'remote debugging refused', () => checkRefusal(pkg, gate))
  await guard(4, 'startup smoke', () => checkStartup(pkg, gate))
  await guard(5, 'signing and notarization', () => checkSigning(pkg, distribution))
  const summary = summarize(results, {
    signingRequired: requiresSigning(process.platform, distribution),
  })
  for (const line of summary.lines) say(line)
  return summary.exitCode
}

if (import.meta.main)
  main().then(
    code => {
      process.exitCode = code
    },
    (failure: unknown) => {
      say(describe(failure))
      cleanUpEverything()
      process.exitCode = 1
    },
  )
