// How every launcher starts the app: `pnpm run window`, `pnpm run dev`, the e2e fixtures.
// The release profile is started only by scripts/verify-release.ts.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, type RmOptions, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { reportedBuildProfile } from '../src/startup-signals.ts'
import { BUNDLES, bundleDir } from './build-profile.ts'
import { checkPackagedFuses, describeFuses } from './fuses.ts'
import { packagedBinary } from './packaged-path.ts'
import { powershellOutput } from './powershell.ts'

export const desktopDir = resolve(import.meta.dirname, '..')

export type LaunchTarget = 'unpackaged' | 'packaged'
export type LaunchProfile = 'dev' | 'test'

export type LaunchSpec = Readonly<{
  target: LaunchTarget
  profile: LaunchProfile
  command: string
  /** Every process of the app runs an executable under this directory. */
  processDir: string
  args: string[]
  cwd: string
}>

export function electronBinary(): string {
  const binary: unknown = createRequire(import.meta.url)('electron')
  if (typeof binary !== 'string') throw new Error('electron gave no executable path')
  return binary
}

/** A macOS bundle's helpers live beside its executable's directory: take the whole bundle. */
export function processDirOf(executable: string, platform = process.platform): string {
  const bundle = executable.lastIndexOf('.app/Contents/MacOS/')
  return platform === 'darwin' && bundle >= 0
    ? executable.slice(0, bundle + 4)
    : dirname(executable)
}

// Variables that change what the Electron binary is: with them it starts Node or a debugger.
const INHERITED = ['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE', 'NODE_OPTIONS']

export function launchEnvironment(
  env: NodeJS.ProcessEnv,
  extra: Record<string, string> = {},
): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [name, value] of Object.entries({ ...env, ...extra }))
    if (value !== undefined && !INHERITED.includes(name)) clean[name] = value
  return clean
}

/** Keeps a test launch off the system's credential store, which can prompt or hang. */
export function credentialStoreSwitches(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') return ['--use-mock-keychain']
  if (platform === 'linux') return ['--password-store=basic']
  return []
}

/** macOS: no "reopen windows?" prompt after a crash, which would hold the launch before `ready`. */
export function windowStateSwitches(platform: NodeJS.Platform): string[] {
  return platform === 'darwin' ? ['-ApplePersistenceIgnoreState', 'YES'] : []
}

export type UserNamespaceAttempt =
  | Readonly<{ result: 'created' }>
  | Readonly<{ result: 'failed'; reason: string }>
  | Readonly<{ result: 'unavailable' }>

export type SandboxProbe = Readonly<{
  euid(): number
  sysctl(name: string): string | undefined
  stat(path: string): { uid: number; mode: number } | undefined
  userNamespace(): UserNamespaceAttempt
}>

let userNamespaceAttempt: UserNamespaceAttempt | undefined

function tryUserNamespace(): UserNamespaceAttempt {
  try {
    execFileSync('unshare', ['--user', '--map-root-user', 'true'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 10_000,
    })
    return { result: 'created' }
  } catch (failure) {
    if ((failure as { code?: unknown }).code === 'ENOENT') return { result: 'unavailable' }
    const stderr = String((failure as { stderr?: unknown }).stderr ?? '').trim()
    return { result: 'failed', reason: stderr || String(failure) }
  }
}

const machineProbe: SandboxProbe = {
  euid: () => process.geteuid?.() ?? -1,
  sysctl(name) {
    try {
      return readFileSync(join('/proc/sys', ...name.split('.')), 'utf8').trim()
    } catch {
      return undefined
    }
  },
  stat(path) {
    try {
      const { uid, mode } = statSync(path)
      return { uid, mode }
    } catch {
      return undefined
    }
  },
  userNamespace: () => (userNamespaceAttempt ??= tryUserNamespace()),
}

function userNamespaceBlocker(probe: SandboxProbe): string | undefined {
  // AppArmor decides per executable: `unshare` passing under its own profile says nothing for Electron.
  if (probe.sysctl('kernel.apparmor_restrict_unprivileged_userns') === '1')
    return 'AppArmor restricts unprivileged user namespaces (kernel.apparmor_restrict_unprivileged_userns=1)'
  const attempt = probe.userNamespace()
  if (attempt.result === 'failed')
    return `creating an unprivileged user namespace failed (unshare --user --map-root-user: ${attempt.reason})`
  if (attempt.result === 'created') return undefined
  if (probe.sysctl('kernel.unprivileged_userns_clone') === '0')
    return 'unprivileged user namespaces are disabled (kernel.unprivileged_userns_clone=0)'
  if (probe.sysctl('user.max_user_namespaces') === '0')
    return 'user namespaces are disabled (user.max_user_namespaces=0)'
  return undefined
}

/** Why Chromium's sandbox cannot start for `executable` on this Linux machine, judged by trying. */
export function linuxSandboxBlocker(
  executable: string,
  probe: SandboxProbe = machineProbe,
): string | undefined {
  if (probe.euid() === 0) return 'this runs as root (euid 0), where Chromium starts no sandbox'
  const userns = userNamespaceBlocker(probe)
  if (userns === undefined) return undefined
  const helper = join(dirname(executable), 'chrome-sandbox')
  const found = probe.stat(helper)
  if (found !== undefined && found.uid === 0 && (found.mode & 0o7777) === 0o4755) return undefined
  const state =
    found === undefined
      ? 'missing'
      : `owned by uid ${found.uid} with mode ${(found.mode & 0o7777).toString(8)}`
  return `${userns}, and the setuid sandbox helper ${helper} is ${state} (it needs root and mode 4755)`
}

const sandboxNotices = new Set<string>()

