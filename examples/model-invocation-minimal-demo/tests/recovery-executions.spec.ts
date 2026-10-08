import { describe, expect, it } from 'vitest'
import { unwrap, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type {
  AnchoredInvocationHandle,
  ModelRuntimeCapturedExecution,
  ModelLogSettlementTarget,
  SessionRuntimeBinding,
  SettlementOwner,
} from '@omne-harness-lite/model-request-runtime'
import {
  captureExecutionInvocations,
  originalExecutionInvocation,
  releasedExecutionCalls,
} from '../src/recovery-executions.ts'

const session = unwrap(parseOpaqueIdentifier('recovery-source-session', 'SessionRef'))
const binding = {} as SessionRuntimeBinding
const owner = {} as SettlementOwner
const target = {} as ModelLogSettlementTarget

// These unit controls test selection, not physical-stop or serving-fact production.
function handle(matches: boolean): AnchoredInvocationHandle {
  return {
    observedFacts: () => (matches ? { facts: {} } : { unavailable: true }),
  } as unknown as AnchoredInvocationHandle
}
function record(
  overrides: Partial<ModelRuntimeCapturedExecution> = {},
): ModelRuntimeCapturedExecution {
  return {
    key: { session, callId: 'call' },
    session: binding,
    owner,
    executionGeneration: {},
    registered: false,
    released: true,
    copyReleased: false,
    ...overrides,
  }
}

describe('original execution selection for warm recovery', () => {
  it('captures all distinct original handles without selecting the last generation', () => {
    const old = handle(false),
      current = handle(true)
    const captured = captureExecutionInvocations([
      record({ invocation: old }),
      record({ invocation: current }),
      record({ invocation: old }),
      record({ key: { session, callId: 'without-dispatch' } }),
    ])
    expect(captured.get('call')).toEqual(new Set([old, current]))
    expect(captured.has('without-dispatch')).toBe(false)
    expect(originalExecutionInvocation(captured.get('call')!, target)).toBe(current)
  })

  it('preserves the original single-handle path but refuses absent or ambiguous multi-handle facts', () => {
    const unavailable = handle(false),
      matching = handle(true),
      otherMatch = handle(true)
    expect(originalExecutionInvocation(new Set([unavailable]), target)).toBe(unavailable)
    expect(originalExecutionInvocation(new Set(), target)).toBeUndefined()
    expect(
      originalExecutionInvocation(new Set([unavailable, handle(false)]), target),
    ).toBeUndefined()
    expect(originalExecutionInvocation(new Set([matching, otherMatch]), target)).toBeUndefined()
    expect(originalExecutionInvocation(new Set([matching, unavailable]), target)).toBe(matching)
  })

  it('requires exact released bindings and preserves logical calls across different physical generations', () => {
    const first = record(),
      second = record()
    expect(releasedExecutionCalls([first, second], session, binding, owner)).toEqual(
      new Set(['call']),
    )
    for (const wrong of [
      record({ released: false }),
      record({ session: {} as SessionRuntimeBinding }),
      record({ owner: {} as SettlementOwner }),
      record({
        key: {
          session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
          callId: 'call',
        },
      }),
    ])
      expect(releasedExecutionCalls([wrong], session, binding, owner)).toBeUndefined()
    expect(
      releasedExecutionCalls(
        [first, record({ executionGeneration: first.executionGeneration })],
        session,
        binding,
        owner,
      ),
    ).toBeUndefined()
    expect(releasedExecutionCalls([first], session, undefined, owner)).toBeUndefined()
  })
})
