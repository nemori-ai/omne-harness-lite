import { describe, expect, it } from 'vitest'
import type { ToolState, ToolTerminal } from '@omne-harness/tool-contract'
import type { ProgramPosition } from '@omne-harness/tool-contract/provider'
import { childState, jsonOf, terminalView, type ChildProgress } from '../src/view.ts'

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

describe('childState', () => {
  const at = (rest: object) => ({ ordinal: 1, ...rest }) as unknown as ProgramPosition
  const phase = (name: string, terminal?: string) =>
    ({ phase: name, terminal: { kind: terminal } }) as unknown as ToolState
  const handed = at({ state: 'handed', background: false })

  it.each([
    [at({ state: 'registered' }), 'waiting'],
    [at({ state: 'excluded', exclusion: { kind: 'denied', reason: '' } }), 'denied'],
    [at({ state: 'excluded', exclusion: { kind: 'not-accepted', reason: '' } }), 'failed'],
    [at({ state: 'excluded', exclusion: { kind: 'unavailable', reason: '' } }), 'failed'],
    [at({ state: 'excluded', exclusion: { kind: 'closed', reason: '' } }), 'stopped'],
    [at({ state: 'retained', terminal: { kind: 'completed' } }), 'completed'],
    [at({ state: 'retained', terminal: { kind: 'failed' } }), 'failed'],
    [at({ state: 'retained', terminal: { kind: 'unavailable' } }), 'failed'],
    [at({ state: 'retained', terminal: { kind: 'interrupted' } }), 'stopped'],
    [at({ state: 'retained', terminal: { kind: 'no-response' } }), 'unknown'],
  ] as const)('reads %o as %s whatever its call is doing', (position, word) => {
    expect(childState(position, 'unread')).toBe(word)
    expect(childState(position, phase('running'))).toBe(word)
  })

  it.each([
    ['missing', 'queued'],
    ['unread', 'unknown'],
    [phase('accepted'), 'queued'],
    [phase('preparing'), 'queued'],
    [phase('queued'), 'queued'],
    [phase('starting'), 'running'],
    [phase('running'), 'running'],
    [phase('suspended'), 'waiting'],
    [phase('settled', 'completed'), 'completed'],
    [phase('settled', 'interrupted'), 'stopped'],
  ] as const)('reads a handed position whose call is %o as %s', (progress, word) => {
    expect(childState(handed, progress as ChildProgress)).toBe(word)
  })

  it('reads a position in the background as background, and a stop of unknown progress as unknown', () => {
    const background = at({ state: 'handed', background: true, stop: 'unknown' })
    expect(childState(background, phase('running'))).toBe('background')
    const stopping = at({ state: 'handed', background: false, stop: 'unknown' })
    expect(childState(stopping, phase('running'))).toBe('unknown')
    const accepted = at({ state: 'handed', background: false, stop: 'accepted' })
    expect(childState(accepted, phase('running'))).toBe('running')
  })
})
