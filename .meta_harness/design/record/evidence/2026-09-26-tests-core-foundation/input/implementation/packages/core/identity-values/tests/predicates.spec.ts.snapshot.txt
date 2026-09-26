import { describe, expect, it } from 'vitest'
import {
  type OrganizationId,
  type ParentSnapshot,
  ancestorChain,
  parseOrganizationId,
  shareAncestor,
  unwrap,
} from '../src/index.ts'

const org = (id: string): OrganizationId => unwrap(parseOrganizationId(id))

// 一棵树：root ← company ← team；另一棵：other；两个个人组织 p1、p2；一处读不到的 broken。
const parentOf: ParentSnapshot = o => {
  switch (o as string) {
    case 'team':
      return org('company')
    case 'company':
      return org('root')
    case 'root':
    case 'other':
    case 'p1':
    case 'p2':
      return null
    case 'broken':
      return org('lost')
    case 'lost':
      return 'unavailable'
    default:
      return null
  }
}

describe('ancestorChain（S-14）', () => {
  it('不含自身，顺序从近到远', () => {
    expect(ancestorChain(org('team'), parentOf)).toEqual({ ok: [org('company'), org('root')] })
  })
  it('根的链为空', () => {
    expect(ancestorChain(org('root'), parentOf)).toEqual({ ok: [] })
  })
  it('任一跳读不到 ⇒ 明确失败，不返回截断的链（S-19）', () => {
    expect(ancestorChain(org('broken'), parentOf)).toEqual({ failure: 'unavailable' })
  })
  it('成环 ⇒ 明确失败而不是死循环', () => {
    const cyclic: ParentSnapshot = o => (o === 'a' ? org('b') : org('a'))
    expect(ancestorChain(org('a'), cyclic)).toEqual({ failure: 'cycle' })
  })
})

describe('shareAncestor（S-15）', () => {
  it('祖先与后代为真——曾经的反例「一个组织与它自己的上级」', () => {
    expect(shareAncestor(org('team'), org('company'), parentOf)).toEqual({ ok: true })
    expect(shareAncestor(org('team'), org('root'), parentOf)).toEqual({ ok: true })
  })
  it('不同树为假', () => {
    expect(shareAncestor(org('team'), org('other'), parentOf)).toEqual({ ok: false })
  })
  it('两个不同的个人组织恒为假', () => {
    expect(shareAncestor(org('p1'), org('p2'), parentOf)).toEqual({ ok: false })
  })
  it('一个组织与它自己恒为真（不构成跨组织放行依据）', () => {
    expect(shareAncestor(org('p1'), org('p1'), parentOf)).toEqual({ ok: true })
  })
  it('任一条链读不到 ⇒ 失败，不用不完整的链算出 false', () => {
    expect(shareAncestor(org('team'), org('broken'), parentOf)).toEqual({ failure: 'unavailable' })
  })
})
