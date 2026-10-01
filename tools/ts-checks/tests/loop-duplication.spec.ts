// 重复代码传感器走真实的 jscpd 核心库：同时是「经 createRequire 加载 4.0.1 的做法在当前 Node 下还活着」的探针。
import { describe, expect, it } from 'vitest'
import { detectDuplication } from '../src/loop/sensors/duplication.ts'

const BODY = Array.from(
  { length: 12 },
  (_, i) => `  const value${i} = compute(input, ${i}) + other.field${i} * factor;`,
).join('\n')
const options = { minTokens: 50, minLines: 5 }

describe('重复代码', () => {
  it('两个成员里各有一段相同的函数体：找到跨成员的克隆，两端的行区间与占比都对', async () => {
    const a = `export function alpha(input, other, factor) {\n${BODY}\n  return value1\n}\n`
    const b = `// header\n\nexport function beta(input, other, factor) {\n${BODY}\n  return value2\n}\n`
    const result = await detectDuplication(
      [
        { path: 'packages/core/a/src/a.ts', text: a },
        { path: 'packages/infra/b/src/b.ts', text: b },
      ],
      options,
    )
    expect(result.clones).toHaveLength(1)
    const [clone] = result.clones
    expect(clone?.crossMember).toBe(true)
    const ends = [clone?.a, clone?.b].map(end => `${end?.path}:${end?.start}-${end?.end}`).sort()
    expect(ends).toEqual(['packages/core/a/src/a.ts:1-14', 'packages/infra/b/src/b.ts:3-16'])
    expect(result.members.find(m => m.member === 'packages/core/a')).toMatchObject({
      lines: 15,
      duplicatedLines: 14,
      percent: 93.3,
    })
    expect(result.lines).toBe(32)
    expect(result.duplicatedLines).toBe(28)
    expect(result.percent).toBe(87.5)
  })

  it('同一个成员里的重复也算，排在跨成员的后面', async () => {
    // jscpd 把后出现的片段与最先存下的那一份配对；文件按路径排序后 a.ts 最先。
    const one = `export function alpha(input, other, factor) {\n${BODY}\n  return value1\n}\n`
    const result = await detectDuplication(
      [
        { path: 'packages/zz/c/src/c.ts', text: one.replace('alpha', 'delta') },
        { path: 'packages/core/a/src/b.ts', text: one.replace('alpha', 'gamma') },
        { path: 'packages/core/a/src/a.ts', text: one },
      ],
      options,
    )
    expect(result.clones.map(clone => clone.crossMember)).toEqual([true, false])
  })

  it('没有重复：没有克隆，占比为 0', async () => {
    const result = await detectDuplication(
      [
        { path: 'packages/core/a/src/a.ts', text: 'export const a = 1\n' },
        { path: 'packages/core/b/src/b.ts', text: 'export const b = 2\n' },
      ],
      options,
    )
    expect(result.clones).toEqual([])
    expect(result.percent).toBe(0)
  })

  it('短于 minLines 的相同片段不算', async () => {
    const short = 'export function f(a, b) { return compute(a, b) + other(a) * factor(b) - 1 }\n'
    const result = await detectDuplication(
      [
        { path: 'packages/core/a/src/a.ts', text: short },
        { path: 'packages/core/b/src/b.ts', text: short },
      ],
      { minTokens: 5, minLines: 5 },
    )
    expect(result.clones).toEqual([])
  })
})
