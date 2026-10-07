import type { CallKey } from '@omne-harness-lite/model-request-runtime-local'
import type {
  ModelFailureExecution,
  ModelRuntimeOperations,
} from '@omne-harness-lite/model-request-runtime'

export async function inspectFailure(
  service: ModelRuntimeOperations,
  key: CallKey,
  execution: ModelFailureExecution,
) {
  const answer = await service.readAttempts(key, { consumeFailure: true })
  if (answer.consumption.kind !== 'failure') return answer.result
  const source = answer.consumption.source
  try {
    return source.verify(source.subject, execution)
  } finally {
    source.release()
  }
}
