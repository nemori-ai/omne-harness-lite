import { isAbsolute } from 'node:path'

export interface SessionLogPolicy {
  readonly appendQueueLimit: number
  readonly residentLogsLimit: number
}
export const defaultSessionLogPolicy: SessionLogPolicy = Object.freeze({
  appendQueueLimit: 64,
  residentLogsLimit: 256,
})
export interface SessionLogDiagnostic {
  readonly level: 'warn' | 'error'
  readonly stage:
    'root' | 'capacity' | 'index' | 'append' | 'repair' | 'corrupt' | 'read' | 'recovery' | 'close'
  readonly sessionHash?: string
  readonly count?: number
  readonly recoverySource?: 'clean' | 'active' | 'legacy'
  readonly ownerObserved?: ProcessExit
  readonly operation?:
    | 'fullScan'
    | 'suffixScan'
    | 'tailRepair'
    | 'closeHandles'
    | 'indexSafety'
    | 'markClean'
    | 'releaseLock'
  readonly outcome?: 'completed' | 'failed'
}
export type ProcessExit = 'exited' | 'alive' | 'unknown'
/** Trusted local lifecycle input, never a tenant setting or a PID probe. */
export interface ProcessOwnership {
  readonly current: string
  readonly observeExit: (owner: string) => Promise<ProcessExit>
  readonly observeLegacyExit?: (dir: string) => Promise<ProcessExit>
}
export function isProcessOwnership(value: unknown): value is ProcessOwnership {
  return (
    typeof value === 'object' &&
    value !== null &&
    'current' in value &&
    typeof value.current === 'string' &&
    value.current.length > 0 &&
    'observeExit' in value &&
    typeof value.observeExit === 'function' &&
    (!('observeLegacyExit' in value) || typeof value.observeLegacyExit === 'function') &&
    Object.keys(value).every(key => ['current', 'observeExit', 'observeLegacyExit'].includes(key))
  )
}
export interface SessionLogOptions {
  readonly dir: string
  readonly processOwnership: ProcessOwnership
  readonly policy?: Partial<SessionLogPolicy>
  readonly diagnostic?: (event: SessionLogDiagnostic) => void
}
export function resolveOptions(options: SessionLogOptions): {
  readonly dir: string
  readonly policy: SessionLogPolicy
  readonly diagnostic: (event: SessionLogDiagnostic) => void
  readonly processOwnership: ProcessOwnership
} {
  if (
    typeof options !== 'object' ||
    options === null ||
    typeof options.dir !== 'string' ||
    !isAbsolute(options.dir) ||
    options.dir.includes('\0')
  )
    throw new TypeError('session log dir must be an absolute path')
  if (
    Object.keys(options).some(
      key => !['dir', 'policy', 'diagnostic', 'processOwnership'].includes(key),
    )
  )
    throw new TypeError('unknown session log option')
  if (!isProcessOwnership(options.processOwnership))
    throw new TypeError('invalid process ownership')
  const processOwnership: ProcessOwnership = Object.freeze({
    current: options.processOwnership.current,
    observeExit: options.processOwnership.observeExit.bind(options.processOwnership),
    ...(options.processOwnership.observeLegacyExit === undefined
      ? {}
      : {
          observeLegacyExit: options.processOwnership.observeLegacyExit.bind(
            options.processOwnership,
          ),
        }),
  })
  if (
    options.policy !== undefined &&
    (typeof options.policy !== 'object' ||
      options.policy === null ||
      Object.keys(options.policy).some(
        key => !['appendQueueLimit', 'residentLogsLimit'].includes(key),
      ))
  )
    throw new TypeError('invalid session log policy')
  const policy = Object.freeze({ ...defaultSessionLogPolicy, ...options.policy })
  for (const value of [policy.appendQueueLimit, policy.residentLogsLimit])
    if (!Number.isInteger(value) || value < 1)
      throw new TypeError('session log policy requires positive integers')
  if (options.diagnostic !== undefined && typeof options.diagnostic !== 'function')
    throw new TypeError('invalid session log diagnostic sink')
  return {
    dir: options.dir,
    policy,
    processOwnership,
    diagnostic: options.diagnostic ?? (() => {}),
  }
}
