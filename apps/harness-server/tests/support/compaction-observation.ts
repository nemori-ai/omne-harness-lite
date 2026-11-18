import type { Context } from '@deepseek-ai/cordis'
import {
  agentCompactionKey,
  agentReceivedCommitsKey,
  agentMaterialsKey,
  agentRequestsKey,
  agentJournalKey,
  agentMessageHandoffKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  modelPreparationResourcesKey,
  modelRequestPreparationKey,
  modelRuntimeKey,
} from '@omne-harness/model-cordis-contract/cordis'

export function observeCompactionFailures(scope: Context) {
  const failures: { operation: string; failure: unknown }[] = []
  for (const [key, methods] of [
    [agentCompactionKey, ['admit', 'inspect', 'acknowledge']],
    [agentReceivedCommitsKey, ['commit', 'query']],
    [agentMaterialsKey, ['read']],
    [agentRequestsKey, ['prepare', 'assessCompaction', 'resume']],
    [agentJournalKey, ['commit']],
    [agentMessageHandoffKey, ['prepare', 'lookup']],
    [modelPreparationResourcesKey, ['acquire']],
    [modelRequestPreparationKey, ['prepare']],
    [modelRuntimeKey, ['calls.admit', 'consumption.acknowledge']],
  ] as const) {
    const service = scope.get(key)
    if (service === undefined) throw new Error(`the release has no ${key}`)
    for (const path of methods) {
      const [first, second] = path.split('.')
      if (first === undefined) throw new Error('empty observation path')
      const method = second ?? first
      let target: unknown = second === undefined ? service : Reflect.get(service, first)
      if (typeof target !== 'object' || target === null)
        throw new Error(`${key}.${path} has no owner`)
      if (second !== undefined && Object.isFrozen(target)) {
        target = { ...target }
        if (!Reflect.set(service, first, target))
          throw new Error(`${key}.${first} cannot be observed`)
      }
      if (typeof target !== 'object' || target === null)
        throw new Error(`${key}.${path} has no owner`)
      const receiver = target
      const original: unknown = Reflect.get(target, method)
      if (typeof original !== 'function') throw new Error(`${key}.${method} is missing`)
      const installed = Reflect.set(target, method, async (...args: unknown[]) => {
        const answer: unknown = await Reflect.apply(original, receiver, args)
        if (
          typeof answer === 'object' &&
          answer !== null &&
          'failure' in answer &&
          failures.length < 20
        )
          failures.push({ operation: `${key}.${path}`, failure: answer.failure })
        return answer
      })
      if (!installed) throw new Error(`${key}.${path} cannot be observed`)
    }
  }
  return failures
}
