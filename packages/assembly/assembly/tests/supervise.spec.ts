import { describe, expect, it } from 'vitest'
import {
  beginSupervision,
  supervise,
  type Supervision,
  type SuperviseEvent,
  type SuperviseStep,
} from '../src/index.ts'

const config = { fallLimit: 2, backoffBaseMs: 500, backoffMaxMs: 5000 }
const exited = (code: number | null): SuperviseEvent => ({ kind: 'exited', code })
const run = (events: readonly SuperviseEvent[], from = beginSupervision().state): SuperviseStep =>
  events.reduce<SuperviseStep>((step, event) => supervise(step.state, event, config), {
    state: from,
    actions: [],
  })

const running = (falls = 0): Supervision => ({ kind: 'running', falls })
const waiting = (falls = 0): Supervision => ({ kind: 'waiting', falls })
const stopping: Supervision = { kind: 'stopping' }
const stopped = (code: number | null = 0): Supervision => ({ kind: 'stopped', code })
const held = (
  reason: 'configuration' | 'fall-limit',
  code: number | null,
  falls: number,
): Supervision => ({
  kind: 'held',
  reason,
  code,
  falls,
})

describe('监督者：开始', () => {
  it('一开始就拉起一次', () => {
    expect(beginSupervision()).toEqual({ state: running(), actions: [{ kind: 'start' }] })
  })
})

describe('监督者：每个退出码怎样处置', () => {
  it('0：有计划的退出，立刻拉起，不算倒下', () => {
    expect(supervise(running(1), exited(0), config)).toEqual({
      state: running(1),
      actions: [{ kind: 'start' }],
    })
  })

  it('2：配置错，不拉，停下并写明', () => {
    expect(supervise(running(), exited(2), config)).toEqual({
      state: held('configuration', 2, 0),
      actions: [{ kind: 'give-up', reason: 'configuration', code: 2 }],
    })
  })

  it('5：起来过，只是关闭没有收完：带退避拉起，不算倒下', () => {
    expect(supervise(running(1), exited(5), config)).toEqual({
      state: waiting(1),
      actions: [{ kind: 'wait', ms: 500 }],
    })
  })

  it.each([1, 3, 4, null, 137])('%s：带退避拉起，算一次倒下', code => {
    expect(supervise(running(), exited(code), config)).toEqual({
      state: waiting(1),
      actions: [{ kind: 'wait', ms: 500 }],
    })
  })

  it('连着倒下到上限：停下并写明，不再拉', () => {
    expect(supervise(running(1), exited(3), config)).toEqual({
      state: held('fall-limit', 3, 2),
      actions: [{ kind: 'give-up', reason: 'fall-limit', code: 3 }],
    })
  })

  it('起稳了：倒下的次数从头算', () => {
    expect(supervise(running(1), { kind: 'settled' }, config)).toEqual({
      state: running(0),
      actions: [],
    })
    expect(run([exited(1), { kind: 'waited' }, { kind: 'settled' }, exited(1)]).state).toEqual(
      waiting(1),
    )
  })

  it('退避随倒下的次数翻倍，封顶', () => {
    const wide = { ...config, fallLimit: 99 }
    const waits: number[] = []
    let state = beginSupervision().state
    for (let n = 0; n < 6; n += 1) {
      const fell = supervise(state, exited(1), wide)
      waits.push(...fell.actions.flatMap(action => (action.kind === 'wait' ? [action.ms] : [])))
      state = supervise(fell.state, { kind: 'waited' }, wide).state
    }
    expect(waits).toEqual([500, 1000, 2000, 4000, 5000, 5000])
  })
})

