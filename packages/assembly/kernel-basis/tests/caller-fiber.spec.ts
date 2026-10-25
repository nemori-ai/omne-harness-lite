// The lifecycle and failure boundary of `registerInCallerFiber` (SPEC「调用方 fiber 登记辅助」), on a
// real Cordis 4.0.4 Context. The directory under test is a Service whose `register` runs with the
// caller's `this.ctx`, so the effect belongs to the caller fiber and not to the provider fiber.
import { Context, CordisError, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { registerInCallerFiber, type Admission } from '@omne-harness/kernel-basis/cordis'
import { FIBER_STATE, plugin } from './basis-support.ts'

type Registration = Readonly<{ token: string }>
type Entry = Readonly<{ key: string; registration: Registration }>
type Failure = Readonly<{ kind: 'conflict' | 'denied' }>

/** A directory that records every call of `admit` and `withdrawal`, keyed by the entry. */
class ProbeDirectory extends Service {
  readonly entries = new Map<string, Entry>()
  readonly admits: string[] = []
  readonly withdrawals: Entry[] = []
  /** What the next `register` of a key returns when the key is free; `entered` by default. */
  decide: (key: string, dropEffect: () => void) => Admission<Entry, Failure> | null = () => null
  onWithdraw: (entry: Entry) => void = () => undefined

  constructor(ctx: Context) {
    super(ctx, 'probeDirectory')
  }

  register(key: string) {
    return registerInCallerFiber<Entry, Failure>(
      this.ctx,
      dropEffect => {
        this.admits.push(key)
        const decided = this.decide(key, dropEffect)
        if (decided !== null) return decided
        const held = this.entries.get(key)
        if (held !== undefined) return { kind: 'recognised', registration: held.registration }
        const entry: Entry = Object.freeze({ key, registration: Object.freeze({ token: key }) })
        this.entries.set(key, entry)
        return { kind: 'entered', entry }
      },
      entry => {
        this.withdrawals.push(entry)
        this.onWithdraw(entry)
        if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key)
      },
    )
  }
}

async function world() {
  const root = new Context()
  const providerFiber = await root.plugin(ProbeDirectory)
  const directory = root.get('probeDirectory') as ProbeDirectory
  return { root, providerFiber, directory }
}

/** Loads a caller plugin whose body runs `work` with its own ctx. */
async function caller(root: Context, work: (ctx: Context) => void) {
  return root.plugin(plugin('caller', (ctx: Context) => work(ctx), ['probeDirectory']))
}

const dir = (ctx: Context) => ctx.get('probeDirectory') as ProbeDirectory

describe('the three admissions keep the original objects', () => {
  it('entered returns the entry registration object itself and keeps exactly one effect', async () => {
    const { root, directory } = await world()
    let outcome: ReturnType<ProbeDirectory['register']> | undefined
    let effectsBefore = 0
    let effectsAfter = 0
    const fiber = await caller(root, ctx => {
      effectsBefore = ctx.fiber.getEffects().length
      outcome = dir(ctx).register('a')
      effectsAfter = ctx.fiber.getEffects().length
    })
    expect(outcome).toBeDefined()
    expect(outcome && 'ok' in outcome && outcome.ok).toBe(directory.entries.get('a')?.registration)
    expect(effectsAfter - effectsBefore).toBe(1)
    expect(directory.admits).toEqual(['a'])
    expect(directory.withdrawals).toEqual([])
    await fiber.dispose()
  })

  it('recognised returns the original registration, calls no withdrawal and leaves no effect', async () => {
    const { root, directory } = await world()
    const seen: unknown[] = []
    let effectsAfterFirst = 0
    let effectsAfterSecond = 0
    const fiber = await caller(root, ctx => {
      seen.push(dir(ctx).register('a'))
      effectsAfterFirst = ctx.fiber.getEffects().length
      seen.push(dir(ctx).register('a'))
      effectsAfterSecond = ctx.fiber.getEffects().length
    })
    const [first, second] = seen as [{ ok: Registration }, { ok: Registration }]
    expect(second.ok).toBe(first.ok)
    expect(effectsAfterSecond).toBe(effectsAfterFirst)
    expect(directory.admits).toEqual(['a', 'a'])
    expect(directory.withdrawals).toEqual([])
    await fiber.dispose()
    expect(directory.withdrawals).toHaveLength(1)
  })

  it('refused returns the original failure object, calls no withdrawal and leaves no effect', async () => {
    const { root, directory } = await world()
    const failure: Failure = Object.freeze({ kind: 'denied' })
    directory.decide = () => ({ kind: 'refused', failure })
    let outcome: ReturnType<ProbeDirectory['register']> | undefined
    let effectsBefore = 0
    let effectsAfter = 0
    const fiber = await caller(root, ctx => {
      effectsBefore = ctx.fiber.getEffects().length
      outcome = dir(ctx).register('a')
      effectsAfter = ctx.fiber.getEffects().length
    })
    expect(outcome && 'failure' in outcome && outcome.failure).toBe(failure)
    expect(effectsAfter).toBe(effectsBefore)
    expect(directory.withdrawals).toEqual([])
    await fiber.dispose()
    expect(directory.withdrawals).toEqual([])
  })
})

