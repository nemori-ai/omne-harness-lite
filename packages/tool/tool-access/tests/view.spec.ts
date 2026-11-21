import { describe, expect, it } from 'vitest'
import type { ToolTerminal } from '@omne-harness/tool-contract'
import { jsonOf, terminalView } from '../src/view.ts'

describe('terminalView', () => {
  it.each([
    [{ kind: 'completed' }, null],
    [{ kind: 'failed', cause: 'executor', diagnostic: 'exit 2' }, 'executor: exit 2'],
    [{ kind: 'unavailable', reason: 'no shell' }, 'no shell'],
    [{ kind: 'no-response', wait: 'w1', reason: 'timed out' }, 'timed out'],
    [{ kind: 'interrupted', cause: { kind: 'foreground-limit' } }, 'foreground-limit'],
  ] as const)('gives %o the detail %s', (terminal, detail) => {
    expect(terminalView(terminal as unknown as ToolTerminal)).toEqual({
      kind: terminal.kind,
      detail,
    })
  })
})

describe('jsonOf', () => {
  it('writes each plain value as its node of the JSON tree', () => {
    expect(jsonOf(null)).toEqual({ kind: 'null' })
    expect(jsonOf(undefined)).toEqual({ kind: 'null' })
    expect(jsonOf('a')).toEqual({ kind: 'string', value: 'a' })
    expect(jsonOf(false)).toEqual({ kind: 'boolean', value: false })
    expect(jsonOf(12)).toEqual({ kind: 'number', lexeme: '12' })
    expect(jsonOf([1, null])).toEqual({
      kind: 'array',
      items: [{ kind: 'number', lexeme: '1' }, { kind: 'null' }],
    })
  })

  it('keeps the members of an object in order and drops the undefined ones, as JSON text does', () => {
    expect(jsonOf({ b: 1, gone: undefined, a: { c: 'x' } })).toEqual({
      kind: 'object',
      entries: [
        { key: 'b', value: { kind: 'number', lexeme: '1' } },
        {
          key: 'a',
          value: { kind: 'object', entries: [{ key: 'c', value: { kind: 'string', value: 'x' } }] },
        },
      ],
    })
  })
})
