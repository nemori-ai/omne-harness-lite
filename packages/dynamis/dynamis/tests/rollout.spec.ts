import { describe, expect, it } from 'vitest'
import { empty, mint, noMint, placedBy, retire, standing, supersede } from '../src/index.ts'
import { entry, inst, mustInstall } from './support.ts'

describe('mint：代数每个 fiber 只增不减（DY-12）', () => {
  it('从 1 起，每次加一，各个 fiber 各数各的', () => {
    const first = mint(noMint, 'a')
    const second = mint(first.minted, 'a')
    const other = mint(second.minted, 'b')
    expect([first.instance, second.instance, other.instance]).toEqual([
      inst('a', 1),
      inst('a', 2),
      inst('b', 1),
    ])
    expect(other.minted).toEqual({ a: 2, b: 1 })
    expect(noMint).toEqual({})
  })

  it('发过的不重复：从同一个值发两次得到同一代，调用方要保存发完之后的值', () => {
    const { minted } = mint(noMint, 'a')
    expect(mint(minted, 'a').instance).toEqual(mint(minted, 'a').instance)
    expect(Object.isFrozen(minted)).toBe(true)
  })

  it('200 次随机地发：每个 fiber 发出的代数严格递增', () => {
    let minted = noMint
    const last = new Map<string, number>()
    for (let at = 0; at < 200; at += 1) {
      const fiber = ['a', 'b', 'c'][(at % 7) % 3] as string
      const made = mint(minted, fiber)
      expect(made.instance.generation).toBe((last.get(fiber) ?? 0) + 1)
      last.set(fiber, made.instance.generation)
      minted = made.minted
    }
  })
})

describe('supersede：换代是一步，旧的变正在撤下，新的装上（DY-3）', () => {
  const old = inst('a', 1)
  const next = inst('a', 2)
  const before = mustInstall(empty, old, [entry('host.point', 'k', { digest: 'v1' })])
  const fresh = [entry('host.point', 'k', { digest: 'v2' })]

  it('旧的在服务、同一个 fiber、新的代更大：成立', () => {
    const outcome = supersede(before, old, next, fresh)
    expect(outcome.kind).toBe('installed')
    if (outcome.kind !== 'installed') return
    expect(standing(outcome.registry, old)).toBe('retiring')
    expect(standing(outcome.registry, next)).toBe('serving')
    expect(placedBy(outcome.registry, old).map(placed => placed.digest)).toEqual(['v1'])
    expect(placedBy(outcome.registry, next).map(placed => placed.digest)).toEqual(['v2'])
  })

  it('不是同一个 fiber：拒绝 different-fiber', () => {
    expect(supersede(before, old, inst('b', 2), fresh)).toMatchObject({
      kind: 'refused',
      reason: 'different-fiber',
    })
  })

  it.each([1, 0])('新的代不更大（%i）：拒绝 not-newer', generation => {
    expect(supersede(before, old, inst('a', generation), fresh)).toMatchObject({
      kind: 'refused',
      reason: 'not-newer',
    })
  })

  it('旧的不在服务：拒绝 old-not-serving', () => {
    const refused = { kind: 'refused', reason: 'old-not-serving' }
    expect(supersede(retire(before, old), old, next, fresh)).toMatchObject(refused)
    expect(supersede(empty, old, next, fresh)).toMatchObject(refused)
  })

  it('新的一代的条目不合法：拒绝 invalid，旧的仍在服务', () => {
    const outcome = supersede(before, old, next, [entry('bad', 'k')])
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'invalid' })
    expect(standing(before, old)).toBe('serving')
  })

  it('每一种拒绝都带一句原因', () => {
    const refusals = [
      supersede(before, old, inst('b', 2), fresh),
      supersede(before, old, inst('a', 1), fresh),
      supersede(empty, old, next, fresh),
    ]
    expect(refusals.map(outcome => outcome.kind === 'refused' && outcome.detail)).toEqual([
      'b#2 is not a generation of a',
      'generation 1 does not follow generation 1',
      'a#1 is absent',
    ])
  })
})
