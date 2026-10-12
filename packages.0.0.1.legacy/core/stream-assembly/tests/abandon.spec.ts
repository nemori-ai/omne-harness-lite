import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { abandon } from '../src/abandon.ts'
import { accept } from '../src/index.ts'
import { closeOut, snapshot, start } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import { canonical } from './helpers.ts'

function create(target: unknown): AssemblyState {
  const result = start(target)
  if ('rejected' in result) throw new Error('fixture target rejected')
  return result.ok
}
function accepted(state: AssemblyState, event: unknown): AssemblyState {
  const result = accept(state, event)
  if ('rejected' in result) throw new Error(`fixture prefix ${result.rejected}`)
  return result.ok
}
const model = { kind: 'model_call', callId: 'mc_abandon', dispatch: 1 }
const tool = { kind: 'tool_execution', callId: 'tc_abandon' }

describe('S22/S25 abandon is the same lost finish then settlement', () => {
  it.each([model, tool])('ABANDON-EMPTY missing cause stays absent for $kind', target => {
    const state = create(target)
    const original = canonical(snapshot(state))
    expect(canonical(abandon(state))).toEqual(
      canonical(closeOut(accepted(state, { t: 'finish', reason: 'lost' }))),
    )
    const result = abandon(state)
    if ('rejected' in result) throw new Error('empty abandon rejected')
    expect(result.ok.ending).toEqual({ reason: 'lost' })
    expect(canonical(snapshot(state))).toEqual(original)
    expect(closeOut(state)).toEqual({ rejected: 'stream_not_finished' })
  })
  it('ABANDON-CAUSE preserves exact original cause/status and accepted account before loss', () => {
    let state = create(model)
    state = accepted(state, {
      t: 'account',
      usage: {
        input_tokens: 2,
        output_tokens: 3,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        source: 'upstream',
      },
      cost: { cost_usd: new LosslessNumber('0.123456789123456789'), source: 'upstream_usage' },
    })
    const reason = { cause: 'upstream_unavailable', statusCode: new LosslessNumber('503.0') }
    const result = abandon(state, reason)
    expect(canonical(result)).toEqual(
      canonical(
        closeOut(
          accepted(state, {
            t: 'finish',
            reason: 'lost',
            error: reason,
          }),
        ),
      ),
    )
    expect(writeJsonLossless(result)).toContain('"statusCode":503.0')
    expect(writeJsonLossless(result)).toContain('"cost_usd":0.123456789123456789')
    reason.cause = 'mutated'
    expect(writeJsonLossless(result)).toContain('"cause":"upstream_unavailable"')
  })
  it.each([null, 'lost', {}, { cause: 'unknown' }, { cause: 'request_rejected', extra: true }])(
    'ABANDON-MALFORMED invalid reason %# precedes already-finished and leaves state usable',
    reason => {
      const state = create(model)
      const finished = accepted(state, { t: 'finish', reason: 'end' })
      expect(abandon(state, reason)).toEqual({ rejected: 'malformed' })
      expect(abandon(finished, reason)).toEqual({ rejected: 'malformed' })
      expect(canonical(snapshot(state).position)).toEqual(canonical(0))
      expect(canonical(snapshot(finished).position)).toEqual(canonical(1))
    },
  )
  it('ABANDON-TOOL an error on a frame target is malformed before finish guard', () => {
    const state = create(tool)
    const finished = accepted(state, { t: 'finish', reason: 'end' })
    const reason = { cause: 'upstream_unavailable' }
    expect(abandon(state, reason)).toEqual({ rejected: 'malformed' })
    expect(abandon(finished, reason)).toEqual({ rejected: 'malformed' })
    expect(abandon(finished)).toEqual({ rejected: 'event_after_finish' })
  })
  it('ABANDON-FINISHED a valid model reason cannot replace the existing ending', () => {
    const state = accepted(create(model), { t: 'finish', reason: 'max_tokens' })
    const before = canonical(closeOut(state))
    expect(abandon(state)).toEqual({ rejected: 'event_after_finish' })
    expect(abandon(state, { cause: 'request_rejected' })).toEqual({
      rejected: 'event_after_finish',
    })
    expect(canonical(closeOut(state))).toEqual(before)
  })
})
