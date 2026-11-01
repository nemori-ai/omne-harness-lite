// 成员测试一步的两层顺序：快层失败时结论已定，不再跑慢层。
import { describe, expect, it } from 'vitest'
import { fastThenSlow, resumeFilesToRun } from '../src/testing/steps.ts'

function recorder(codes: Readonly<Record<'fast' | 'slow', number>>) {
  const ran: string[] = []
  const notes: string[] = []
  const run = async (tier: 'fast' | 'slow') => {
    ran.push(tier)
    return codes[tier]
  }
  return { ran, notes, run, note: (text: string) => notes.push(text) }
}

describe('快层再慢层', () => {
  it('快层失败：不跑慢层，这一步失败，并说明慢层没有跑', async () => {
    const r = recorder({ fast: 1, slow: 0 })
    expect(await fastThenSlow(r.run, r.note)).toBe(1)
    expect(r.ran).toEqual(['fast'])
    expect(r.notes.join('\n')).toContain('慢层没有跑')
  })

  it('快层通过：照跑慢层，慢层失败则这一步失败', async () => {
    const r = recorder({ fast: 0, slow: 1 })
    expect(await fastThenSlow(r.run, r.note)).toBe(1)
    expect(r.ran).toEqual(['fast', 'slow'])
    expect(r.notes).toEqual([])
  })

  it('两层都通过：这一步通过', async () => {
    const r = recorder({ fast: 0, slow: 0 })
    expect(await fastThenSlow(r.run, r.note)).toBe(0)
    expect(r.ran).toEqual(['fast', 'slow'])
  })
})

describe('接续时要单独跑的失败文件', () => {
  it('所在成员这次已整个跑过的不再单独跑，其余照跑', () => {
    const file = (member: string, name: string) => ({
      member,
      file: `${member}/tests/${name}`,
      tier: 'slow' as const,
      kind: 'timeout' as const,
      firstError: 'timed out',
    })
    const files = [file('packages/a', 'x.spec.ts'), file('tools/b', 'y.spec.ts')]
    expect(resumeFilesToRun(files, new Set(['packages/a']))).toEqual([files[1]])
    expect(resumeFilesToRun(files, new Set())).toEqual(files)
  })
})
