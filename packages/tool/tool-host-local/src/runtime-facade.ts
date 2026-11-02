import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolRuntimeFacade, type ToolDependencies } from '@omne-harness/tool'
import type {
  ToolStreamDelta,
  ToolStreamEnd,
  ToolStreamObservation,
  ToolStreamSnapshot,
} from '@omne-harness/tool-contract'
import type { StreamFrame } from '@omne-harness/stream-arrival'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import type { DeliveryPosition } from './result-delivery.ts'
import type { LocalToolRuntimeInput } from './runtime-composition.ts'
import type { ToolEnvironmentValue } from './author-environment.ts'

function managedObservation(
  ctx: Context,
  observation: ToolStreamObservation<unknown>,
): ToolStreamObservation<unknown> {
  type Frame = StreamFrame<ToolStreamSnapshot, ToolStreamDelta, ToolStreamEnd>
  return {
    observe(input) {
      const controller = new AbortController()
      const source = observation
        .observe({ ...input, signal: AbortSignal.any([input.signal, controller.signal]) })
        [Symbol.asyncIterator]()
      const returning = Promise.withResolvers<IteratorResult<Frame>>()
      let returned = false
      return {
        [Symbol.asyncIterator]() {
          return this
        },
        next() {
          return returned
            ? Promise.resolve({ done: true as const, value: undefined })
            : Promise.race([source.next(), returning.promise])
        },
        async return() {
          if (!returned) {
            returned = true
            controller.abort()
            returning.resolve({ done: true, value: undefined })
            void Promise.resolve(source.return?.()).catch(() =>
              ctx
                .logger('tool-runtime')
                .warn('Observation cleanup failed; error text is withheld.'),
            )
          }
          return { done: true as const, value: undefined }
        },
      }
    },
  }
}

export function publishRuntimeFacade(
  ctx: Context,
  input: LocalToolRuntimeInput,
  dependencies: ToolDependencies<unknown, ToolMessageContentBlock, ToolEnvironmentValue>,
  receivers: { current: DeliveryPosition<unknown, ToolMessageContentBlock>['receiver'] },
): void {
  const runtime = createToolRuntimeFacade(dependencies, input.configuration)
  class Runtime extends ToolRuntimeService<unknown, ToolMessageContentBlock> {
    invoke = runtime.invoke
    inspect = runtime.inspect
    queries = runtime.queries
    commands = runtime.commands
    instances = runtime.instances
    observation = managedObservation(ctx, runtime.observation)
    content = runtime.content
    catalog = runtime.catalog
    receiver: DeliveryPosition<unknown, ToolMessageContentBlock>['receiver'] = async consumer => {
      const receiver = this.resultReceiver(consumer.owner)
      return receiver === undefined
        ? fail({
            kind: 'unavailable',
            dependency: 'tool-result-receiver',
            diagnostic: 'The original consumer is absent.',
          })
        : succeed(receiver)
    }
  }
  const service = new Runtime(ctx)
  receivers.current = consumer => service.receiver(consumer)
  ctx.effect(() => () => {
    receivers.current = async () =>
      fail({
        kind: 'unavailable',
        dependency: 'toolRuntime',
        diagnostic: 'The receiver registry is retired.',
      })
  })
}