describe('admit runs synchronously once, or not at all', () => {
  it('runs admit exactly once before the function returns', async () => {
    const { root, directory } = await world()
    let admitsAtReturn = 0
    const fiber = await caller(root, ctx => {
      dir(ctx).register('a')
      admitsAtReturn = directory.admits.length
    })
    expect(admitsAtReturn).toBe(1)
    await fiber.dispose()
    expect(directory.admits).toHaveLength(1)
  })

  it('runs admit zero times and throws INACTIVE_EFFECT when the caller fiber is unloading', async () => {
    const { root, directory } = await world()
    let thrown: unknown
    const fiber = await caller(root, ctx => {
      ctx.effect(() => () => {
        try {
          dir(ctx).register('late')
        } catch (error) {
          thrown = error
        }
      })
    })
    await fiber.dispose()
    expect(thrown).toBeInstanceOf(CordisError)
    expect((thrown as CordisError).code).toBe('INACTIVE_EFFECT')
    expect(directory.admits).toEqual([])
    expect(directory.entries.size).toBe(0)
  })
})

describe('dropEffect belongs to this call and withdraws once', () => {
  it('executes an early drop requested inside admit before returning, and still returns entered', async () => {
    const { root, directory } = await world()
    directory.decide = (key, dropEffect) => {
      const entry: Entry = Object.freeze({ key, registration: Object.freeze({ token: key }) })
      directory.entries.set(key, entry)
      dropEffect()
      expect(directory.withdrawals).toEqual([])
      return { kind: 'entered', entry }
    }
    let outcome: ReturnType<ProbeDirectory['register']> | undefined
    let withdrawalsAtReturn = 0
    let effectsBefore = 0
    let effectsAfter = 0
    const fiber = await caller(root, ctx => {
      effectsBefore = ctx.fiber.getEffects().length
      outcome = dir(ctx).register('a')
      withdrawalsAtReturn = directory.withdrawals.length
      effectsAfter = ctx.fiber.getEffects().length
    })
    expect(outcome && 'ok' in outcome && outcome.ok).toEqual({ token: 'a' })
    expect(withdrawalsAtReturn).toBe(1)
    expect(effectsAfter).toBe(effectsBefore)
    await fiber.dispose()
    expect(directory.withdrawals).toHaveLength(1)
  })

  it('withdraws once under repeated, re-entrant drops and a later fiber disposal', async () => {
    const { root, directory } = await world()
    let drop: (() => void) | undefined
    directory.decide = (key, dropEffect) => {
      drop = dropEffect
      return null
    }
    directory.onWithdraw = () => drop?.()
    const fiber = await caller(root, ctx => {
      dir(ctx).register('a')
    })
    drop?.()
    drop?.()
    expect(directory.withdrawals).toHaveLength(1)
    expect(fiber.getEffects().map(effect => effect.label)).not.toContain('registerInCallerFiber')
    await fiber.dispose()
    drop?.()
    expect(directory.withdrawals).toHaveLength(1)
    expect(fiber.state as number).toBe(FIBER_STATE.DISPOSED)
  })

  it('withdraws once when the fiber disposal comes first and a drop later', async () => {
    const { root, directory } = await world()
    let drop: (() => void) | undefined
    directory.decide = (key, dropEffect) => {
      drop = dropEffect
      return null
    }
    const fiber = await caller(root, ctx => {
      dir(ctx).register('a')
    })
    await fiber.dispose()
    expect(directory.withdrawals).toHaveLength(1)
    drop?.()
    expect(directory.withdrawals).toHaveLength(1)
  })

  it('requests only its own remover when an early drop and the caller unload start together inside admit on an active fiber', async () => {
    const { root, directory } = await world()
    let callerCtx: Context | undefined
    const fiber = await caller(root, ctx => {
      callerCtx = ctx
    })
    expect(fiber.state as number).toBe(FIBER_STATE.ACTIVE)
    let unloading: Promise<void> | undefined
    let drop: (() => void) | undefined
    directory.decide = (_key, dropEffect) => {
      drop = dropEffect
      // The unload starts now and takes the fiber's effects, this one included, before the
      // remover of this call exists; the early drop is only recorded.
      unloading = fiber.dispose()
      expect(fiber.state as number).toBe(FIBER_STATE.UNLOADING)
      dropEffect()
      return null
    }
    const outcome = dir(callerCtx as Context).register('a')
    expect('ok' in outcome && outcome.ok).toEqual({ token: 'a' })
    // The function requested its own remover once; the started unload completes after it returned.
    expect(directory.withdrawals).toHaveLength(1)
    await unloading
    expect(fiber.state as number).toBe(FIBER_STATE.DISPOSED)
    expect(directory.withdrawals).toHaveLength(1)
    drop?.()
    expect(directory.withdrawals).toHaveLength(1)
    expect(directory.entries.size).toBe(0)
  })

  it('withdraws once when an early drop and a caller unload requested during its load meet inside admit', async () => {
    const { root, directory } = await world()
    let unloading: Promise<void> | undefined
    let outcome: ReturnType<ProbeDirectory['register']> | undefined
    const fiber = await caller(root, ctx => {
      directory.decide = (_key, dropEffect) => {
        // The fiber is still loading: Cordis defers the unload until the load step ends.
        unloading = ctx.fiber.dispose()
        dropEffect()
        return null
      }
      outcome = dir(ctx).register('a')
    })
    expect(outcome && 'ok' in outcome && outcome.ok).toEqual({ token: 'a' })
    await unloading
    expect(fiber.state as number).toBe(FIBER_STATE.DISPOSED)
    expect(directory.withdrawals).toHaveLength(1)
    expect(directory.entries.size).toBe(0)
  })

  it('keeps the number of retained effects bounded when a fiber registers and drops again and again', async () => {
    const { root, directory } = await world()
    const drops: (() => void)[] = []
    directory.decide = (_key, dropEffect) => {
      drops.push(dropEffect)
      return null
    }
    let baseline = 0
    let afterRounds = 0
    const fiber = await caller(root, ctx => {
      baseline = ctx.fiber.getEffects().length
      for (let round = 0; round < 64; round += 1) {
        dir(ctx).register(`k${round}`)
        drops[round]?.()
      }
      afterRounds = ctx.fiber.getEffects().length
    })
    expect(afterRounds).toBe(baseline)
    expect(directory.withdrawals).toHaveLength(64)
    expect(directory.entries.size).toBe(0)
    await fiber.dispose()
    expect(directory.withdrawals).toHaveLength(64)
  })
})

