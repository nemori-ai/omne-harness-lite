import type {
  ExecutionRef,
  ModelOperationId,
  ModelTransport,
  SendDemand,
} from '@omne-harness/model-contract'
import type { SendResources } from '../send.ts'
import { digest, invalid, tenantKey, unavailable } from './value.ts'

export type TestSendPlan<Script> = Readonly<{
  execution: ExecutionRef
  dispatch: SendDemand<never>['dispatch']
  admission: ModelOperationId
  script: Script
}>
export type TransportCounters = Readonly<{
  prepare: number
  materialize: number
  start: number
  closePrepared: number
  closeMaterialized: number
}>
export type ScriptFactory<Script> = (script: Script) => {
  transport: ModelTransport
  counts(): TransportCounters
}
/** Script selection and transport acquisition only. The product owns all command sequencing. */
export function scriptedSendResources<P, Script>(
  scripts: readonly TestSendPlan<Script>[],
  makeTransport: ScriptFactory<Script>,
  admission: (input: SendDemand<P>) => Promise<ModelOperationId | null>,
) {
  const key = (input: Pick<SendDemand<P>, 'tenant' | 'call' | 'dispatch'>) => {
    const tenant = tenantKey(input.tenant)
    if (typeof tenant !== 'string') throw new TypeError('send plan requires a valid tenant')
    return JSON.stringify([tenant, input.call, input.dispatch])
  }
  const plans = new Map<string, TestSendPlan<Script>>()
  const counts = new Map<string, (() => TransportCounters)[]>()
  for (const plan of scripts) {
    const id = key({ ...plan.execution, dispatch: plan.dispatch })
    if (plans.has(id)) throw new TypeError('duplicate send plan')
    plans.set(id, {
      ...plan,
      execution: { ...plan.execution },
      script: structuredClone(plan.script),
    })
  }
  const resources: SendResources<P> = {
    async acquire(input) {
      const id = key(input)
      const plan = plans.get(id)
      if (
        !plan ||
        digest({ instance: plan.execution.instance, generation: plan.execution.generation }) !==
          digest({ instance: input.execution.instance, generation: input.execution.generation })
      )
        return { failure: unavailable('model-send', 'no-plan') }
      if ((await admission(input)) !== plan.admission)
        return { failure: invalid('admission', 'send-plan-binding') }
      const source = makeTransport(plan.script)
      counts.set(id, [...(counts.get(id) ?? []), source.counts])
      let owned: import('@omne-harness/model-contract').MaterializedTransport | undefined
      let secret: string | undefined
      return {
        ok: {
          transport: {
            async prepare(request, supplier, dispatch) {
              const result = await source.transport.prepare(request, supplier, dispatch)
              if ('failure' in result) return result
              return {
                ok: {
                  close: () => result.ok.close(),
                  async materialize(signal) {
                    const resultMaterialized = await result.ok.materialize(signal)
                    if ('ok' in resultMaterialized) owned = resultMaterialized.ok
                    return resultMaterialized
                  },
                },
              }
            },
          },
          startWithCredential(materialized, value, signal) {
            if (materialized !== owned || secret !== undefined)
              throw new Error('foreign materialization')
            secret = value
            try {
              return materialized.start(signal)
            } finally {
              secret = undefined
            }
          },
          async release() {
            owned = undefined
            secret = undefined
          },
        },
      }
    },
  }
  return {
    resources,
    control: {
      counts(input: Pick<SendDemand<P>, 'tenant' | 'call' | 'dispatch'>): TransportCounters {
        const result = {
          prepare: 0,
          materialize: 0,
          start: 0,
          closePrepared: 0,
          closeMaterialized: 0,
        }
        for (const count of counts.get(key(input)) ?? []) {
          const row = count()
          for (const field of Object.keys(result) as (keyof TransportCounters)[])
            result[field] += row[field]
        }
        return result
      },
    },
  }
}
