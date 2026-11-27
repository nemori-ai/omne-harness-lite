import { describe, expect, it } from 'vitest'
import {
  createLoader,
  fiberOf,
  standingOf,
  stepSide,
  UNWANTED,
  type Absent,
  type Outcome,
  type SideEvent,
  type SideState,
} from '@omne-harness/plugin-protocol'

const LACKS: readonly Absent[] = [{ kind: 'port', name: 'store' }]
const waiting = (version: string): SideState => ({ kind: 'waiting', version, lacks: LACKS })
const loading = (version: string, more: object = {}): SideState => ({
  kind: 'loading',
  version,
  next: 'keep',
  ...more,
})
const load = (version: string) => ({ kind: 'load', version }) as const
const unload = (version: string) => ({ kind: 'unload', version }) as const
const LACKING: SideEvent = { kind: 'lacking', lacks: LACKS }
const APPEARED: SideEvent = { kind: 'appeared' }

describe('等着的一份：表动了的时候，与它等的那一样出现的时候', () => {
  it.each([
    ['表里有它，同一版：不变', { kind: 'listed', version: 'v1' }, waiting('v1'), []],
    ['表里没了它：去掉这条记录', { kind: 'unlisted' }, UNWANTED, []],
    [
      '表里是另一版：用新的一版再装',
      { kind: 'listed', version: 'v2' },
      loading('v2'),
      [load('v2')],
    ],
    ['进程重启：再装', { kind: 'restarted' }, loading('v1'), [load('v1')]],
    ['它等的都出现了：用同一版再装', APPEARED, loading('v1'), [load('v1')]],
    ['一次装载的结局到了，而它不在装：不变', { kind: 'done' }, waiting('v1'), []],
  ] as const)('%s', (_, event, state, effects) => {
    expect(stepSide(waiting('v1'), event as SideEvent)).toEqual({ state, effects })
  })

  it.each([
    ['不要', UNWANTED],
    ['在装', loading('v1')],
    ['装上', { kind: 'loaded', version: 'v1' }],
    ['装失败', { kind: 'failed', version: 'v1', reason: 'the file is gone' }],
    ['被底停掉', { kind: 'held', version: 'v1' }],
  ] as const)('%s 的一份不在等：「出现了」什么都不改', (_, state) => {
    expect(stepSide(state as SideState, APPEARED)).toEqual({ state, effects: [] })
  })
})

describe('在途的一次装载的结局是「缺口或点」', () => {
  it('这期间表说留着：等着，记缺的是哪几样；旧的一代卸下', () => {
    expect(stepSide(loading('v2', { over: 'v1' }), LACKING)).toEqual({
      state: { kind: 'waiting', version: 'v2', lacks: LACKS },
      effects: [unload('v1')],
    })
  })

  it('这期间表说没了它：旧的一代卸下，回到不要', () => {
    expect(stepSide(loading('v2', { next: 'unload', over: 'v1' }), LACKING)).toEqual({
      state: UNWANTED,
      effects: [unload('v1')],
    })
  })

  it('这期间表说另一版：去装那一版；旧的一代留到它装完', () => {
    expect(stepSide(loading('v2', { next: { load: 'v3' }, over: 'v1' }), LACKING)).toEqual({
      state: loading('v3', { over: 'v1' }),
      effects: [load('v3')],
    })
  })

  it('没有在途的装载：什么都不改', () => {
    for (const state of [UNWANTED, waiting('v1'), { kind: 'loaded', version: 'v1' } as const])
      expect(stepSide(state, LACKING)).toEqual({ state, effects: [] })
  })
})

describe('等着对底算有了结局，不算要装的', () => {
  it('standingOf：等着的一份不在要装的里面，也不算在装', () => {
    expect(standingOf(new Map([['tidy', waiting('v1') as never]]))).toEqual({
      wanted: new Set(),
      held: new Set(),
      loading: false,
    })
    expect(fiberOf('tidy', 'v1')).toBe('plugin:tidy@v1')
  })
})

describe('回路：缺口的一份等着，出现了再装', () => {
  it('装载答缺口：状态是等着；说「出现了」之后用同一版再装，这次装上', async () => {
    const outcomes: Outcome[] = [
      { kind: 'waiting', lacks: LACKS },
      { kind: 'installed', remove: () => undefined },
    ]
    const installs: string[] = []
    const loader = createLoader({
      install: async listed => {
        installs.push(`${listed.name}@${listed.version}`)
        return outcomes.shift() as Outcome
      },
    })
    loader.converge([{ name: 'tidy', version: 'v1', members: [] }])
    await loader.idle()
    expect(loader.states().get('tidy')).toEqual({ kind: 'waiting', version: 'v1', lacks: LACKS })
    loader.appeared('tidy')
    await loader.idle()
    expect(loader.states().get('tidy')).toEqual({ kind: 'loaded', version: 'v1' })
    expect(installs).toEqual(['tidy@v1', 'tidy@v1'])
  })

  it('对一份不在等的说「出现了」：不重装', async () => {
    const installs: string[] = []
    const loader = createLoader({
      install: async listed => {
        installs.push(listed.name)
        return { kind: 'installed', remove: () => undefined }
      },
    })
    loader.converge([{ name: 'tidy', version: 'v1', members: [] }])
    await loader.idle()
    loader.appeared('tidy')
    loader.appeared('nobody')
    await loader.idle()
    expect(installs).toEqual(['tidy'])
  })
})
