import type { ModelFailureSource } from '@omne-harness-lite/model-request-runtime-local'
import type { RunnerLogBinding, RunnerPorts } from '@omne-harness-lite/loop-extension-runner'

export function failurePort(
  source: ModelFailureSource,
  paired: RunnerLogBinding,
): RunnerPorts['verifyFailure'] {
  return async (subject, binding, execution) => {
    if (
      binding !== paired ||
      subject.position !== 'after_model_call' ||
      subject.dimension.ending !== 'failure' ||
      !('dispatches' in subject.subject)
    )
      return { kind: 'unavailable' }
    if (execution.kind !== 'withRun') return { kind: 'invalidInput' }
    const verified = source.verify(subject.subject, {
      run: execution.run,
      attempt: execution.attempt,
    })
    if ('invalidInput' in verified) return { kind: 'invalidInput' }
    if ('unavailable' in verified) return { kind: 'unavailable' }
    return {
      kind: 'verified',
      subject: {
        position: 'after_model_call',
        dimension: { ending: 'failure' },
        subject: verified.authoritativeSubject,
      },
      release: source.release,
    }
  }
}
