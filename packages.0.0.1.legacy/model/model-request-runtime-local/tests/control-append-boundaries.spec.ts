import { appendControlRecord } from '@omne-harness-lite/session-runtime-local'
import { describe, expect, it } from 'vitest'
import type { AppendResult } from '@omne-harness-lite/session-log'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type { ControlAppendInput } from '@omne-harness-lite/model-request-runtime'
import { controlled, deferred } from './settlement-fixture.ts'

type AppendFault =
  | 'none'
  | 'start'
  | 'start-release'
  | 'track'
  | 'completion'
  | 'unknown'
  | 'stop'
  | 'release'
  | 'retain'
  | 'untrack'
  | 'retain-untrack'
  | 'admission-after-acquire'
  | 'before-start-reject'

async function withAppend(
  fault: AppendFault,
  work: (fixture: {
    readonly input: ControlAppendInput
    readonly trace: string[]
    readonly errors: {
      readonly start: object
      readonly release: object
      readonly track: object
      readonly completion: object
      readonly retain: object
      readonly untrack: object
      readonly stop: object
    }
    readonly retained: {
      readonly registration: SettlementRegistration
      readonly task: SettlementTask<AppendResult>
    }[]
    readonly owner: Parameters<Parameters<typeof controlled>[1]>[0]['owner']
    readonly stopped: ReturnType<typeof deferred<void>>
    readonly actual: () => {
      readonly registration: SettlementRegistration
      readonly task: SettlementTask<unknown>
    }
    readonly submissions: Parameters<Parameters<typeof controlled>[1]>[0]['submissions']
  }) => Promise<void>,
): Promise<void> {
  await controlled(`p6-control-${fault}`, async ({ binding, owner, submissions, wrap }) => {
    const errors = {
      start: {},
      release: {},
      track: {},
      completion: {},
      retain: {},
      untrack: {},
      stop: {},
    }
    const trace: string[] = []
    const retained: { registration: SettlementRegistration; task: SettlementTask<AppendResult> }[] =
      []
    const stopped = deferred<void>()
    let realRegistration: SettlementRegistration | undefined
    let originalRegistration: SettlementRegistration | undefined
    let originalTask: SettlementTask<unknown> | undefined
    let realTask: SettlementTask<unknown> | undefined
    const port: SettlementOwner = {
      name: owner.name,
      admission: () => owner.admission(),
      opened: () => owner.opened(),
      unresolvedWrites: () => owner.unresolvedWrites(),
      acquire(limit) {
        trace.push('acquire')
        const grant = owner.acquire(limit)
        if ('unavailable' in grant) return grant
        realRegistration = grant.registration
        const real = grant.registration
        const registration: SettlementRegistration = {
          start<T>(
            kind: Parameters<SettlementRegistration['start']>[0],
            operation: (signal: AbortSignal) => Promise<T>,
          ): SettlementTask<T> {
            trace.push('start')
            if (fault === 'start' || fault === 'start-release') throw errors.start
            if (fault === 'before-start-reject') {
              const task: SettlementTask<T> = {
                completion: Promise.reject(errors.completion),
                stopped: stopped.promise,
                requestStop() {
                  trace.push('stop')
                },
              }
              originalTask = task
              return task
            }
            const task = real.start(kind, operation)
            realTask = task
            const observed: SettlementTask<T> = {
              completion: task.completion,
              stopped: task.stopped.then(() => {
                trace.push('stopped')
                if (fault === 'stop') throw errors.stop
              }),
              requestStop() {
                trace.push('stop')
                task.requestStop()
              },
            }
            observed.stopped.catch(() => {})
            originalTask = observed
            return observed
          },
          release() {
            trace.push('release')
            if (fault === 'release' || fault === 'start-release') throw errors.release
            real.release()
          },
        }
        originalRegistration = registration
        if (fault === 'admission-after-acquire') owner.state = 'closed'
        return { registration }
      },
    }
    const log = {
      readSince: binding.log.readSince,
      readByKey: binding.log.readByKey,
      async append(...args: Parameters<typeof binding.log.append>): Promise<AppendResult> {
        trace.push('append')
        if (fault === 'completion') throw errors.completion
        const result = await binding.log.append(...args)
        if (fault === 'unknown' || fault === 'retain' || fault === 'retain-untrack')
          return { failure: 'unavailable' }
        return result
      },
    }
    const input: ControlAppendInput = {
      binding: wrap(log),
      owner: port,
      concurrent: 1,
      record: { kind: 'model_call_interrupt_intent', call: 'call', initiator: 'user' },
      retainUnknown(registration, task) {
        expect(this).toBe(input)
        trace.push('retain')
        retained.push({ registration, task })
        if (fault === 'retain' || fault === 'retain-untrack') throw errors.retain
      },
      trackTask(task) {
        expect(this).toBe(input)
        expect(task).toBe(originalTask)
        trace.push('track')
        if (fault === 'track') throw errors.track
        return () => {
          trace.push('untrack')
          if (fault === 'untrack' || fault === 'retain-untrack') throw errors.untrack
        }
      },
    }
    try {
      await work({
        input,
        trace,
        errors,
        retained,
        owner,
        stopped,
        submissions,
        actual: () => {
          if (originalRegistration === undefined || originalTask === undefined)
            throw new Error('original task not started')
          return { registration: originalRegistration, task: originalTask }
        },
      })
    } finally {
      stopped.resolve()
      if (realTask !== undefined) await realTask.stopped
      if (owner.active !== 0) realRegistration?.release()
    }
  })
}

