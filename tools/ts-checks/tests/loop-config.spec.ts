// 回路配置：仓库里那一份读得进来且是简报给的初值；缺项、类型不对、线的次序不对、多出认不出的项都报错，不悄悄用默认。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOOP_CONFIG_PATH, parseLoopConfig, readLoopConfig } from '../src/loop/config.ts'

const raw = (): Record<string, unknown> => JSON.parse(readFileSync(LOOP_CONFIG_PATH, 'utf8'))

describe('回路配置', () => {
  it('仓库里那一份：读得进来，初值与起步表一致', () => {
    const config = readLoopConfig()
    expect(config.primaryBranch).toBe('main')
    expect(config.relapseLimit).toBe(2)
    expect(config.explainTop).toBe(10)
    expect(config.indicators.redMembers).toEqual({ lines: null, baseline: true })
    expect(config.indicators.functionsOverAlert).toEqual({ lines: null, baseline: true })
    expect(config.indicators.newEdges).toEqual({ lines: null, baseline: false })
    expect(config.indicators.duplicationPercent.lines).toEqual({ warn: 3, act: 6, release: 2 })
    expect(config.memberBudget.risk).toEqual({ warn: 20, act: 23, release: 18 })
    expect(config.budgetExcludeGroups).toEqual(['examples'])
    expect(config.sensors.cochange).toEqual({
      enabled: true,
      window: 300,
      maxMembersPerCommit: 8,
      minTogether: 4,
      minRatio: 0.6,
    })
    expect(config.sensors.assertions.assertionPattern.test('expectTypeOf')).toBe(true)
    expect(config.sensors.assertions.helperPattern).toBeUndefined()
    expect(config.health).toEqual({ weeks: 8, commits: 50, runs: 10 })
    expect(config.hook).toEqual({
      enabled: true,
      maxItems: 12,
      maxChars: 4000,
      timeoutSeconds: 40,
      stateLimit: 200,
    })
  })

  it('缺项、类型不对、线的次序不对、多出认不出的项：报错并点名', () => {
    const without = (mutate: (value: Record<string, unknown>) => void) => {
      const value = raw()
      mutate(value)
      return () => parseLoopConfig(value)
    }
    expect(without(value => delete value['relapseLimit'])).toThrow('relapseLimit')
    expect(
      without(value => {
        ;(value['indicators'] as Record<string, unknown>)['redMembers'] = {
          lines: { warn: 3, act: 1, release: 0 },
          baseline: true,
        }
      }),
    ).toThrow('release ≤ warn ≤ act')
    expect(
      without(value => {
        ;(value['indicators'] as Record<string, unknown>)['typo'] = { lines: null, baseline: true }
      }),
    ).toThrow('认不出的项：typo')
    expect(
      without(value => {
        delete (value['memberBudget'] as Record<string, unknown>)['risk']
      }),
    ).toThrow('memberBudget 缺 risk')
    expect(
      without(value => {
        delete (value['memberBudget'] as Record<string, unknown>)['excludeGroups']
      }),
    ).toThrow('memberBudget.excludeGroups')
    expect(
      without(value => {
        const sensors = value['sensors'] as Record<string, Record<string, unknown>>
        if (sensors['duplication'] !== undefined) sensors['duplication']['enabled'] = 'yes'
      }),
    ).toThrow('sensors.duplication.enabled')
    expect(
      without(value => {
        const sensors = value['sensors'] as Record<string, Record<string, unknown>>
        if (sensors['assertions'] !== undefined) sensors['assertions']['assertionPattern'] = '('
      }),
    ).toThrow('不是合法的正则表达式')
    expect(without(value => delete value['health'])).toThrow('health 须为对象')
    expect(
      without(value => {
        ;(value['health'] as Record<string, unknown>)['weeks'] = 0
      }),
    ).toThrow('health.weeks 须为正整数')
    expect(
      without(value => {
        ;(value['health'] as Record<string, unknown>)['week'] = 8
      }),
    ).toThrow('health 里有认不出的项：week')
    expect(without(value => delete value['hook'])).toThrow('hook 须为对象')
    expect(
      without(value => {
        ;(value['hook'] as Record<string, unknown>)['timeoutSecond'] = 40
      }),
    ).toThrow('hook 里有认不出的项：timeoutSecond')
    expect(
      without(value => {
        ;(value['hook'] as Record<string, unknown>)['maxChars'] = 0
      }),
    ).toThrow('hook.maxChars 须为正整数')
    expect(
      without(value => {
        ;(value['hook'] as Record<string, unknown>)['enabled'] = 'off'
      }),
    ).toThrow('hook.enabled 须为 true 或 false')
  })
})
