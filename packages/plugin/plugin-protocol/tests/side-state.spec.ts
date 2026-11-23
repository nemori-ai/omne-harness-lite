import { describe, expect, it } from 'vitest'
import { stepSide, UNWANTED, type SideEvent, type SideState } from '@omne-harness/plugin-protocol'

const loading = (
  version: string,
  more: Partial<Extract<SideState, { kind: 'loading' }>> = {},
): SideState => ({
  kind: 'loading',
  version,
  next: 'keep',
  ...more,
})
const loaded = (version: string): SideState => ({ kind: 'loaded', version })
const failed = (version: string): SideState => ({
  kind: 'failed',
  version,
  reason: 'the file is gone',
})
const held = (version: string): SideState => ({ kind: 'held', version })

const listed = (version: string): SideEvent => ({ kind: 'listed', version })
const UNLISTED: SideEvent = { kind: 'unlisted' }
const RESTARTED: SideEvent = { kind: 'restarted' }
const load = (version: string) => ({ kind: 'load', version }) as const
const unload = (version: string) => ({ kind: 'unload', version }) as const

describe('one plugin on one side: every state under every thing that happens to the list', () => {
  it.each([
    ['unwanted, listed', UNWANTED, listed('v1'), loading('v1'), [load('v1')]],
    ['unwanted, unlisted', UNWANTED, UNLISTED, UNWANTED, []],
    ['unwanted, restarted', UNWANTED, RESTARTED, UNWANTED, []],
    ['loading, listed the same', loading('v1'), listed('v1'), loading('v1'), []],
    ['loading, unlisted', loading('v1'), UNLISTED, loading('v1', { next: 'unload' }), []],
    [
      'loading, another version',
      loading('v1'),
      listed('v2'),
      loading('v1', { next: { load: 'v2' } }),
      [],
    ],
    ['loading, restarted', loading('v1'), RESTARTED, loading('v1'), [load('v1')]],
    ['loaded, listed the same', loaded('v1'), listed('v1'), loaded('v1'), []],
    ['loaded, unlisted', loaded('v1'), UNLISTED, UNWANTED, [unload('v1')]],
    [
      'loaded, another version',
      loaded('v1'),
      listed('v2'),
      loading('v2', { over: 'v1' }),
      [load('v2')],
    ],
    ['loaded, restarted', loaded('v1'), RESTARTED, loading('v1'), [load('v1')]],
    ['failed, listed the same', failed('v1'), listed('v1'), failed('v1'), []],
    ['failed, unlisted', failed('v1'), UNLISTED, UNWANTED, []],
    ['failed, another version', failed('v1'), listed('v2'), loading('v2'), [load('v2')]],
    ['failed, restarted', failed('v1'), RESTARTED, loading('v1'), [load('v1')]],
    ['held, listed the same', held('v1'), listed('v1'), held('v1'), []],
    ['held, unlisted', held('v1'), UNLISTED, UNWANTED, []],
    ['held, another version', held('v1'), listed('v2'), loading('v2'), [load('v2')]],
    ['held, restarted', held('v1'), RESTARTED, held('v1'), []],
  ] as const)('%s', (_name, state, event, next, effects) => {
    expect(stepSide(state, event)).toStrictEqual({ state: next, effects })
  })
})

describe('one plugin on one side: when the load in flight ends', () => {
  const DONE: SideEvent = { kind: 'done' }
  const BROKE: SideEvent = { kind: 'broke', reason: 'the file is gone' }

  it.each([
    ['done, kept', loading('v1'), DONE, loaded('v1'), []],
    ['done, over an older one', loading('v2', { over: 'v1' }), DONE, loaded('v2'), [unload('v1')]],
    [
      'done, but unlisted meanwhile',
      loading('v1', { next: 'unload' }),
      DONE,
      UNWANTED,
      [unload('v1')],
    ],
    [
      'done, but another version came meanwhile',
      loading('v1', { next: { load: 'v2' } }),
      DONE,
      loading('v2', { over: 'v1' }),
      [load('v2')],
    ],
    [
      'done over an older one, but unlisted meanwhile: both generations go',
      loading('v2', { next: 'unload', over: 'v1' }),
      DONE,
      UNWANTED,
      [unload('v2'), unload('v1')],
    ],
    [
      'done over an older one, but a third version came meanwhile: the oldest goes, the one just loaded stays until the third is in',
      loading('v2', { next: { load: 'v3' }, over: 'v1' }),
      DONE,
      loading('v3', { over: 'v2' }),
      [unload('v1'), load('v3')],
    ],
    ['broke, kept', loading('v1'), BROKE, failed('v1'), []],
    [
      'broke, over an older one: the older one is not on the list any more',
      loading('v2', { over: 'v1' }),
      BROKE,
      failed('v2'),
      [unload('v1')],
    ],
    [
      'broke, but unlisted meanwhile',
      loading('v1', { next: 'unload', over: 'v0' }),
      BROKE,
      UNWANTED,
      [unload('v0')],
    ],
    [
      'broke, but another version came meanwhile',
      loading('v1', { next: { load: 'v2' }, over: 'v0' }),
      BROKE,
      loading('v2', { over: 'v0' }),
      [load('v2')],
    ],
    ['the floor holds it', loading('v1'), { kind: 'held' }, held('v1'), []],
    [
      'the floor holds it, over an older one',
      loading('v2', { over: 'v1' }),
      { kind: 'held' },
      held('v2'),
      [unload('v1')],
    ],
    [
      'the floor holds it, but unlisted meanwhile',
      loading('v1', { next: 'unload' }),
      { kind: 'held' },
      UNWANTED,
      [],
    ],
    [
      'the floor holds it, but another version came meanwhile: that one is loaded',
      loading('v1', { next: { load: 'v2' } }),
      { kind: 'held' },
      loading('v2'),
      [load('v2')],
    ],
  ] as const)('%s', (_name, state, event, next, effects) => {
    expect(stepSide(state, event)).toStrictEqual({ state: next, effects })
  })

  it.each([UNWANTED, loaded('v1'), failed('v1'), held('v1')])(
    'nothing is in flight in %j: an ending changes nothing',
    state => {
      for (const event of [DONE, BROKE, { kind: 'held' }] as const)
        expect(stepSide(state, event)).toEqual({ state, effects: [] })
    },
  )

  it('listed again with the same version while it was to be unloaded: it is kept', () => {
    expect(stepSide(loading('v1', { next: 'unload' }), listed('v1'))).toEqual({
      state: loading('v1'),
      effects: [],
    })
    expect(stepSide(loading('v1', { next: { load: 'v2' } }), listed('v1'))).toEqual({
      state: loading('v1'),
      effects: [],
    })
  })

  it('restarted while another version or an unload was to follow: what the list last said is what is loaded', () => {
    expect(stepSide(loading('v1', { next: { load: 'v2' }, over: 'v0' }), RESTARTED)).toEqual({
      state: loading('v2'),
      effects: [load('v2')],
    })
    expect(stepSide(loading('v1', { next: 'unload', over: 'v0' }), RESTARTED)).toEqual({
      state: UNWANTED,
      effects: [],
    })
  })
})
