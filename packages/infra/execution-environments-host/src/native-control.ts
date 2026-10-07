import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import type { HostNativePolicy } from './native-policy.ts'

export interface HostProcessCoordinate {
  readonly unit: string
  readonly boot: string
}
export interface HostRecoveryControl {
  readonly coordinate: HostProcessCoordinate
  readonly closePermission: () => void
  readonly stop: (mode: 'graceful' | 'forced') => Promise<'confirmed' | 'unconfirmed'>
  readonly settled: Promise<void>
}
export type HostPreparation<T> =
  | { readonly kind: 'ready'; readonly control: T }
  | { readonly kind: 'unknown'; readonly control: HostRecoveryControl }
  | { readonly kind: 'rejected'; readonly reason: 'invalidInput' | 'unavailable' }

const execute = promisify(execFile)
export function nativeManagerEnvironment(): NodeJS.ProcessEnv {
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error('Host execution requires Linux user scopes')
  return {
    PATH: '/usr/bin:/bin',
    XDG_RUNTIME_DIR: `/run/user/${uid}`,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${uid}/bus`,
  }
}
export async function createHostProcessCoordinate(): Promise<HostProcessCoordinate> {
  return Object.freeze({
    unit: `omne-host-${randomUUID()}.scope`,
    boot: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  })
}
export function validHostCoordinate(value: HostProcessCoordinate): boolean {
  return /^omne-host-[0-9a-f-]{36}\.scope$/.test(value.unit) && /^[0-9a-f-]{36}$/.test(value.boot)
}
export async function hostScopeState(
  coordinate: HostProcessCoordinate,
  policy: HostNativePolicy,
): Promise<'inactive' | 'active' | 'unknown'> {
  if (!validHostCoordinate(coordinate)) return 'unknown'
  try {
    const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
    if (boot !== coordinate.boot) return 'inactive'
    const { stdout } = await execute(
      '/usr/bin/systemctl',
      ['--user', 'show', coordinate.unit, '-p', 'LoadState', '-p', 'ActiveState'],
      {
        env: nativeManagerEnvironment(),
        timeout: policy.stopDeadlineMs,
        maxBuffer: 16384,
      },
    )
    const fields = Object.fromEntries(
      stdout
        .trim()
        .split('\n')
        .map(line => line.split('=')),
    )
    if (fields.LoadState === 'not-found') return 'inactive'
    if (fields.LoadState !== 'loaded') return 'unknown'
    return fields.ActiveState === 'inactive' || fields.ActiveState === 'failed'
      ? 'inactive'
      : 'active'
  } catch {
    return 'unknown'
  }
}
/** Absence is meaningful only after the original launch has been drained or isolated. */
export async function stopHostResource(
  coordinate: HostProcessCoordinate,
  policy: HostNativePolicy,
  isOriginalLaunchIsolated: () => Promise<boolean>,
  mode: 'graceful' | 'forced' = 'forced',
): Promise<'confirmed' | 'unconfirmed'> {
  if (!validHostCoordinate(coordinate)) return 'unconfirmed'
  let isolated = false
  try {
    isolated = await isOriginalLaunchIsolated()
    if (!isolated) return 'unconfirmed'
    if ((await hostScopeState(coordinate, policy)) === 'inactive') return 'confirmed'
    if (mode === 'forced')
      await execute(
        '/usr/bin/systemctl',
        ['--user', 'kill', '--kill-who=all', '--signal=SIGKILL', coordinate.unit],
        {
          env: nativeManagerEnvironment(),
          timeout: policy.stopDeadlineMs,
          maxBuffer: 16384,
        },
      )
    await execute('/usr/bin/systemctl', ['--user', 'stop', coordinate.unit], {
      env: nativeManagerEnvironment(),
      timeout: policy.stopDeadlineMs,
      maxBuffer: 16384,
    })
    return (await hostScopeState(coordinate, policy)) === 'inactive' ? 'confirmed' : 'unconfirmed'
  } catch {
    return isolated && (await hostScopeState(coordinate, policy)) === 'inactive'
      ? 'confirmed'
      : 'unconfirmed'
  }
}

/** A timeout retains the original promise; it does not cancel the native operation. */
export async function observeWithin<T>(
  work: Promise<T>,
  milliseconds: number,
): Promise<{ value: T } | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work.then(value => ({ value })),
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Preparation timeout preserves the original control and closes its GO channel. */
export async function observeHostPreparation<T extends HostRecoveryControl>(
  ready: Promise<boolean>,
  control: T,
  policy: HostNativePolicy,
  closed: () => boolean,
): Promise<HostPreparation<T>> {
  const observed = await observeWithin(ready, policy.preparationDeadlineMs)
  if (observed?.value && !closed()) return { kind: 'ready', control }
  control.closePermission()
  return { kind: 'unknown', control }
}
