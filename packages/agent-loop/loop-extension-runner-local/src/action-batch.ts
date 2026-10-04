import type {
  RunnerActionRequest,
  RunnerActionResult,
  RunnerActionSource,
  RunnerDispatchScope,
  RunnerImplementationRegistry,
  RunnerInvocationResult,
  RunnerPassResult,
  RunnerPiece,
} from '@omne-harness-lite/loop-extension-runner'
import { encodeRunnerAdmissionToken, passKeys } from '@omne-harness-lite/loop-extension-runner'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { OFFICIAL_ADMISSION_NAME } from '@omne-harness-lite/tool-admission'
import type { createAdmissionPassSource } from './admission-pass-source.ts'
import { createActionRound } from './action-round.ts'
import { createServicePorts, captureDependencyPresence } from './service-ports.ts'
import { runPass } from './run-pass.ts'

const unavailable = { failure: 'unavailable' } as const

export async function runActionBatch(input: {
  readonly request: RunnerActionRequest
  readonly source: RunnerActionSource
  readonly log: SessionLog
  readonly scope: RunnerDispatchScope
  readonly all: readonly RunnerPiece[]
  readonly registry: RunnerImplementationRegistry
  readonly passes: ReturnType<typeof createAdmissionPassSource>
  readonly active: () => boolean
  readonly signal: AbortSignal
  readonly trackInvocation: (
    work: Promise<RunnerInvocationResult>,
  ) => Promise<RunnerInvocationResult>
}): Promise<RunnerActionResult> {
  const { request, source, log, scope, all, registry, passes, active, signal, trackInvocation } =
    input
  if (!active() || scope.owner.hasUnknown(scope.binding)) return unavailable
  if (signal.aborted) return { failure: 'cancelled' }
  const chain = Object.freeze(all.filter(piece => piece.definition.position === 'before_action'))
  const officials = chain.filter(piece => piece.definition.name === OFFICIAL_ADMISSION_NAME)
  const official = officials[0]
  if (
    official &&
    (officials.length !== 1 ||
      chain.at(-1) !== official ||
      official.definition.implementation.kind !== 'builtin' ||
      official.definition.implementation.builtinName !== OFFICIAL_ADMISSION_NAME ||
      official.power !== 'veto' ||
      official.fallback !== 'admission')
  )
    return unavailable
  const contribution = registry.captureAdmission()
  const dependencies = captureDependencyPresence(scope, active)
  let dependency: 'present' | 'absent' | 'unavailable' = 'absent'
  if (official) dependency = await dependencies(official)
  if (!active() || dependency === 'unavailable') return unavailable
  if (signal.aborted) return { failure: 'cancelled' }
  const gate =
    official === undefined
      ? ({ kind: 'missing', reason: 'chain' } as const)
      : 'absent' in contribution || !contribution.isActive() || dependency === 'absent'
        ? ({ kind: 'missing', reason: 'contribution' } as const)
        : ({ kind: 'available' } as const)
  // Empty actions only arrives here after the host's full nonempty reply was checked.
  if (request.actions.length === 0) return { gate, chain, results: [], admissions: [] }
  const round =
    gate.kind === 'available' && !('absent' in contribution)
      ? createActionRound({ request, source, contribution, passes, active, signal })
      : undefined
  try {
    const results = await Promise.all(
      request.actions.map(async (subject, index): Promise<RunnerPassResult> => {
        const ports = createServicePorts({
          log,
          scope,
          all,
          registry,
          active,
          trackInvocation,
          dependencies,
          official: {
            async presence() {
              return gate.kind === 'missing' ? 'absent' : 'present'
            },
            async invoke(_piece, extensionInput, _signal, mode) {
              if (!round || extensionInput.position !== 'before_action')
                return { kind: 'notStartedUnavailable' }
              // No response owner is wired for the official ask replay in this delivery increment.
              if (mode.kind === 'replay') return { kind: 'controlUnavailable' }
              return round.arrive(index, extensionInput.subject)
            },
          },
        })
        const result = await runPass(
          {
            initial: { position: 'before_action', subject },
            anchor: request.anchors[index]!,
            execution: { kind: 'withRun', run: request.run, attempt: request.attempt },
          },
          chain,
          ports,
          signal,
        )
        round?.finish(index, result)
        return result
      }),
    )
    const failed = round?.failure() ?? results.find(result => 'failure' in result)
    if (failed && 'failure' in failed) return failed
    if (!active()) return unavailable
    if (signal.aborted) return { failure: 'cancelled' }
    const final = results as readonly Exclude<RunnerPassResult, { failure: string }>[]
    if (final.some(result => result.effect.kind === 'asked')) return { gate, chain, results: final }
    const admissions = final.map((result, index) => {
      const callId = request.actions[index]!.call.callId
      const last = result.conclusions.at(-1)
      const key =
        last === undefined
          ? undefined
          : passKeys({
              position: 'before_action',
              anchor: request.anchors[index]!,
              extension: last.extension,
              occurrence: { kind: 'final' },
            })
      if (key && 'invalidInput' in key) throw new Error('Invalid final conclusion key')
      const conclusion = key?.final
      if (
        gate.kind !== 'available' ||
        result.effect.kind !== 'proceed' ||
        last?.extension !== OFFICIAL_ADMISSION_NAME ||
        last.skipped !== undefined ||
        last.output?.kind !== 'observed'
      )
        return { callId, ...(conclusion === undefined ? {} : { conclusion }) }
      if (!('call' in result.effect.subject)) throw new Error('Invalid action effect')
      const call = result.effect.subject.call
      if (!source.toolNames.includes(call.tool))
        return { callId, ...(conclusion === undefined ? {} : { conclusion }) }
      const token = encodeRunnerAdmissionToken(call, conclusion)
      if (typeof token !== 'string') throw new Error('Invalid official admission locator')
      return { callId, token, conclusion: conclusion! }
    })
    return { gate, chain, results: final, admissions }
  } finally {
    round?.close()
  }
}
