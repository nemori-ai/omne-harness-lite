import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolRuntimeFacade, type ToolDependencies } from '@omne-harness/tool'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import type { DeliveryPosition } from './result-delivery.ts'
import type { LocalToolRuntimeInput } from './runtime-composition.ts'
import type { ToolEnvironmentValue } from './author-environment.ts'

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
    observation = runtime.observation
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
