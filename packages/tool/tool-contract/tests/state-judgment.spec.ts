import { describe, expect, it } from 'vitest'
import type { Outcome } from '@omne-harness/kernel-basis'
import {
  decodeToolCallId,
  decodeToolInstanceId,
  decodeToolOperationId,
  decodeToolResultVersion,
  decodeToolRevision,
  decodeToolWaitId,
  judgeToolState,
  type ToolState,
} from '@omne-harness/tool-contract'
import { evidence } from './tool-values.ts'

function decoded<T>(outcome: Outcome<T, unknown>): T {
  if (!('ok' in outcome)) throw new Error('fixture identity')
  return outcome.ok
}

const call = decoded(decodeToolCallId('call-1'))

function running(): ToolState {
  return {
    call,
    revision: decoded(decodeToolRevision('r7')),
    source: evidence('state'),
    foreground: null,
    effect: { kind: 'unknown', diagnostic: 'running' },
    execution: { kind: 'live', start: decoded(decodeToolOperationId('start-1')) },
    timing: { kind: 'paused', accumulatedMs: '1500' },
    queue: { kind: 'held', key: 'tenant/session/read_file', ordinal: '3' },
    controls: [],
    delivery: null,
    supplements: [],
    phase: 'running',
    instance: decoded(decodeToolInstanceId('instance-1')),
    relation: 'foreground',
    wait: {
      kind: 'ask',
      wait: decoded(decodeToolWaitId('wait-1')),
      card: evidence('card'),
      resume: evidence('resume'),
      decision: null,
    },
  }
}

function settledInBackground(): ToolState {
  const {
    instance: _instance,
    wait: _wait,
    ...rest
  } = running() as Extract<ToolState, { phase: 'running' }>
  return {
    ...rest,
    phase: 'settled',
    relation: 'background',
    wait: { kind: 'none' },
    foreground: { kind: 'background', call, reason: 'user' },
    effect: { kind: 'occurred', evidence: evidence('effect') },
    execution: { kind: 'ended', evidence: evidence('ended') },
    result: decoded(decodeToolResultVersion('result-1')),
    terminal: { kind: 'completed' },
  }
}

function rejection(value: unknown) {
  const judged = judgeToolState(value)
  if ('ok' in judged) throw new Error('the state was accepted')
  return judged.failure
}

describe('state judgment', () => {
  it('state judgment: accepts a running foreground state that waits for an answer', () => {
    const state = running()
    const judged = judgeToolState(state)
    expect(judged).toEqual({ ok: state })
    if ('ok' in judged) expect(Object.isFrozen(judged.ok)).toBe(true)
  })

  it('state judgment: accepts a settled background state with its placeholder', () => {
    expect(judgeToolState(settledInBackground())).toEqual({ ok: settledInBackground() })
  })

  it('state judgment: rejects no-response as the terminal of a background execution', () => {
    const state = {
      ...settledInBackground(),
      terminal: { kind: 'no-response', wait: 'wait-1', reason: 'gone' },
    }
    expect(rejection(state)).toEqual({ field: 'terminal.kind', reason: 'value' })
  })

  it('state judgment: rejects an Ask wait in the background', () => {
    const state = {
      ...running(),
      relation: 'background',
      foreground: { kind: 'background', call, reason: 'user' },
    }
    expect(rejection(state)).toEqual({ field: 'wait.kind', reason: 'value' })
  })

  it('state judgment: rejects an unknown field, a malformed identity and a non-canonical decimal', () => {
    expect(rejection({ ...running(), note: 'x' })).toEqual({
      field: 'note',
      reason: 'unknown-field',
    })
    expect(rejection({ ...running(), call: 'call 1' })).toEqual({
      field: 'call',
      reason: 'character',
    })
    expect(rejection({ ...running(), timing: { kind: 'paused', accumulatedMs: '015' } })).toEqual({
      field: 'timing.accumulatedMs',
      reason: 'decimal',
    })
    expect(rejection(null)).toEqual({ field: 'ToolState', reason: 'type' })
  })

  it('state judgment: rejects a background placeholder of another call', () => {
    const other = decoded(decodeToolCallId('call-2'))
    const state = {
      ...settledInBackground(),
      foreground: { kind: 'background', call: other, reason: 'user' },
    }
    expect(rejection(state)).toEqual({ field: 'foreground.call', reason: 'call-mismatch' })
  })

  it('state judgment: rejects a background relation without its placeholder', () => {
    expect(rejection({ ...settledInBackground(), foreground: null })).toEqual({
      field: 'foreground',
      reason: 'missing-background-placeholder',
    })
  })

  it('state judgment: accepts unavailable only for an execution that never started', () => {
    const neverStarted = {
      ...settledInBackground(),
      terminal: { kind: 'unavailable', reason: 'revoked' },
      execution: { kind: 'not-started' },
      effect: { kind: 'not-started' },
    }
    expect(judgeToolState(neverStarted)).toEqual({ ok: neverStarted })
    const start = decoded(decodeToolOperationId('start-1'))
    for (const execution of [
      { kind: 'ended', evidence: evidence('ended') },
      { kind: 'live', start },
      { kind: 'starting', start },
    ])
      expect(rejection({ ...neverStarted, execution })).toEqual({
        field: 'execution',
        reason: 'unavailable-after-start',
      })
  })

  it('state judgment: rejects an unavailable terminal whose effect is not not-started', () => {
    const state = {
      ...settledInBackground(),
      terminal: { kind: 'unavailable', reason: 'revoked' },
      execution: { kind: 'not-started' },
    }
    expect(rejection(state)).toEqual({ field: 'effect', reason: 'unavailable-with-effect' })
  })

  it('state judgment: keeps accepting the legal states next to the unavailable rule', () => {
    const {
      instance: _instance,
      wait: _wait,
      ...common
    } = running() as Extract<ToolState, { phase: 'running' }>
    const acceptedInBackground = {
      ...common,
      phase: 'accepted',
      relation: 'background',
      wait: { kind: 'none' },
      foreground: { kind: 'background', call, reason: 'user' },
      effect: { kind: 'not-started' },
      execution: { kind: 'not-started' },
      queue: { kind: 'none' },
    }
    const foregroundFinal = {
      ...settledInBackground(),
      relation: 'foreground',
      foreground: { kind: 'final', result: decoded(decodeToolResultVersion('result-1')) },
    }
    const rejectedResume = {
      ...settledInBackground(),
      terminal: { kind: 'interrupted', reason: 'interruption' },
      execution: { kind: 'suspended', checkpoint: evidence('checkpoint') },
    }
    for (const state of [acceptedInBackground, foregroundFinal, rejectedResume])
      expect(judgeToolState(state)).toEqual({ ok: state })
  })

  it('state judgment: rejects a hostile value without throwing', () => {
    const hostile = new Proxy(running(), {
      getOwnPropertyDescriptor: () => {
        throw new Error('trap')
      },
    })
    expect(rejection(hostile)).toEqual({ field: 'ToolState', reason: 'unreadable' })
  })
})
