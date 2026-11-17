import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { PointSink } from '@omne-harness/shell-contract'
import { shellKey, type defineUiModule } from '@omne-harness/shell-contract/cordis'
import { toolProtocol, type ToolProtocol } from '@omne-harness/tool-protocol'
import { CallOutputStore } from './model/call-output.ts'
import { CallOutput } from './view/call-output.tsx'

export const toolClientService = protocolServiceName({
  name: toolProtocol.name,
  major: toolProtocol.major,
})

export const CALL_OUTPUT_ID = 'tool-call-output'

/** Where the output of a call goes: the assembly hands in a point that names a call reference. */
export type ToolUiOptions = Readonly<{
  callDetail?: PointSink<{ readonly session: string; readonly call: string }>
}>

type UiModule = ReturnType<typeof defineUiModule>
type Lookup = { get(name: string): unknown }

export function createToolUiModule(options: ToolUiOptions = {}): UiModule {
  return {
    name: 'tool-ui',
    inject: [shellKey, toolClientService],
    apply(ctx) {
      const client = (ctx as unknown as Lookup).get(toolClientService) as ClientOf<ToolProtocol>
      const store = new CallOutputStore(client)
      options.callDetail?.contribute(ctx.shell, {
        id: CALL_OUTPUT_ID,
        order: 0,
        render: ({ scope, subject }) =>
          scope === undefined ? null : (
            <CallOutput store={store} tenant={scope} reference={subject.call} />
          ),
      })
    },
  }
}
