import { randomBytes } from 'node:crypto'
import { timingSafeEqual } from 'node:crypto'
import { nodeScryptCompute, type ScryptCompute } from './hash.ts'
import { memoryBytes } from './memory.ts'
import {
  decodeMaterial,
  encodeMaterial,
  type DecodeFailure,
  type MaterialParams,
} from './material.ts'
import { acceptedProfile, type ScryptProfile } from './profile.ts'

export type PasswordPolicy = (secret: string) => { ok: true } | { ok: false }

export type DeriveRefusal =
  | 'invalid_secret'
  | 'policy_missing'
  | 'policy_refused'
  | 'memory_limit'
  | 'queue_full'
  | 'stopped'
  | 'unavailable'

export type CancelResult = 'left_queue' | 'stopped_waiting' | 'already_left'

export type DeriveDone =
  | { code: 'material'; material: string }
  | { code: 'unavailable' | 'left_queue' }

export type VerifyDone = { code: 'match' | 'mismatch' | 'unavailable' | 'left_queue' }

type AdmissionRefusal = 'memory_limit' | 'queue_full' | 'stopped'

export interface Admitted<T> {
  readonly code: 'queued' | 'running'
  cancelWaiting(): CancelResult
  readonly done: Promise<T>
}

export interface ScryptModule {
  derive(
    secret: string,
    policy: PasswordPolicy | undefined,
  ): { code: DeriveRefusal } | Admitted<DeriveDone>
  verify(
    material: string,
    secret: string,
  ): { code: 'mismatch' | 'unavailable' | AdmissionRefusal } | Admitted<VerifyDone>
  close(): Promise<{ code: 'closed' }>
}

export interface AdmissionView {
  readonly running: number
  readonly runningMemory: number
  readonly queued: number
  readonly jobMemory: number
  readonly inFlight: number
  readonly queueLimit: number
  readonly memoryBudget: number
}

export function planAdmission(
  view: AdmissionView,
): 'run' | 'queue' | 'memory_limit' | 'queue_full' {
  if (view.jobMemory > view.memoryBudget) return 'memory_limit'
  if (view.running < view.inFlight && view.runningMemory + view.jobMemory <= view.memoryBudget)
    return 'run'
  if (view.queued >= view.queueLimit) return 'queue_full'
  return 'queue'
}

interface Slot {
  memory: number
  started: boolean
  left: boolean
  leave: () => void
  launch: (doneRunning: () => void) => void
}

type HashValue = Uint8Array | { code: 'unavailable' }

/** Largest secret this package will copy into scrypt. Not a composition rule. */
const SECRET_UTF8_LIMIT = 4096

function secretFits(secret: string): boolean {
  return Buffer.byteLength(secret, 'utf8') <= SECRET_UTF8_LIMIT
}

function aboveProfile(params: MaterialParams, profile: ScryptProfile): boolean {
  return (
    params.N > profile.N ||
    params.r > profile.r ||
    params.p > profile.p ||
    params.keylen > profile.keylen
  )
}

function assessPolicy(
  policy: PasswordPolicy | undefined,
  secret: string,
): 'ok' | 'policy_missing' | 'policy_refused' | 'unavailable' {
  if (typeof policy !== 'function') return 'policy_missing'
  try {
    const verdict = policy(secret)
    if (verdict === null || typeof verdict !== 'object' || typeof verdict.ok !== 'boolean')
      return 'unavailable'
    return verdict.ok ? 'ok' : 'policy_refused'
  } catch {
    return 'unavailable'
  }
}

