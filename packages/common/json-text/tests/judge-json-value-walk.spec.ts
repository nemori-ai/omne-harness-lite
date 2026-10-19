import { expect, it } from 'vitest'
import { judgeJsonValue } from '@omne-harness/json-text'

const nil = { kind: 'null' }

it('rejects an object that holds itself as an entry value, at the field that points back', () => {
  const self: { kind: 'object'; entries: unknown[] } = { kind: 'object', entries: [] }
  self.entries.push({ key: 'a', value: self })
  expect(judgeJsonValue(self)).toEqual({ rejected: 'cycle', path: ['entries', 0, 'value'] })
})

it('rejects an object that holds an ancestor object, at the field that points back', () => {
  const top: { kind: 'object'; entries: unknown[] } = { kind: 'object', entries: [] }
  const middle = {
    kind: 'object',
    entries: [
      { key: 'k', value: nil },
      { key: 'back', value: top },
    ],
  }
  top.entries.push({ key: 'down', value: middle })
  expect(judgeJsonValue(top)).toEqual({
    rejected: 'cycle',
    path: ['entries', 0, 'value', 'entries', 1, 'value'],
  })
})

it('rejects undefined at the root as a type, not as unreadable', () => {
  expect(judgeJsonValue(undefined)).toEqual({ rejected: 'type', path: [] })
})

it('rejects a kind that is a list whose text is a kind name, and does not run its toString', () => {
  const calls: string[] = []
  const kind = Object.assign(['null'], {
    toString: () => {
      calls.push('toString')
      return 'null'
    },
  })
  expect(judgeJsonValue({ kind })).toEqual({ rejected: 'value', path: ['kind'] })
  expect(calls).toEqual([])
})

function revokedList(): unknown {
  const { proxy, revoke } = Proxy.revocable([], {})
  revoke()
  return proxy
}

it('rejects a revoked Proxy under items as unreadable, not as a type', () => {
  const value = { kind: 'array', items: revokedList() }
  expect(judgeJsonValue(value)).toEqual({ rejected: 'unreadable', path: [] })
})

it('rejects a revoked Proxy under entries as unreadable, not as a type', () => {
  const value = { kind: 'object', entries: revokedList() }
  expect(judgeJsonValue(value)).toEqual({ rejected: 'unreadable', path: [] })
})
