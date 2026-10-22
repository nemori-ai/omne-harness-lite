import { Service, type Context, type Inject, type Plugin } from '@deepseek-ai/cordis'
import type {
  ContextBlockKey,
  ProducerRegistration,
  RegisterProducerResult,
  RuntimeContextOperations,
  ConsumerClass,
} from '@omne-harness/runtime-context-contract'
import { createMemoryRuntimeContext } from '@omne-harness/runtime-context-contract/testing'
import { RuntimeContextService } from '@omne-harness/runtime-context-cordis-contract/cordis'

/** A fixture provider only. The product definition imports no implementation or stand-in. */
export class Probe extends RuntimeContextService {
  readonly memory = createMemoryRuntimeContext()
  readonly consumers: (ConsumerClass | undefined)[] = []
  async registerProducer<K extends ContextBlockKey>(
    registration: ProducerRegistration<K>,
  ): Promise<RegisterProducerResult<K>> {
    let pending: Promise<RegisterProducerResult<K>> | undefined
    const dispose = this.ctx.effect(async () => {
      pending = this.memory.registerProducer(registration)
      const result = await pending
      return async () => {
        if (result.kind === 'registered') await result.handle.dispose()
      }
    })
    if (!pending) throw new Error('Effect body did not start')
    const result = await pending
    if (result.kind !== 'registered') return result
    return {
      kind: 'registered',
      handle: {
        ...result.handle,
        dispose: async () => {
          await dispose()
        },
      },
    }
  }
  prepareRegistration(...args: Parameters<RuntimeContextOperations['prepareRegistration']>) {
    return this.memory.prepareRegistration(...args)
  }
  issueEligibility(...args: Parameters<RuntimeContextOperations['issueEligibility']>) {
    return this.memory.issueEligibility(...args)
  }
  revokeEligibility(...args: Parameters<RuntimeContextOperations['revokeEligibility']>) {
    return this.memory.revokeEligibility(...args)
  }
  applyCommit(...args: Parameters<RuntimeContextOperations['applyCommit']>) {
    return this.memory.applyCommit(...args)
  }
  async bind(
    ...args: Parameters<RuntimeContextOperations['bind']>
  ): ReturnType<RuntimeContextOperations['bind']> {
    const consumer = this[Service.resolveConfig]().consumer
    this.consumers.push(consumer)
    const result = await this.memory.bind(...args)
    if (result.kind !== 'bound') return result
    if (consumer !== result.reader.consumer) {
      await result.reader.end()
      return { kind: 'refused', reason: 'unauthorized' }
    }
    return result
  }
}
export function plugin(
  name: string,
  apply: (ctx: Context) => unknown,
  inject?: Inject,
): Plugin.Object {
  const result: Plugin.Object = { name, apply }
  if (inject !== undefined) result.inject = inject
  return result
}
