import { existsSync } from 'node:fs'
import { expect, it } from 'vitest'
import { scratch } from './support.ts'

let created = ''

it('scratch 给出一个存在的目录', () => {
  created = scratch()
  expect(existsSync(created)).toBe(true)
})

it('用例结束后 scratch 的目录已删除', () => {
  expect(created).not.toBe('')
  expect(existsSync(created)).toBe(false)
})