export function openScrypt(
  profile: ScryptProfile,
  compute: ScryptCompute = nodeScryptCompute,
): { ok: true; module: ScryptModule } | { ok: false; code: 'invalid_profile' } {
  const accepted = acceptedProfile(profile)
  if (accepted === undefined) return { ok: false, code: 'invalid_profile' }
  const opened: ScryptProfile = {
    N: profile.N,
    r: profile.r,
    p: profile.p,
    keylen: profile.keylen,
    saltBytes: profile.saltBytes,
    inFlight: profile.inFlight,
    queue: profile.queue,
  }
  const { budget, jobMemory } = accepted

  let stopped = false
  let running = 0
  let runningMemory = 0
  const queue: Slot[] = []
  const active = new Set<Promise<void>>()

  function view(extraQueued: number, memory: number): AdmissionView {
    return {
      running,
      runningMemory,
      queued: queue.length + extraQueued,
      jobMemory: memory,
      inFlight: opened.inFlight,
      queueLimit: opened.queue,
      memoryBudget: budget,
    }
  }

  function pump(): void {
    while (queue.length > 0) {
      const next = queue[0]
      if (next === undefined) return
      if (stopped || planAdmission(view(-1, next.memory)) !== 'run') return
      queue.shift()
      begin(next)
    }
  }

  function begin(slot: Slot): void {
    slot.started = true
    running += 1
    runningMemory += slot.memory
    const track = new Promise<void>(resolve => {
      queueMicrotask(() => {
        slot.launch(() => {
          running -= 1
          runningMemory -= slot.memory
          active.delete(track)
          resolve()
          pump()
        })
      })
    })
    active.add(track)
  }

  function admit<T extends DeriveDone | VerifyDone>(
    memory: number,
    work: (finish: (value: T) => void) => void,
    leaveValue: T,
    failValue: T,
  ): { code: AdmissionRefusal } | Admitted<T> {
    if (stopped) return { code: 'stopped' }
    const decision = planAdmission(view(0, memory))
    if (decision === 'memory_limit') return { code: 'memory_limit' }
    if (decision === 'queue_full') return { code: 'queue_full' }
    let settle: (value: T) => void = () => undefined
    const done = new Promise<T>(resolve => {
      settle = resolve
    })
    const slot: Slot = {
      memory,
      started: false,
      left: false,
      leave() {
        slot.left = true
        settle(leaveValue)
      },
      launch(doneRunning) {
        let released = false
        const release = () => {
          if (released) return
          released = true
          doneRunning()
        }
        try {
          work(value => {
            if (!slot.left) settle(value)
            release()
          })
        } catch {
          if (!slot.left) settle(failValue)
          release()
        }
      },
    }
    const handle: Admitted<T> = {
      code: decision === 'run' ? 'running' : 'queued',
      done,
      cancelWaiting() {
        if (slot.left) return 'already_left'
        if (slot.started) return 'stopped_waiting'
        const index = queue.indexOf(slot)
        if (index >= 0) queue.splice(index, 1)
        slot.leave()
        return 'left_queue'
      },
    }
    if (decision === 'run') begin(slot)
    else queue.push(slot)
    return handle
  }

  function runHash(
    secret: string,
    salt: Uint8Array,
    keylen: number,
    cost: { N: number; r: number; p: number },
    finish: (value: HashValue) => void,
  ): void {
    compute(secret, salt, keylen, cost, (error, key) => {
      finish(
        error === undefined || error === null
          ? (key ?? { code: 'unavailable' })
          : { code: 'unavailable' },
      )
    })
  }

  function readyVerify(
    material: string,
    secret: string,
  ):
    | { decoded: Exclude<ReturnType<typeof decodeMaterial>, DecodeFailure>; cost: number }
    | { code: 'mismatch' | 'unavailable' } {
    if (typeof secret !== 'string') return { code: 'unavailable' }
    if (!secretFits(secret)) return { code: 'unavailable' }
    const decoded = decodeMaterial(material)
    if (decoded === 'mismatch' || decoded === 'unavailable') return { code: decoded }
    if (aboveProfile(decoded.params, opened)) return { code: 'unavailable' }
    const cost = memoryBytes(decoded.params)
    if (cost === undefined || cost > jobMemory) return { code: 'unavailable' }
    return { decoded, cost }
  }

  const module: ScryptModule = {
    derive(secret, policy) {
      if (typeof secret !== 'string') return { code: 'invalid_secret' }
      if (!secretFits(secret)) return { code: 'unavailable' }
      const policyCode = assessPolicy(policy, secret)
      if (policyCode !== 'ok') return { code: policyCode }
      let salt: Buffer
      try {
        salt = randomBytes(opened.saltBytes)
      } catch {
        return { code: 'unavailable' }
      }
      return admit<DeriveDone>(
        jobMemory,
        finish => {
          runHash(secret, salt, opened.keylen, opened, value => {
            if (!(value instanceof Uint8Array) || value.length !== opened.keylen) {
              finish({ code: 'unavailable' })
              return
            }
            finish({
              code: 'material',
              material: encodeMaterial(
                { N: opened.N, r: opened.r, p: opened.p, keylen: opened.keylen },
                salt,
                value,
              ),
            })
          })
        },
        { code: 'left_queue' },
        { code: 'unavailable' },
      )
    },
    verify(material, secret) {
      const ready = readyVerify(material, secret)
      if (!('decoded' in ready)) return ready
      return admit<VerifyDone>(
        ready.cost,
        finish => {
          runHash(
            secret,
            ready.decoded.salt,
            ready.decoded.params.keylen,
            ready.decoded.params,
            value => {
              if (!(value instanceof Uint8Array) || value.length !== ready.decoded.key.length) {
                finish({ code: 'unavailable' })
                return
              }
              finish({ code: timingSafeEqual(value, ready.decoded.key) ? 'match' : 'mismatch' })
            },
          )
        },
        { code: 'left_queue' },
        { code: 'unavailable' },
      )
    },
    async close() {
      stopped = true
      const waiting = queue.splice(0)
      for (const entry of waiting) {
        if (!entry.started && !entry.left) {
          entry.leave()
        }
      }
      await Promise.all(active)
      return { code: 'closed' }
    },
  }
  return { ok: true, module }
}
