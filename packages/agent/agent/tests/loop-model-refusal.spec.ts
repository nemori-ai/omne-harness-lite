// R2-D237: what M6 does with an admission that the Model does not accept. A definite refusal
// (denied, invalid, unsupported, capacity) is the failure candidate `model-refused`, and F1 ends the
// run with it: the original call and the Model's refusal are readable in the candidate. An
// unavailable Model is a dependency wait at M6 with its owner; the wake at the check time admits the
// same call again, and the run goes on to its reply. The scripted Model and the memory Journal are
// the only providers; nothing here proves a real provider or a durable Journal.
import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type { EffectIntent, FinishCandidateContent } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelFailure } from '@omne-harness/model-contract'
import { fail } from '@omne-harness/operation-result'
import { execution, ok, type Principal, loadWithEntries } from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly, type LoopAssembly } from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

const REFUSALS: readonly ModelFailure[] = [
  { kind: 'capacity', required: { bytes: '1000000', blocks: '20', attachmentBytes: '0' } },
  { kind: 'denied', action: 'admit' },
  { kind: 'invalid', field: 'request', reason: 'tools[0].name' },
  {
    kind: 'unsupported',
    field: 'request.tools',
    adapter: { owner: 'model', name: 'adapter', revision: '1', digest: 'd' },
  },
]

const UNAVAILABLE: ModelFailure = {
  kind: 'unavailable',
  dependency: 'model-records',
  diagnostic: 'storage is closed',
}

const SHARE_FULL: ModelFailure = {
  kind: 'unavailable',
  dependency: 'model-capacity',
  diagnostic: 'the share of the tenant is full',
}

/**
 * The dependencies with `admit` answering `answer` for its first `times` calls, and the effect
 * intents and F1 candidates of the commits recorded. Later calls reach the scripted Model.
 */
function refusing(
  answer: ModelFailure,
  times: number,
  finishes: FinishCandidateContent[],
  effects: EffectIntent[] = [],
) {
  return (d: Dependencies): Dependencies => {
    let calls = 0
    return {
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit(input) {
            calls += 1
            return calls <= times ? Promise.resolve(fail(answer)) : d.models.calls.admit(input)
          },
        },
      },
      journal: {
        ...d.journal,
        commit(input) {
          if (input.finish !== null) finishes.push(input.finish)
          effects.push(...input.effects)
          return d.journal.commit(input)
        },
      },
    }
  }
}

async function read(assembly: LoopAssembly) {
  return await loadWithEntries(assembly.controls.journal.provider, {
    ...alice,
    execution: execution(),
  })
}

describe('M6 with an admission the Model does not accept (R2-D237)', () => {
  it.each(REFUSALS)(
    'ends the run with the model-refused failure of the original call ($kind)',
    async refusal => {
      const finishes: FinishCandidateContent[] = []
      const effects: EffectIntent[] = []
      const assembly = await loopAssembly(
        [execution()],
        refusing(refusal, Infinity, finishes, effects),
      )
      assembly.release.open()
      ok(await invoke(assembly))
      await eventually(async () => (await read(assembly)).state.kind === 'ended')
      const ended = await read(assembly)
      expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
      // The candidate names the call M0 recorded and keeps the Model's refusal as it is.
      expect(finishes).toHaveLength(1)
      expect(finishes[0]?.conclusion.kind).toBe('fail')
      const candidate = finishes[0]?.failure
      expect(candidate).toMatchObject({ kind: 'model-refused', step: 'step-1', failure: refusal })
      const [effect] = effects
      if (candidate?.kind !== 'model-refused' || effect?.pending.kind !== 'model')
        throw new Error('the model-refused candidate and the recorded call are required')
      expect(effect.pending.reference).toContain(candidate.call)
      expect(candidate.source).toEqual(effect.pending.fixed)
      // The refused call leaves no continuation, and no received entry was ever written.
      expect(ended.checkpoint.calls).toEqual([])
      expect(ended.entries ?? []).toEqual([])
    },
  )

  // model-contract "按租户的串行区与公平": a tenant share that is full now answers unavailable
  // with the dependency model-capacity; the run waits and completes like any other unavailable.
  it.each([UNAVAILABLE, SHARE_FULL])(
    'waits at M6 on an unavailable Model ($dependency), names its owner, and admits the same call again after the check time',
    async answer => {
      const finishes: FinishCandidateContent[] = []
      const admits: string[] = []
      const assembly = await loopAssembly([execution()], d => {
        const wrapped = refusing(answer, 1, finishes)(d)
        return {
          ...wrapped,
          models: {
            ...wrapped.models,
            calls: {
              ...wrapped.models.calls,
              admit(input) {
                admits.push(`${input.call}/${input.operation}`)
                return wrapped.models.calls.admit(input)
              },
            },
          },
        }
      })
      assembly.release.open()
      ok(await invoke(assembly))
      await eventually(async () => (await read(assembly)).state.kind === 'waiting')
      const waiting = await read(assembly)
      expect(waiting.checkpoint.position).toBe('M6')
      expect(waiting.state).toEqual({
        kind: 'waiting',
        waits: [{ kind: 'dependency', owner: 'modelRuntime', position: 'M6' }],
      })
      expect(admits).toHaveLength(1)
      // The dependency comes back; the check time wakes the run, which admits the same call.
      await eventually(async () => assembly.controls.clock.pending().length > 0)
      const due = assembly.controls.clock.pending()[0]
      if (due === undefined) throw new Error('the check time is required')
      ok(assembly.controls.clock.advanceTo(due))
      await eventually(async () => (await read(assembly)).state.kind === 'ended')
      expect((await read(assembly)).state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: 'complete' },
      })
      expect(admits).toHaveLength(2)
      expect(admits[1]).toBe(admits[0])
      expect(finishes.map(finish => finish.failure)).toEqual([null])
    },
  )
})