describe('监督者：人要停服务，就停监督者', () => {
  it('子进程在跑：让它停，等它退出；之后不再拉，带着它的退出码', () => {
    expect(supervise(running(1), { kind: 'stop' }, config)).toEqual({
      state: stopping,
      actions: [{ kind: 'stop-child' }],
    })
    expect(supervise(stopping, exited(0), config)).toEqual({ state: stopped(0), actions: [] })
    expect(supervise(stopping, exited(3), config)).toEqual({ state: stopped(3), actions: [] })
  })

  it('正在退避：不用等，直接停', () => {
    expect(supervise(waiting(1), { kind: 'stop' }, config)).toEqual({
      state: stopped(null),
      actions: [{ kind: 'cancel-wait' }],
    })
  })

  it('再说一次停：不再让子进程停第二次', () => {
    expect(supervise(stopping, { kind: 'stop' }, config)).toEqual({ state: stopping, actions: [] })
  })
})

describe('监督者的全化表：每个状态下每个事件都有答复', () => {
  const states: Supervision[] = [
    running(0),
    waiting(1),
    stopping,
    held('configuration', 2, 0),
    held('fall-limit', 3, 2),
    stopped(0),
  ]
  const events: SuperviseEvent[] = [
    exited(0),
    exited(1),
    exited(2),
    exited(5),
    exited(null),
    { kind: 'settled' },
    { kind: 'waited' },
    { kind: 'stop' },
  ]
  const told = (step: SuperviseStep): string =>
    `${step.state.kind}${'falls' in step.state ? `(${String(step.state.falls)})` : ''}${step.actions.map(action => ` +${action.kind}`).join('')}`

  it('照表', () => {
    const table = states.map(state => events.map(event => told(supervise(state, event, config))))
    const still = (cell: string): string[] => events.map(() => cell)
    expect(table).toEqual([
      // running(0)
      [
        'running(0) +start',
        'waiting(1) +wait',
        'held(0) +give-up',
        'waiting(0) +wait',
        'waiting(1) +wait',
        'running(0)',
        'running(0)',
        'stopping +stop-child',
      ],
      // waiting(1): no child is up, so no exit and no settling can come; they change nothing
      [
        'waiting(1)',
        'waiting(1)',
        'waiting(1)',
        'waiting(1)',
        'waiting(1)',
        'waiting(1)',
        'running(1) +start',
        'stopped +cancel-wait',
      ],
      // stopping: it waits for the exit and for nothing else
      ['stopped', 'stopped', 'stopped', 'stopped', 'stopped', 'stopping', 'stopping', 'stopping'],
      still('held(0)'),
      still('held(2)'),
      still('stopped'),
    ])
  })

  it('停下了的不再有动作', () => {
    for (const state of [held('configuration', 2, 0), held('fall-limit', 3, 2), stopped(0)])
      for (const event of events)
        expect(supervise(state, event, config)).toEqual({ state, actions: [] })
  })

  it('HeldAfterLimit：不管事件怎样排，没有起稳过就不会倒下超过上限次', () => {
    let seed = 7
    const next = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed / 4294967296
    }
    const sequences = new Set<string>()
    for (let run = 0; run < 2000; run += 1) {
      const limited = { ...config, fallLimit: 1 + Math.floor(next() * 6) }
      let state = beginSupervision().state
      let fallsSinceSettled = 0
      const trace: string[] = [String(limited.fallLimit)]
      for (let turn = 0; turn < 40; turn += 1) {
        const event: SuperviseEvent =
          state.kind === 'waiting'
            ? { kind: 'waited' }
            : next() < 0.15
              ? { kind: 'settled' }
              : exited([0, 1, 3, 4, 5, null][Math.floor(next() * 6)] ?? 1)
        if (state.kind === 'running') {
          if (event.kind === 'settled') fallsSinceSettled = 0
          else if (event.kind === 'exited' && ![0, 2, 5].includes(event.code as number))
            fallsSinceSettled += 1
        }
        trace.push(event.kind === 'exited' ? String(event.code) : event.kind)
        state = supervise(state, event, limited).state
        expect(fallsSinceSettled).toBeLessThanOrEqual(limited.fallLimit)
        if (state.kind === 'held') {
          expect(fallsSinceSettled).toBe(limited.fallLimit)
          break
        }
      }
      sequences.add(trace.join(','))
    }
    console.log(`supervise property: ${String(sequences.size)} distinct event sequences of 2000`)
    expect(sequences.size).toBeGreaterThan(1500)
  })
})
