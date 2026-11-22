import { describe, expect, it } from 'vitest'
import { readCall, readObserve, writeCall, writeObserve } from '../src/shared/wire.ts'

const protocol = { name: 'notes', major: 1 }
const body = { kind: 'object', entries: [] } as const

describe('桥的消息带着页面一侧的契约修订号', () => {
  it('调用：写出来的消息里有修订号，读回来还是它', () => {
    const text = writeCall({ protocol, operation: 'read', messageId: 'm-1', revision: 3, body })
    expect(JSON.parse(text)).toEqual({
      protocol,
      operation: 'read',
      messageId: 'm-1',
      revision: 3,
      body: {},
    })
    expect(readCall(text)).toEqual({
      protocol,
      operation: 'read',
      messageId: 'm-1',
      revision: 3,
      body,
    })
  })

  it('观察：同样带着', () => {
    const text = writeObserve({
      protocol,
      observation: 'watch',
      messageId: 'm-1',
      revision: 2,
      open: body,
    })
    expect(JSON.parse(text).revision).toBe(2)
    expect(readObserve(text)?.revision).toBe(2)
  })

  it('没有修订号的消息照旧读得出，读出来没有这一项：旧的页面不带它', () => {
    const call =
      '{"protocol":{"name":"notes","major":1},"operation":"read","messageId":"m-1","body":{}}'
    expect(readCall(call)).toEqual({ protocol, operation: 'read', messageId: 'm-1', body })
    expect(writeCall({ protocol, operation: 'read', messageId: 'm-1', body })).toBe(call)
    const observe =
      '{"protocol":{"name":"notes","major":1},"observation":"watch","messageId":"m-1","open":{}}'
    expect(readObserve(observe)).toEqual({
      protocol,
      observation: 'watch',
      messageId: 'm-1',
      open: body,
    })
  })

  it.each(['0', '-1', '1.5', '"2"', 'null', '9007199254740993'])(
    '修订号是 %s 的消息读不出，不当成没带',
    revision => {
      const call = `{"protocol":{"name":"notes","major":1},"operation":"read","messageId":"m-1","revision":${revision},"body":{}}`
      expect(readCall(call)).toBeUndefined()
      const observe = `{"protocol":{"name":"notes","major":1},"observation":"watch","messageId":"m-1","revision":${revision},"open":{}}`
      expect(readObserve(observe)).toBeUndefined()
    },
  )
})
