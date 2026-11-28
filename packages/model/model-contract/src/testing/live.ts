import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ConformanceCall, ConformanceLive } from '../conformance/conformance-types.ts'
import { decodeModelCallId } from '../identity-values.ts'
import type { LiveCommandOutcome, LivePhaseRefusal, MediaWrite } from '../live-call.ts'
import type { ModelModality } from '../profile.ts'
import type { ControlState, ModelFailure } from '../result.ts'
import type { ModelCallId, ModelOperationId } from '../root.ts'

type Phase = 'admitted' | 'open' | 'closing' | 'settled'
type LiveState = {
  phase: Phase
  /** Whether this process holds the live body of the call. */
  body: boolean
  control: ControlState
  readonly commands: Map<ModelOperationId, LiveCommandOutcome | 'pending'>
}

const NOT_FOUND: ModelFailure = { kind: 'invalid', field: 'call', reason: 'not-found' }
const MODALITY: ModelFailure = { kind: 'invalid', field: 'content', reason: 'modality' }
const ELSEWHERE: ModelFailure = {
  kind: 'unavailable',
  dependency: 'live-call',
  diagnostic: 'not-in-this-process',
}
const phase = (reason: LivePhaseRefusal): ModelFailure => ({
  kind: 'invalid',
  field: 'phase',
  reason,
})
const REFUSAL: Readonly<Record<'admitted' | 'closing', LivePhaseRefusal>> = {
  admitted: 'not-open',
  closing: 'closing',
}
/** The call runs, and its live body is in another process. */
const elsewhere = (state: LiveState) =>
  (state.phase === 'open' || state.phase === 'closing') && !state.body

const MODALITY_OF: Readonly<Record<ContentBlock['kind'], ModelModality | null>> = {
  text: 'text',
  thinking: 'text',
  image: 'image',
  voice: 'voice',
  file: null,
}

/** A live call surface that answers as the contract says, in memory, for one tenant; the test drives its upstream. */
export function createLiveDouble<P>(
  input: Readonly<{ tenant: TenantId; input?: readonly ModelModality[] }>,
): ConformanceLive<P> {
  const takes: readonly ModelModality[] = input.input ?? ['text', 'voice']
  const taken = (block: ContentBlock) => {
    const modality = MODALITY_OF[block.kind]
    return modality !== null && takes.includes(modality)
  }
  const calls = new Map<ModelCallId, LiveState>()
  const stateOf = (tenant: TenantId, call: ModelCallId) =>
    tenant === input.tenant ? calls.get(call) : undefined
  const must = (target: ConformanceCall) => {
    const state = stateOf(target.tenant, target.call)
    if (state === undefined) throw new Error(`no live call ${target.call}`)
    return state
  }
  return {
    calls: {
      async command({ tenant, call, operation, command }) {
        const state = stateOf(tenant, call)
        if (state === undefined) return fail(NOT_FOUND)
        if (!command.content.every(taken)) return fail(MODALITY)
        if (state.phase === 'settled') return fail(phase('settled'))
        if (elsewhere(state)) return fail(ELSEWHERE)
        const seen = state.commands.get(operation)
        if (seen !== undefined) return succeed({ state: 'seen', outcome: seen })
        if (state.phase !== 'open') return fail(phase(REFUSAL[state.phase]))
        state.commands.set(operation, 'pending')
        return succeed({ state: 'taken' })
      },
      async end({ tenant, call, operation }) {
        const state = stateOf(tenant, call)
        if (state === undefined) return fail(NOT_FOUND)
        if (state.phase === 'admitted') return fail(phase('not-open'))
        if (state.phase === 'open') {
          state.control = {
            kind: 'requested',
            intent: 'end',
            operation,
            propagation: 'pending',
            upstream: 'unknown',
          }
          state.phase = 'closing'
        }
        return succeed(state.control)
      },
      async media({ tenant, call }) {
        const state = stateOf(tenant, call)
        if (state === undefined) return fail(NOT_FOUND)
        if (elsewhere(state)) return fail(ELSEWHERE)
        return succeed({
          write(frame): MediaWrite {
            if (!takes.includes(frame.modality)) return { refused: 'modality' }
            return state.phase === 'open' && state.body ? 'sent' : 'dropped'
          },
          frames: (async function* () {})(),
          release() {},
        })
      },
    },
    async admit(label) {
      const decoded = decodeModelCallId(`mcall_cf-live-${label}`)
      if (!('ok' in decoded)) throw new Error(`no call identity for ${label}`)
      calls.set(decoded.ok, {
        phase: 'admitted',
        body: false,
        control: { kind: 'none' },
        commands: new Map(),
      })
      return { tenant: input.tenant, call: decoded.ok }
    },
    async upstream(target) {
      const state = must(target)
      if (target.step === 'open' && state.phase === 'admitted') {
        state.phase = 'open'
        state.body = true
      }
      if (target.step === 'close') {
        state.phase = 'settled'
        state.body = false
      }
    },
    async loseBody(target) {
      must(target).body = false
    },
  }
}
