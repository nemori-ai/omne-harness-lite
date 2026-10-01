// 三条带的转移：进入提醒与处置、处置的滞回、解除、与基线比变差抬到提醒、没有基线标未判。
import { describe, expect, it } from 'vitest'
import { bandOf, compare, judgeIndicator, replay } from '../src/loop/bands.ts'

const lines = { warn: 3, act: 6, release: 2 }

describe('三条带', () => {
  it('不是处置时：到提醒线是提醒，到处置线是处置，线上的值算到线上', () => {
    expect(bandOf(2.9, lines)).toBe('normal')
    expect(bandOf(3, lines)).toBe('warn')
    expect(bandOf(5.9, lines, 'warn')).toBe('warn')
    expect(bandOf(6, lines, 'warn')).toBe('act')
  })

  it('处置之后低于处置线、高于解除线仍是处置', () => {
    expect(bandOf(4, lines, 'act')).toBe('act')
    expect(bandOf(2.1, lines, 'act')).toBe('act')
  })

  it('回落到解除线及以下才解除，解除后按值重新判', () => {
    expect(bandOf(2, lines, 'act')).toBe('normal')
    // 解除线与提醒线相等时，解除后正落在提醒线上。
    expect(bandOf(3, { warn: 3, act: 6, release: 3 }, 'act')).toBe('warn')
  })

  it('重放一串值：处置的滞回跨多次成立，缺数据的跳过', () => {
    expect(replay([7, 4, undefined, 3], lines)).toBe('act')
    expect(replay([7, 4, 1, 3], lines)).toBe('warn')
    expect(replay([], lines)).toBeUndefined()
  })

  it('与基线比变差：带位至少是提醒；绝对线已是处置的不降', () => {
    expect(judgeIndicator({ value: 2, lines, baseline: { enabled: true, value: 1 } })).toEqual({
      band: 'warn',
      comparison: 'worse',
    })
    expect(judgeIndicator({ value: 7, lines, baseline: { enabled: true, value: 1 } })).toEqual({
      band: 'act',
      comparison: 'worse',
    })
    expect(
      judgeIndicator({ value: 5, lines: null, baseline: { enabled: true, value: 5 } }),
    ).toEqual({ band: 'normal', comparison: 'same' })
    expect(
      judgeIndicator({ value: 4, lines: null, baseline: { enabled: true, value: 9 } }),
    ).toEqual({ band: 'normal', comparison: 'better' })
  })

  it('该与基线比却没有基线快照：标未判，不当作没变差；不比基线的指标没有比较项', () => {
    expect(judgeIndicator({ value: 100, lines: null, baseline: { enabled: true } })).toEqual({
      band: 'normal',
      comparison: 'unjudged',
    })
    expect(compare(1, undefined)).toBe('unjudged')
    expect(judgeIndicator({ value: 4, lines, baseline: { enabled: false, value: 0 } })).toEqual({
      band: 'warn',
    })
  })

  it('上一次是处置会带进指标判定', () => {
    expect(
      judgeIndicator({ value: 4, lines, previous: 'act', baseline: { enabled: false } }).band,
    ).toBe('act')
  })
})