/** `--no-sandbox`, said once on stderr, only on a Linux machine where the sandbox cannot start. */
export function sandboxSwitches(
  platform: NodeJS.Platform,
  executable: string,
  probe: SandboxProbe = machineProbe,
): string[] {
  if (platform !== 'linux') return []
  const blocker = linuxSandboxBlocker(executable, probe)
  if (blocker === undefined) return []
  if (!sandboxNotices.has(blocker)) {
    sandboxNotices.add(blocker)
    process.stderr.write(
      `launch: passing --no-sandbox: Chromium's sandbox cannot start: ${blocker}\n`,
    )
  }
  return ['--no-sandbox']
}

export const freshUserDataDir = (label: string): string =>
  mkdtempSync(join(tmpdir(), `omne-${label}-`))

/** Removes a user data directory, retrying while helpers still hold files; warns instead of failing. */
export function removeUserDataDir(
  directory: string,
  remove: (path: string, options: RmOptions) => void = rmSync,
): boolean {
  try {
    remove(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    return true
  } catch (failure) {
    process.stderr.write(`warning: could not remove ${directory}: ${String(failure)}\n`)
    return false
  }
}

/** How to start one target of one profile. A test launch runs on the user data directory it names. */
export function launchSpec(
  target: LaunchTarget,
  profile: LaunchProfile,
  {
    executable,
    userDataDir,
  }: { executable?: string | undefined; userDataDir?: string | undefined } = {},
): LaunchSpec {
  if (target === 'packaged' && profile !== 'test')
    throw new Error('only the test profile is packaged for launching')
  if (target === 'unpackaged' && executable !== undefined)
    throw new Error("an unpackaged launch runs this checkout's Electron")
  const command = target === 'packaged' ? resolve(executable ?? packagedBinary()) : electronBinary()
  const switches = sandboxSwitches(process.platform, command)
  if (profile === 'test') {
    if (userDataDir === undefined || userDataDir.trim() === '')
      throw new Error('a test launch needs a user data directory of its own')
    switches.push(
      `--user-data-dir=${resolve(userDataDir)}`,
      ...credentialStoreSwitches(process.platform),
      ...windowStateSwitches(process.platform),
    )
  } else if (userDataDir !== undefined) throw new Error('the dev profile keeps its own user data')
  const processDir = processDirOf(command)
  if (target === 'packaged')
    return { target, profile, command, processDir, args: switches, cwd: dirname(command) }
  const app = join(desktopDir, bundleDir(profile))
  return { target, profile, command, processDir, args: [app, ...switches], cwd: desktopDir }
}

const fuseChecks = new Map<string, Promise<void>>()

/** Rejects, naming the command to run, unless what `spec` starts exists and is the test profile. */
export async function checkLaunchInputs(spec: LaunchSpec): Promise<void> {
  if (spec.target === 'packaged') {
    if (!existsSync(spec.command))
      throw new Error(`${spec.command} is missing: run \`pnpm run package\` first`)
    const key = `${spec.command}\0${statSync(spec.command).mtimeMs}`
    let check = fuseChecks.get(key)
    if (check === undefined) {
      check = checkPackagedFuses(spec.command, 'test').then(readings => {
        process.stdout.write(
          `launch: ${spec.command} has the test fuses: ${describeFuses(readings)}\n`,
        )
      })
      fuseChecks.set(key, check)
    }
    return check
  }
  if (spec.profile === 'dev') return
  for (const bundle of BUNDLES) {
    const file = join(desktopDir, bundleDir('test'), bundle)
    if (!existsSync(file)) throw new Error(`${file} is missing: run \`pnpm run build\` first`)
  }
}

/** Resolves once the app on `stdout` reports `expected`; rejects on another profile, an end, or time. */
export function verifyBuildProfile(
  stdout: Readable,
  expected: LaunchProfile,
  timeoutMs = 30_000,
): Promise<void> {
  return new Promise((done, fail) => {
    const decoder = new StringDecoder('utf8')
    let pending = ''
    const settle = (error?: Error) => {
      clearTimeout(timer)
      stdout.off('data', onData)
      stdout.off('end', onEnd)
      stdout.off('close', onEnd)
      if (error === undefined) done()
      else fail(error)
    }
    const onData = (chunk: Buffer | string) => {
      pending += typeof chunk === 'string' ? chunk : decoder.write(chunk)
      for (let newline = pending.indexOf('\n'); newline >= 0; newline = pending.indexOf('\n')) {
        const reported = reportedBuildProfile(pending.slice(0, newline).trim())
        pending = pending.slice(newline + 1)
        if (reported === undefined) continue
        const wrong = new Error(`the app reports build profile ${reported}, expected ${expected}`)
        return settle(reported === expected ? undefined : wrong)
      }
    }
    const onEnd = () => settle(new Error(`the app exited before reporting its build profile`))
    const timer = setTimeout(
      () => settle(new Error(`the app did not report its build profile within ${timeoutMs} ms`)),
      timeoutMs,
    )
    timer.unref()
    stdout.on('data', onData)
    stdout.once('end', onEnd)
    stdout.once('close', onEnd)
  })
}

/** The PIDs of the processes under `directory`, this one excluded; a failed listing throws. */
export function appProcesses(executable: string, directory: string): number[] {
  let output: string
  if (process.platform === 'win32')
    output = powershellOutput(
      'Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $env:OMNE_PROCESS_EXE, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId }',
      { OMNE_PROCESS_EXE: executable },
    )
  else
    try {
      const pattern = `^${directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`
      output = execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' })
    } catch (failure) {
      if ((failure as { status?: unknown }).status === 1) return []
      throw failure
    }
  return output
    .split(/\r?\n/)
    .map(Number)
    .filter(pid => pid > 0 && pid !== process.pid)
}
