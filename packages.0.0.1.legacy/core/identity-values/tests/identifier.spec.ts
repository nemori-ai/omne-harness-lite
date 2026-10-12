import { describe, expect, it } from 'vitest'
import { generateOpaqueIdentifier, parseAccountId } from '../src/index.ts'

describe('不透明标识生成（G-04 候选：128 位、小写 base32 无填充）', () => {
  it('26 个小写 base32 字符，通过 S-31 词法', () => {
    const id = generateOpaqueIdentifier()
    expect(id).toMatch(/^[a-z2-7]{26}$/)
    expect('ok' in parseAccountId(id)).toBe(true)
  })
  it('一万次不重复（随机性只是辅助，唯一性由存储主键兑现）', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 10_000; i += 1) seen.add(generateOpaqueIdentifier())
    expect(seen.size).toBe(10_000)
  })
})
