import { describe, expect, it } from 'vitest'
import { runTrial, type Mount, type TrialDeps } from '../src/main/page-trial.ts'

const config = { fallLimit: 3, backoffBaseMs: 250, backoffMaxMs: 2000 }
const pointer = (current: string) => ({
  current,
  previous: 'builtin',
  settled: current === 'builtin',
})

function trial(mounts: readonly Mount[], stable: readonly boolean[], back = true) {
  const loads = [...mounts]
  const stays = [...stable]
  const did: string[] = []
  const deps: TrialDeps = {
    watch: async () => loads.shift() ?? 'not-mounted',
    stable: async () => stays.shift() ?? false,
    reload: () => void did.push('reload'),
    after: async ms => void did.push(`wait ${String(ms)}`),
    tell(kind) {
      did.push(kind)
      if (kind === 'settled') return { outcome: 'moved', pointer: pointer('page-2') }
      return back
        ? { outcome: 'rolled-back', pointer: pointer('builtin') }
        : { outcome: 'no-fallback', pointer: pointer('page-2') }
    },
    config,
  }
  return { outcome: runTrial(deps), did }
}

describe('切过去的一版页面在试用中', () => {
  it('渲染出来并稳住了：起稳，记成退路，不重新加载', async () => {
    const run = trial(['mounted'], [true])
    expect(await run.outcome).toEqual({ kind: 'settled' })
    expect(run.did).toEqual(['settled'])
  })

  it('倒下两次之后起稳了：每次倒下退避之后重新加载，不退回', async () => {
    const run = trial(['not-mounted', 'renderer-gone', 'mounted'], [true])
    expect(await run.outcome).toEqual({ kind: 'settled' })
    expect(run.did).toEqual(['wait 250', 'reload', 'wait 500', 'reload', 'settled'])
  })

  it('连着三次没起来：指针退回上一版，写明退回到哪一版；渲染出来却没稳住也算一次', async () => {
    const run = trial(['load-failed', 'mounted', 'not-mounted'], [false])
    expect(await run.outcome).toEqual({ kind: 'went-back', to: 'builtin', falls: 3 })
    expect(run.did).toEqual(['wait 250', 'reload', 'wait 500', 'reload', 'fell-to-limit'])
  })

  it('到上限而没有退路：停下，不再重新加载', async () => {
    const run = trial(['not-mounted', 'not-mounted', 'not-mounted'], [], false)
    expect(await run.outcome).toEqual({ kind: 'no-fallback' })
    expect(run.did.filter(each => each === 'reload')).toHaveLength(2)
  })

  it('指针这时已经指着别的一版：起稳与到上限都不算在它头上', async () => {
    const superseded = { outcome: 'superseded', pointer: pointer('page-3') } as const
    const base = {
      stable: async () => true,
      reload: () => undefined,
      after: async () => undefined,
      tell: () => superseded,
      config,
    }
    expect(await runTrial({ ...base, watch: async () => 'mounted' })).toEqual({
      kind: 'superseded',
    })
    expect(await runTrial({ ...base, watch: async () => 'not-mounted' })).toEqual({
      kind: 'superseded',
    })
  })

  it('说退回了却没有给出退回到哪一版：照没有退路停下', async () => {
    const outcome = await runTrial({
      watch: async () => 'not-mounted',
      stable: async () => false,
      reload: () => undefined,
      after: async () => undefined,
      tell: () => ({ outcome: 'rolled-back', pointer: null }),
      config,
    })
    expect(outcome).toEqual({ kind: 'no-fallback' })
  })

  it('窗口关了：试用到此为止，什么都不告诉指针', async () => {
    const run = trial(['not-mounted', 'closed'], [])
    expect(await run.outcome).toEqual({ kind: 'closed' })
    expect(run.did).toEqual(['wait 250', 'reload'])
  })
})
