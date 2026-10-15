import { randomBytes } from 'node:crypto'
import { timingSafeEqual } from 'node:crypto'
import { nodeScryptCompute, type ScryptCompute } from './hash.ts'
import { memoryBytes } from './memory.ts'
import { decodeMaterial, encodeMaterial } from './material.ts'
import { profileMemory, profileValid, type ScryptProfile } from './profile.ts'

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

export interface Admitted {
  readonly code: 'queued' | 'running'
  cancelWaiting(): CancelResult
  readonly done: Promise<unknown>
}

export interface ScryptModule {
  derive(secret: string, policy: PasswordPolicy | undefined): { code: DeriveRefusal } | Admitted
  verify(material: string, secret: string): { code: 'mismatch' | 'unavailable' | 'stopped' | 'queue_full' | 'memory_limit' } | Admitted
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

export function planAdmission(view: AdmissionView): 'run' | 'queue' | 'memory_limit' | 'queue_full' {
  if (view.jobMemory > view.memoryBudget) return 'memory_limit'
  if (view.running < view.inFlight && view.runningMemory + view.jobMemory <= view.memoryBudget) return 'run'
  if (view.queued >= view.queueLimit) return 'queue_full'
  return 'queue'
}

interface Entry {
  memory: number
  started: boolean
  left: boolean
  settle: (value: unknown) => void
  work: (finish: (value: unknown) => void) => void
}

export function openScrypt(
  profile: ScryptProfile,
  compute: ScryptCompute = nodeScryptCompute,
): { ok: true; module: ScryptModule } | { ok: false; code: 'invalid_profile' } {
  if (!profileValid(profile)) return { ok: false, code: 'invalid_profile' }
  const budget = profileMemory(profile)
  if (budget === undefined) return { ok: false, code: 'invalid_profile' }
  const jobMemory = memoryBytes(profile)
  if (jobMemory === undefined) return { ok: false, code: 'invalid_profile' }

  let stopped = false
  let running = 0
  let runningMemory = 0
  const queue: Entry[] = []
  const active = new Set<Promise<void>>()

  function view(extraQueued: number, memory: number): AdmissionView {
    return {
      running,
      runningMemory,
      queued: queue.length + extraQueued,
      jobMemory: memory,
      inFlight: profile.inFlight,
      queueLimit: profile.queue,
      memoryBudget: budget as number,
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

  function begin(entry: Entry): void {
    entry.started = true
    running += 1
    runningMemory += entry.memory
    const track = new Promise<void>(resolve => {
      queueMicrotask(() => {
        entry.work(value => {
          running -= 1
          runningMemory -= entry.memory
          active.delete(track)
          if (!entry.left) entry.settle(value)
          resolve()
          pump()
        })
      })
    })
    active.add(track)
  }

  function admit(memory: number, work: Entry['work']): { code: DeriveRefusal } | Admitted {
    if (stopped) return { code: 'stopped' }
    const decision = planAdmission(view(0, memory))
    if (decision === 'memory_limit') return { code: 'memory_limit' }
    if (decision === 'queue_full') return { code: 'queue_full' }
    let settle: (value: unknown) => void = () => undefined
    const done = new Promise(resolve => {
      settle = resolve
    })
    const entry: Entry = { memory, started: false, left: false, settle, work }
    const handle: Admitted = {
      code: decision === 'run' ? 'running' : 'queued',
      done,
      cancelWaiting() {
        if (entry.left) return 'already_left'
        if (entry.started) return 'stopped_waiting'
        const index = queue.indexOf(entry)
        if (index >= 0) queue.splice(index, 1)
        entry.left = true
        settle({ code: 'left_queue' })
        return 'left_queue'
      },
    }
    if (decision === 'run') begin(entry)
    else queue.push(entry)
    return handle
  }

  function runHash(
    secret: string,
    salt: Uint8Array,
    keylen: number,
    cost: { N: number; r: number; p: number },
    finish: (value: unknown) => void,
  ): void {
    compute(secret, salt, keylen, cost, (error, key) => {
      finish(error === undefined || error === null ? key : { code: 'unavailable' })
    })
  }

  const module: ScryptModule = {
    derive(secret, policy) {
      if (typeof secret !== 'string') return { code: 'invalid_secret' }
      if (typeof policy !== 'function') return { code: 'policy_missing' }
      let verdict: ReturnType<PasswordPolicy>
      try {
        verdict = policy(secret)
      } catch {
        return { code: 'unavailable' }
      }
      if (verdict === null || typeof verdict !== 'object' || typeof verdict.ok !== 'boolean') return { code: 'unavailable' }
      if (!verdict.ok) return { code: 'policy_refused' }
      let salt: Buffer
      try {
        salt = randomBytes(profile.saltBytes)
      } catch {
        return { code: 'unavailable' }
      }
      return admit(jobMemory, finish => {
        runHash(secret, salt, profile.keylen, profile, value => {
          if (value instanceof Uint8Array) {
            finish({
              code: 'material',
              material: encodeMaterial(
                { N: profile.N, r: profile.r, p: profile.p, keylen: profile.keylen },
                salt,
                value,
              ),
            })
            return
          }
          finish({ code: 'unavailable' })
        })
      }) as { code: DeriveRefusal } | Admitted
    },
    verify(material, secret) {
      if (typeof secret !== 'string') return { code: 'unavailable' }
      const decoded = decodeMaterial(material)
      if (decoded === 'mismatch' || decoded === 'unavailable') return { code: decoded }
      if (
        decoded.params.N > profile.N ||
        decoded.params.r > profile.r ||
        decoded.params.p > profile.p ||
        decoded.params.keylen > profile.keylen
      ) {
        return { code: 'unavailable' }
      }
      const cost = memoryBytes(decoded.params)
      if (cost === undefined || cost > jobMemory) return { code: 'unavailable' }
      return admit(cost, finish => {
        runHash(secret, decoded.salt, decoded.params.keylen, decoded.params, value => {
          if (!(value instanceof Uint8Array) || value.length !== decoded.key.length) {
            finish({ code: 'unavailable' })
            return
          }
          finish({ code: timingSafeEqual(value, decoded.key) ? 'match' : 'mismatch' })
        })
      }) as { code: 'memory_limit' | 'queue_full' | 'stopped' } | Admitted
    },
    async close() {
      stopped = true
      const waiting = queue.splice(0)
      for (const entry of waiting) {
        if (!entry.started && !entry.left) {
          entry.left = true
          entry.settle({ code: 'left_queue' })
        }
      }
      await Promise.all([...active])
      return { code: 'closed' }
    },
  }
  return { ok: true, module }
}