describe('exceptions take their actual channel', () => {
  it('propagates an exception thrown by admit, withdraws nothing and leaves no effect', async () => {
    const { root, directory } = await world()
    const boom = new Error('admit failed')
    directory.decide = () => {
      throw boom
    }
    let thrown: unknown
    let effectsBefore = 0
    let effectsAfter = 0
    const fiber = await caller(root, ctx => {
      effectsBefore = ctx.fiber.getEffects().length
      try {
        dir(ctx).register('a')
      } catch (error) {
        thrown = error
      }
      effectsAfter = ctx.fiber.getEffects().length
    })
    expect(thrown).toBe(boom)
    expect(effectsAfter).toBe(effectsBefore)
    expect(directory.withdrawals).toEqual([])
    expect(fiber.state as number).toBe(FIBER_STATE.ACTIVE)
    await fiber.dispose()
  })

  it('propagates an exception of withdrawal through an explicit drop, and logs it on fiber unload', async () => {
    const { root, directory } = await world()
    const logged: unknown[] = []
    root.logger.exporter({
      export(message) {
        logged.push(message)
      },
    })
    let drop: (() => void) | undefined
    directory.decide = (_key, dropEffect) => {
      drop = dropEffect
      return null
    }
    const boom = new Error('withdrawal failed')
    directory.onWithdraw = () => {
      throw boom
    }
    const explicit = await caller(root, ctx => {
      dir(ctx).register('explicit')
    })
    expect(() => drop?.()).toThrow(boom)
    expect(directory.withdrawals).toHaveLength(1)
    await explicit.dispose()
    expect(directory.withdrawals).toHaveLength(1)

    const unloaded = await caller(root, ctx => {
      dir(ctx).register('unloaded')
    })
    await expect(unloaded.dispose()).resolves.toBeUndefined()
    expect(unloaded.state as number).toBe(FIBER_STATE.DISPOSED)
    expect(directory.withdrawals).toHaveLength(2)
    expect(logged.length).toBeGreaterThan(0)
  })
})

describe('the effect belongs to the caller fiber, not the provider fiber', () => {
  it('withdraws with the caller and leaves the provider active with its effects unchanged', async () => {
    const { root, providerFiber, directory } = await world()
    const providerEffects = providerFiber.getEffects().length
    const fiber = await caller(root, ctx => {
      dir(ctx).register('a')
    })
    expect(fiber.getEffects().map(effect => effect.label)).toContain('registerInCallerFiber')
    expect(providerFiber.getEffects().length).toBe(providerEffects)
    expect(directory.entries.has('a')).toBe(true)
    await fiber.dispose()
    expect(directory.entries.has('a')).toBe(false)
    expect(directory.withdrawals).toHaveLength(1)
    expect(providerFiber.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(providerFiber.getEffects().length).toBe(providerEffects)
  })

  it('does not share an entered contribution across fibers: the second caller is recognised only by its own fiber', async () => {
    const { root, directory } = await world()
    const first = await caller(root, ctx => {
      dir(ctx).register('a')
    })
    const outcomes: unknown[] = []
    const second = await root.plugin(
      plugin(
        'second-caller',
        (ctx: Context) => {
          outcomes.push(dir(ctx).register('a'))
        },
        ['probeDirectory'],
      ),
    )
    // The probe directory recognises by key only; the helper leaves no effect on the second fiber.
    expect(second.getEffects().map(effect => effect.label)).not.toContain('registerInCallerFiber')
    await second.dispose()
    expect(directory.entries.has('a')).toBe(true)
    await first.dispose()
    expect(directory.entries.has('a')).toBe(false)
    expect(outcomes).toHaveLength(1)
  })
})
