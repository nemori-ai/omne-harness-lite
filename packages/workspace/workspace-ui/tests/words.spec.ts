import { expect, it } from 'vitest'
import { availabilityText, readRefusal, reasonText, standingText } from '../src/model/words.ts'

it('says each refusal, standing and read failure in words, and an unknown code as it is', () => {
  expect(
    [
      'not-a-participant',
      'owner-needs-none',
      'not-an-admin',
      'type-unknown',
      'occupied',
      'gone',
      'busy',
      'invalid-request',
      'brand-new',
    ].map(reasonText),
  ).toEqual([
    '对方还不是这个工作区的参与者',
    '拥有者不需要授予',
    '对方不是管理员',
    '不认识这种工作区的类型',
    '这个目录已经属于另一个工作区',
    '这个工作区已经不在了',
    '这个工作区正忙，稍后再试',
    '请求的写法不对',
    'brand-new',
  ])
  expect((['participant', 'admin', 'owner'] as const).map(standingText)).toEqual([
    '参与者',
    '管理员',
    '拥有者',
  ])
  expect(
    ['denied', 'basis-unavailable', 'protocol-rejected', 'not-found', 'odd'].map(readRefusal),
  ).toEqual(['没有权限看工作区', '工作区暂时读不到', '请求不合协议', '没有这个工作区', 'odd'])
  expect(availabilityText({ kind: 'unavailable', reason: 'busy' })).toBe(
    '用不了：这个工作区正忙，稍后再试',
  )
})