describe('original control append task and exception boundaries', () => {
  it.each(['run', 'attempt'] as const)(
    'refuses a half-paired %s before allocating or writing',
    async field => {
      await withAppend('none', async f => {
        const input =
          field === 'run' ? { ...f.input, run: 'controlled-run' } : { ...f.input, attempt: 2 }
        expect(await appendControlRecord(input)).toEqual({ unavailable: true })
        expect(f.trace).toEqual([])
        expect(f.submissions).toHaveLength(1)
        expect(f.owner.active).toBe(0)
      })
    },
  )

  it.each(['closed', 'stale', 'occupied'] as const)(
    'refuses %s before starting a task',
    async refusal => {
      await withAppend('none', async f => {
        if (refusal === 'closed') f.owner.state = 'closed'
        if (refusal === 'stale')
          Object.defineProperty(f.input.binding, 'currentGeneration', {
            value: () => Object.freeze({}),
          })
        if (refusal === 'occupied') Object.defineProperty(f.input, 'concurrent', { value: 0 })
        expect(await appendControlRecord(f.input)).toEqual({ unavailable: true })
        expect(f.trace).toEqual(refusal === 'occupied' ? ['acquire'] : [])
        expect(f.owner.active).toBe(0)
        expect(f.submissions).toHaveLength(1)
      })
    },
  )

  it('preserves stable run and attempt getter reads and the exact single fenced batch', async () => {
    await withAppend('none', async f => {
      const reads: string[] = []
      Object.defineProperties(f.input, {
        run: {
          get() {
            reads.push('run')
            return 'controlled-run'
          },
        },
        attempt: {
          get() {
            reads.push('attempt')
            return 2
          },
        },
      })
      const pending = appendControlRecord(f.input)
      expect(f.trace).toEqual(['acquire', 'start', 'track'])
      expect(f.owner.active).toBe(1)
      expect(await pending).toEqual({ appended: true })
      expect(reads).toEqual([
        'run',
        'attempt',
        'run',
        'run',
        'attempt',
        'run',
        'attempt',
        'run',
        'attempt',
      ])
      expect(f.submissions.at(-1)).toEqual({
        fence: { kind: 'fenced', run: 'controlled-run', attempt: 2 },
        condition: { kind: 'unconditional' },
        count: 1,
      })
      expect(f.trace).toEqual([
        'acquire',
        'start',
        'track',
        'append',
        'stop',
        'stopped',
        'release',
        'untrack',
      ])
      expect(f.owner.active).toBe(0)
    })
  })

  it('refuses changed admission after acquisition inside the original task', async () => {
    await withAppend('admission-after-acquire', async f => {
      expect(await appendControlRecord(f.input)).toEqual({ unavailable: true })
      expect(f.trace).toEqual([
        'acquire',
        'start',
        'track',
        'stop',
        'stopped',
        'release',
        'untrack',
      ])
      expect(f.retained).toEqual([])
      expect(f.submissions).toHaveLength(1)
      expect(f.owner.active).toBe(0)
    })
  })

  it('start failure releases without tracking; a release failure retains its exception priority', async () => {
    await withAppend('start', async f => {
      expect(await appendControlRecord(f.input)).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['acquire', 'start', 'release'])
      expect(f.owner.active).toBe(0)
    })
    await withAppend('start-release', async f => {
      await expect(appendControlRecord(f.input)).rejects.toBe(f.errors.release)
      expect(f.trace).toEqual(['acquire', 'start', 'release'])
      expect(f.retained).toEqual([])
      expect(f.owner.active).toBe(1)
    })
  })

  it('tracker throw remains outside untrack finally and leaves the original task for cleanup', async () => {
    await withAppend('track', async f => {
      await expect(appendControlRecord(f.input)).rejects.toBe(f.errors.track)
      expect(f.trace).toContain('track')
      expect(f.trace).not.toContain('untrack')
      expect(f.trace).not.toContain('release')
      expect(f.retained).toEqual([])
      expect(f.owner.active).toBe(1)
    })
  })

  it.each(['completion', 'unknown'] as const)(
    'retains the exact started task and registration for %s',
    async fault => {
      await withAppend(fault, async f => {
        expect(await appendControlRecord(f.input)).toEqual({ unavailable: true })
        expect(f.retained).toHaveLength(1)
        expect(f.retained[0]?.registration).toBe(f.actual().registration)
        expect(f.retained[0]?.task).toBe(f.actual().task)
        expect(f.trace).not.toContain('release')
        expect(f.trace).not.toContain('stop')
        expect(f.trace.filter(x => x === 'untrack')).toHaveLength(1)
        expect(f.owner.active).toBe(1)
        expect(f.submissions).toHaveLength(fault === 'unknown' ? 2 : 1)
      })
    },
  )

  it('unstarted rejected completion waits for actual stopped before release and untrack', async () => {
    await withAppend('before-start-reject', async f => {
      let finished = false
      const result = appendControlRecord(f.input).then(value => {
        finished = true
        return value
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(f.trace).toEqual(['acquire', 'start', 'track', 'stop'])
      expect(finished).toBe(false)
      expect(f.owner.active).toBe(1)
      f.stopped.resolve()
      expect(await result).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['acquire', 'start', 'track', 'stop', 'release', 'untrack'])
      expect(f.owner.active).toBe(0)
      expect(f.retained).toEqual([])
      expect(f.submissions).toHaveLength(1)
    })
  })

  it('actual-stop failure transfers the original pair without release', async () => {
    await withAppend('stop', async f => {
      expect(await appendControlRecord(f.input)).toEqual({ unavailable: true })
      expect(f.retained[0]?.registration).toBe(f.actual().registration)
      expect(f.retained[0]?.task).toBe(f.actual().task)
      expect(f.owner.active).toBe(1)
      expect(f.trace).not.toContain('release')
      expect(f.trace.at(-1)).toBe('untrack')
    })
  })

  it('a settled release throw returns unavailable without retaining the confirmed append', async () => {
    await withAppend('release', async f => {
      expect(await appendControlRecord(f.input)).toEqual({ unavailable: true })
      expect(f.retained).toEqual([])
      expect(f.trace.indexOf('stopped')).toBeLessThan(f.trace.indexOf('release'))
      expect(f.trace.slice(-2)).toEqual(['release', 'untrack'])
      expect(f.submissions).toHaveLength(2)
      expect(f.owner.active).toBe(1)
    })
  })

  it.each(['retain', 'untrack', 'retain-untrack'] as const)(
    'preserves exact finally exception priority for %s',
    async fault => {
      await withAppend(fault, async f => {
        const error = fault === 'retain' ? f.errors.retain : f.errors.untrack
        await expect(appendControlRecord(f.input)).rejects.toBe(error)
        expect(f.trace.filter(x => x === 'untrack')).toHaveLength(1)
        expect(f.retained).toHaveLength(fault === 'untrack' ? 0 : 1)
        expect(f.owner.active).toBe(fault === 'untrack' ? 0 : 1)
        expect(f.submissions).toHaveLength(2)
      })
    },
  )
})
