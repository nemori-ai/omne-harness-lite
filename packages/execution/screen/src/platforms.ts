import { execFile } from 'node:child_process'
import {
  selfCheck,
  type Monitor,
  type ScreenBackend,
  type ScreenPermission,
  type SelfCheck,
} from './backend.ts'
import { libraryBackend, type LibraryUnits, type ScreenLibrary } from './library.ts'

const graphics = (call: string) =>
  `ObjC.import("CoreGraphics"); ObjC.bindFunction("${call}", ["bool", []]); $.${call}()`
const PREFLIGHT = graphics('CGPreflightScreenCaptureAccess')
const REQUEST = graphics('CGRequestScreenCaptureAccess')

function runMacos(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', script],
      { timeout: 5_000 },
      (error, stdout) => (error === null ? resolve(stdout) : reject(error)),
    )
  })
}

const askMacos = (): Promise<string> => runMacos(PREFLIGHT)

/** Requests the permission: macOS shows its prompt once and lists the app that runs this process in its settings; the person's answer comes later. */
export async function macosRequestScreenAccess(
  run: (script: string) => Promise<string> = runMacos,
): Promise<void> {
  await run(REQUEST).catch(() => undefined)
}

const ANSWERS: Readonly<Record<string, ScreenPermission>> = {
  true: 'satisfied',
  false: 'unsatisfied',
}

/** A granted permission is kept; any other answer is asked again at the next use. */
export function macosScreenPermission(
  ask: () => Promise<string> = askMacos,
): () => Promise<ScreenPermission> {
  let granted = false
  return async () => {
    if (granted) return 'satisfied'
    try {
      const permission = ANSWERS[(await ask()).trim()] ?? 'unknown'
      granted = permission === 'satisfied'
      return permission
    } catch {
      return 'unknown'
    }
  }
}

/** The screenshot library of this install, or nothing where its binary for the system is absent. */
async function loadLibrary(): Promise<ScreenLibrary | undefined> {
  const { Monitor: monitors } = await import('node-screenshots')
  return { monitors: () => monitors.all() }
}

export type BackendSources = Readonly<{
  load?: () => Promise<ScreenLibrary | undefined>
  ask?: () => Promise<string>
  env?: NodeJS.ProcessEnv
}>

type Platform = Readonly<{
  units: LibraryUnits
  verification: ScreenBackend['verification']
  permission(sources: BackendSources): () => Promise<ScreenPermission>
}>

const always = (permission: ScreenPermission) => () => async () => permission

/** One row for each system that has a backend; a system without a row has none. */
const PLATFORMS: Readonly<Partial<Record<NodeJS.Platform, Platform>>> = {
  darwin: {
    units: 'points',
    verification: 'device',
    permission: sources => macosScreenPermission(sources.ask),
  },
  win32: { units: 'pixels', verification: 'contract-suite', permission: always('satisfied') },
  linux: {
    units: 'pixels',
    verification: 'contract-suite',
    permission: ({ env = process.env }) =>
      always(env['DISPLAY'] && !env['WAYLAND_DISPLAY'] ? 'satisfied' : 'unknown')(),
  },
}

export async function screenBackendFor(
  platform: NodeJS.Platform,
  sources: BackendSources = {},
): Promise<ScreenBackend | undefined> {
  const row = PLATFORMS[platform]
  if (row === undefined) return undefined
  let library: ScreenLibrary | undefined
  try {
    library = await (sources.load ?? loadLibrary)()
  } catch {
    return undefined
  }
  if (library === undefined) return undefined
  const loaded = library
  return libraryBackend({
    name: `node-screenshots/${platform}`,
    verification: row.verification,
    units: row.units,
    library: () => loaded,
    permission: row.permission(sources),
  })
}

export type ScreenDiagnosis =
  | Readonly<{ platform: string; backend: null }>
  | Readonly<{
      platform: string
      backend: string
      verification: ScreenBackend['verification']
      permission: ScreenPermission
      check: SelfCheck
      screens: readonly Monitor[]
    }>

/** What one runs on a machine to see whether its backend works there. */
export async function diagnoseScreen(
  platform: NodeJS.Platform = process.platform,
  sources: BackendSources = {},
): Promise<ScreenDiagnosis> {
  const backend = await screenBackendFor(platform, sources)
  if (backend === undefined) return { platform, backend: null }
  const check = await selfCheck(backend)
  return {
    platform,
    backend: backend.name,
    verification: backend.verification,
    permission: await backend.permission(),
    check,
    screens: await backend.list().catch(() => []),
  }
}
